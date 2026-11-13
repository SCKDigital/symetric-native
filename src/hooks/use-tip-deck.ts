import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import type { SetupCardState } from '@/hooks/use-setup-cards';
import { DEFAULT_ACCENT } from '@/constants/accents';
import { IS_DEMO, supabase } from '@/lib/supabase';
import { useAppOpenId } from '@/lib/tips/app-open';
import {
  defer, loadDeck, markShown, pickTip, retire, saveDeck, settleOpen,
  type DeckState, type TipId,
} from '@/lib/tips/deck';

/** The Prepare tip waits until there is something worth taking to an appointment. */
const PREPARE_FROM_DAY = 18;

export interface TipDeck {
  tip: TipId | null;
  /** Acted on or "Not now": gone for good, and nothing else this open. */
  retire: () => void;
  /** "Later" on a triggered tip: back of the deck, nothing else this open. */
  defer: () => void;
}

/** Whole local days since the account was created. */
function daysSince(createdAt: string): number {
  // Calendar arithmetic on local date parts, not a re-parsed date string:
  // string parsing is where Hermes and V8 have disagreed before. An
  // unparseable createdAt gives NaN, which fails every ">=" check — no tips,
  // never a crash.
  const c = new Date(createdAt);
  const n = new Date();
  const created = Date.UTC(c.getFullYear(), c.getMonth(), c.getDate());
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((today - created) / 86_400_000);
}

/** True when the query finds at least one row. A failed read counts as unknown → null. */
async function exists(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<boolean | null> {
  try {
    const { data, error } = await q;
    if (error) return null;
    return (data ?? []).length > 0;
  } catch {
    return null;
  }
}

/**
 * Which tip Today shows this open, if any. Rules in lib/tips/deck.ts.
 *
 * Eligibility is "the feature isn't already in use", read fresh once per
 * open. A read that fails (offline, say) makes that tip ineligible for this
 * open rather than guessing — the cost is a tip a little later, never a tip
 * about something they already do.
 */
/**
 * suppressed: Today is showing something that should not have a tip above it
 * (comfort mode, a snoozed check-in). Nothing is picked, so nothing counts as
 * shown, and the open is not held against the tip.
 */
export function useTipDeck(setup: SetupCardState, suppressed: boolean): TipDeck {
  const { user, profile } = useAuth();
  const openId = useAppOpenId();
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [eligible, setEligible] = useState<Set<TipId> | null>(null);
  // One tip per open: once one is answered, nothing replaces it until the next.
  const [answeredOpen, setAnsweredOpen] = useState<number | null>(null);
  const deckRef = useRef<DeckState | null>(null);

  const setupDone = !setup.loading && !setup.anyOutstanding;
  const pastDayOne = !!profile?.created_at && daysSince(profile.created_at) >= 1;
  const active = !IS_DEMO && !!user && !!profile && setupDone && pastDayOne;

  const commit = useCallback((next: DeckState) => {
    deckRef.current = next;
    setDeck(next);
    if (user) saveDeck(user.id, next);
  }, [user]);

  // Load the deck and settle the previous open.
  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    loadDeck(user.id).then(loaded => {
      if (cancelled) return;
      commit(settleOpen(loaded, openId));
    });
    return () => { cancelled = true; };
  }, [active, user, openId, commit]);

  // Work out which tips apply, once per open.
  useEffect(() => {
    if (!active || !user || !profile) return;
    let cancelled = false;
    (async () => {
      const uid = user.id;
      const [anyEvent, anyBonus, anyCluster, anyConnection, rollingBaseline, anyAppointment] = await Promise.all([
        exists(supabase.from('intervention_markers').select('id').eq('user_id', uid).neq('marker_type', 'cycle_phase').limit(1)),
        exists(supabase.from('check_ins').select('id').eq('user_id', uid).eq('status', 'completed').is('scheduled_date', null).limit(1)),
        exists(supabase.from('detected_clusters').select('id').eq('user_id', uid).limit(1)),
        exists(supabase.from('domain_connections').select('id').eq('user_id', uid).limit(1)),
        exists(supabase.from('baselines').select('id').eq('user_id', uid).eq('source', 'rolling_median').limit(1)),
        exists(supabase.from('appointments').select('id').eq('user_id', uid).limit(1)),
      ]);
      if (cancelled) return;

      // Anyone who answered the old "Lock it, or quieten it" setup card has
      // already been offered both.
      const answeredOldCard = !setup.needsPreferences;
      const set = new Set<TipId>();
      if (!profile.app_lock_enabled && !answeredOldCard) set.add('lock');
      if (!profile.comfort_mode && !answeredOldCard) set.add('comfort');
      // The column can't say whether the default was chosen or just kept, so
      // only someone who has already changed it is treated as having seen it.
      if ((profile.accent ?? DEFAULT_ACCENT) === DEFAULT_ACCENT) set.add('colour');
      if (anyEvent === false) set.add('events');
      if (anyBonus === false) set.add('checkInAnytime');
      set.add('yourData');
      if (anyCluster === true || anyConnection === true) set.add('firstPattern');
      if (rollingBaseline === true) set.add('baseline');
      if (anyAppointment === false && daysSince(profile.created_at) >= PREPARE_FROM_DAY) set.add('prepare');
      if (profile.body_tracking_enabled && profile.body_setup_complete && !profile.body_morning_enabled) {
        set.add('morningBody');
      }
      setEligible(set);
    })();
    return () => { cancelled = true; };
    // Re-decided per open, not on every profile refresh: a tip mustn't vanish
    // mid-preview because the thing it offers just got switched on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user?.id, openId]);

  const tip = active && !suppressed && deck && eligible && answeredOpen !== openId
    ? pickTip(deck, openId, eligible)
    : null;

  // Record what's on screen, so the next open can tell it was ignored.
  // Stored only: nothing on screen depends on it, so it doesn't re-render.
  useEffect(() => {
    if (!tip || !deckRef.current || !user) return;
    const next = markShown(deckRef.current, tip, openId);
    if (next !== deckRef.current) {
      deckRef.current = next;
      saveDeck(user.id, next);
    }
  }, [tip, openId, user]);

  return {
    tip,
    retire: () => {
      if (!tip || !deckRef.current) return;
      commit(retire(deckRef.current, tip));
      setAnsweredOpen(openId);
    },
    defer: () => {
      if (!tip || !deckRef.current) return;
      commit(defer(deckRef.current, tip));
      setAnsweredOpen(openId);
    },
  };
}
