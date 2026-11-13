import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The tip deck: one card on Today per app open, from the day after sign-up.
 *
 * Agreed rules (2026-11-14):
 *
 * - Nothing on day one beyond setup. Tips start once setup is finished AND it
 *   is a later local calendar day than the account was created.
 * - One tip per open (lib/tips/app-open.ts says what an open is). The same
 *   tip stays for the whole of that open.
 * - Acting on a tip, or "Not now", retires it for good. A card that comes back
 *   after being declined is a nag.
 * - Ignoring a tip (an open where it showed and nothing was pressed) sends it
 *   to the bottom of the deck. Ignored a second time, it is retired.
 * - Triggered tips (a first pattern, a baseline, ...) jump ahead of the fixed
 *   order the moment they become eligible — unless they have already been
 *   ignored once, in which case they wait their turn like the rest.
 * - A tip whose feature is already in use is skipped (eligibility is decided
 *   by use-tip-deck.ts, not here).
 *
 * Stored on the phone, per account. Losing it (a reinstall) means at worst
 * seeing a tip again; nothing about it needs to sync.
 */

export type TipId =
  | 'lock' | 'comfort' | 'colour' | 'events' | 'checkInAnytime' | 'yourData'
  | 'firstPattern' | 'baseline' | 'prepare' | 'morningBody';

/** The fixed order. */
export const FIXED_TIPS: TipId[] = ['lock', 'comfort', 'colour', 'events', 'checkInAnytime', 'yourData'];
/** Jump the queue when eligible. Among themselves, this order. */
export const TRIGGERED_TIPS: TipId[] = ['firstPattern', 'baseline', 'prepare', 'morningBody'];

export interface DeckState {
  /** Every tip, front to back. Ignoring one moves it to the end. */
  order: TipId[];
  /** Acted on, declined, or ignored twice. Never shown again. */
  retired: TipId[];
  ignores: Partial<Record<TipId, number>>;
  /** The tip on screen during an open, so the next open can tell if it was ignored. */
  shown: { tip: TipId; openId: number } | null;
}

export const EMPTY_DECK: DeckState = {
  order: [...FIXED_TIPS, ...TRIGGERED_TIPS],
  retired: [],
  ignores: {},
  shown: null,
};

const key = (userId: string) => `symetric.tips.v1.${userId}`;

export async function loadDeck(userId: string): Promise<DeckState> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return EMPTY_DECK;
    const saved = JSON.parse(raw) as Partial<DeckState>;
    // Tips added in a later version join the end of the deck.
    const order = (saved.order ?? []).filter(t => EMPTY_DECK.order.includes(t));
    for (const t of EMPTY_DECK.order) if (!order.includes(t)) order.push(t);
    return { order, retired: saved.retired ?? [], ignores: saved.ignores ?? {}, shown: saved.shown ?? null };
  } catch {
    return EMPTY_DECK;
  }
}

export async function saveDeck(userId: string, deck: DeckState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(deck));
  } catch (e) {
    console.warn('[tips] save failed:', e);
  }
}

/**
 * Settles the previous open. A tip still on record from an earlier open was
 * neither acted on nor declined (either would have retired it): it was ignored.
 */
export function settleOpen(deck: DeckState, openId: number): DeckState {
  const shown = deck.shown;
  if (!shown || shown.openId === openId) return deck;
  if (deck.retired.includes(shown.tip)) return { ...deck, shown: null };

  const ignores = { ...deck.ignores, [shown.tip]: (deck.ignores[shown.tip] ?? 0) + 1 };
  if (ignores[shown.tip]! >= 2) {
    return { ...deck, ignores, retired: [...deck.retired, shown.tip], shown: null };
  }
  return {
    ...deck,
    ignores,
    order: [...deck.order.filter(t => t !== shown.tip), shown.tip],
    shown: null,
  };
}

/** The tip for this open, given which tips are currently eligible. */
export function pickTip(deck: DeckState, openId: number, eligible: Set<TipId>): TipId | null {
  const live = (t: TipId) => eligible.has(t) && !deck.retired.includes(t);
  if (deck.shown?.openId === openId && live(deck.shown.tip)) return deck.shown.tip;

  const jumping = TRIGGERED_TIPS.find(t => live(t) && !deck.ignores[t]);
  if (jumping) return jumping;
  return deck.order.find(live) ?? null;
}

export function markShown(deck: DeckState, tip: TipId, openId: number): DeckState {
  if (deck.shown?.tip === tip && deck.shown.openId === openId) return deck;
  return { ...deck, shown: { tip, openId } };
}

export function retire(deck: DeckState, tip: TipId): DeckState {
  return {
    ...deck,
    retired: deck.retired.includes(tip) ? deck.retired : [...deck.retired, tip],
    shown: deck.shown?.tip === tip ? null : deck.shown,
  };
}

/** "Later" on a triggered tip: the same as ignoring it, but at once. */
export function defer(deck: DeckState, tip: TipId): DeckState {
  const ignores = { ...deck.ignores, [tip]: (deck.ignores[tip] ?? 0) + 1 };
  const base = { ...deck, ignores, shown: deck.shown?.tip === tip ? null : deck.shown };
  if (ignores[tip]! >= 2) return { ...base, retired: [...deck.retired, tip] };
  return { ...base, order: [...deck.order.filter(t => t !== tip), tip] };
}
