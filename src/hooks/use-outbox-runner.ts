import { useEffect } from 'react';
import { AppState } from 'react-native';

import { subscribeOnline, isOnline } from '@/lib/offline/connectivity';
import { flush, getOutboxSnapshot, loadOutbox, onSynced, subscribeOutbox } from '@/lib/offline/outbox';
import { forcePatternDetection } from '@/lib/pattern-detection-scheduler';

const RETRY_MS = 30_000;

const detectionListeners = new Set<() => void>();

/** Called when detection has re-run after a sync — the moment Insights'
 *  findings, which are computed from the server's data, are worth re-reading. */
export function onDetectionAfterSync(listener: () => void): () => void {
  detectionListeners.add(listener);
  return () => { detectionListeners.delete(listener); };
}

/**
 * Keeps the outbox moving for the signed-in account. Mounted once, in the
 * root layout.
 *
 * Sends whatever is waiting when: the account loads, the connection comes
 * back, the app returns to the foreground, and every 30 seconds while
 * something is still waiting and the app is open. The timer covers the case
 * NetInfo can't see — "connected" to a network that isn't passing traffic.
 *
 * Also owns the detection re-run after a sync. Insights work from the
 * server's data, so an entry only counts once it has arrived there; running
 * detection here, after the send, rather than on each screen's save means an
 * entry made offline is picked up as soon as it lands instead of waiting for
 * tomorrow's throttle window.
 */
export function useOutboxRunner(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let detecting = false;
    let detectAgain = false;

    const runDetection = async () => {
      if (detecting) { detectAgain = true; return; }
      detecting = true;
      try {
        do {
          detectAgain = false;
          await forcePatternDetection(userId).catch(e => console.error('[outbox] detection after sync:', e));
        } while (detectAgain);
      } finally {
        detecting = false;
      }
      detectionListeners.forEach(l => l());
    };

    loadOutbox(userId).then(() => flush());

    const offSynced = onSynced(() => { runDetection(); });
    const offOnline = subscribeOnline(() => { if (isOnline()) flush(); });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') flush();
    });

    let timer: ReturnType<typeof setInterval> | null = null;
    const syncTimer = () => {
      const waiting = getOutboxSnapshot().pendingCount > 0;
      if (waiting && !timer) {
        timer = setInterval(() => {
          if (AppState.currentState === 'active') flush();
        }, RETRY_MS);
      } else if (!waiting && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const offOutbox = subscribeOutbox(syncTimer);
    syncTimer();

    return () => {
      offSynced();
      offOnline();
      offOutbox();
      appStateSub.remove();
      if (timer) clearInterval(timer);
    };
  }, [userId]);
}
