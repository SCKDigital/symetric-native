import { useEffect, useState } from 'react';

import { getMinutesRemaining } from '@/lib/edit-window';

/**
 * Whole minutes left in the ten-minute edit window, refreshed every 60
 * seconds. Returns 0 once closed. Ported from the web app's
 * useEditWindowCountdown.ts, including the once-a-minute tick: minute-level
 * precision is all a ten-minute window needs, and a per-second interval would
 * re-render the whole Today screen sixty times as often for no visible gain.
 */
export function useEditWindowCountdown(completedAt: string | Date | null): number {
  const [minutesRemaining, setMinutesRemaining] = useState(() =>
    completedAt ? getMinutesRemaining(completedAt) : 0
  );

  useEffect(() => {
    if (!completedAt) return;

    // Syncing to wall-clock time, which is exactly what this rule can't model:
    // useState's initialiser covers mount, but `completedAt` also arrives late
    // (null while today's check-ins load, then a timestamp), and without this
    // re-read the affordance would stay hidden until the first 60s tick. Same
    // documented escape hatch as use-today-check-ins.ts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinutesRemaining(getMinutesRemaining(completedAt));

    const interval = setInterval(() => {
      const remaining = getMinutesRemaining(completedAt);
      setMinutesRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 60_000);

    return () => clearInterval(interval);
  }, [completedAt]);

  // Read through `completedAt` rather than zeroing the state when it goes
  // away, so there's no stale count left behind and nothing to reset.
  return completedAt ? minutesRemaining : 0;
}
