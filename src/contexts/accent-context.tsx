import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  ACCENTS,
  DEFAULT_ACCENT,
  toAccentName,
  type AccentName,
  type AccentTokens,
} from '@/constants/accents';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * Which accent the app is wearing, for everything inside the tree.
 *
 * This is a context rather than a hook over useAuth() for one reason: the
 * optimistic write. Tapping a colour in Settings has to repaint the whole app
 * on the tap, not after the round trip to Supabase — and a per-instance
 * override (which is how useComfort does it) would repaint only the component
 * that made the call. One shared piece of state means the tab bar, the cards
 * and the picker itself all move together.
 */
interface AccentContextValue {
  /** The chosen accent's name — what the picker highlights. */
  name: AccentName;
  /** Its tokens. The same object identity for the lifetime of a choice, so
   *  it is safe in a dependency array. */
  tokens: AccentTokens;
  setAccent: (name: AccentName) => Promise<void>;
  /** Set when the last write failed; the optimistic value has been rolled
   *  back and the app is wearing whatever the profile still says. */
  error: string | null;
}

const AccentContext = createContext<AccentContextValue>({
  name: DEFAULT_ACCENT,
  tokens: ACCENTS[DEFAULT_ACCENT],
  setAccent: async () => {},
  error: null,
});

export function AccentProvider({ children }: { children: ReactNode }) {
  const { user, profile, refreshProfile } = useAuth();
  const [override, setOverride] = useState<AccentName | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stamped per write so a slow round trip cannot clear an override that a
  // later tap has already replaced. Only ever touched inside setAccent, never
  // during render — the React Compiler rejects ref writes in a render body.
  const writeSeqRef = useRef(0);

  // Before the profile resolves — the auth screen, the pulse loader — this is
  // the default. AuthGate holds the tab shell back until `profile !== undefined`,
  // so a user who has chosen teal never sees a porcelain flash of their own
  // app; only the signed-out screens, which have nothing personal on them.
  const name = override ?? toAccentName(profile?.accent);

  const setAccent = useCallback(
    async (next: AccentName) => {
      if (!user) return;
      const seq = ++writeSeqRef.current;
      setError(null);
      setOverride(next);

      const { error: writeError } = await supabase
        .from('profiles')
        .update({ accent: next })
        .eq('id', user.id);

      const isLatest = () => seq === writeSeqRef.current;
      if (writeError) {
        if (isLatest()) {
          setOverride(null);
          setError('Could not save that. Please try again.');
        }
        return;
      }

      await refreshProfile();
      // Only clear if nothing newer has been chosen in the meantime, or the
      // app would snap back to the profile's value mid-way through a second tap.
      if (isLatest()) setOverride(null);
    },
    [user, refreshProfile],
  );

  const value = useMemo(
    () => ({ name, tokens: ACCENTS[name], setAccent, error }),
    [name, setAccent, error],
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

/** The chosen accent's tokens. The common case — use this for inline styles,
 *  SVG props and anything passed to a native component. */
export function useAccent(): AccentTokens {
  return useContext(AccentContext).tokens;
}

/** Just the name. Cheaper for the style-sheet lookup, and what the picker
 *  needs to show a tick. */
export function useAccentName(): AccentName {
  return useContext(AccentContext).name;
}

/** The picker's half of the context. */
export function useAccentChoice(): Pick<AccentContextValue, 'name' | 'setAccent' | 'error'> {
  const { name, setAccent, error } = useContext(AccentContext);
  return { name, setAccent, error };
}
