import type { ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { isOnline, useIsOnline } from '@/lib/offline/connectivity';

// What the app does with anything that can't work without the server.
//
// Logging works offline (see lib/offline/outbox.ts); most other things don't:
// changing a setting, an appointment, comfort mode, signing in. Without these,
// those controls either failed with an error that talked about the
// connection or, worse, appeared to work and silently didn't. The rule is
// that something unavailable offline says so, in the same words everywhere.

export const OFFLINE_TITLE = 'Unavailable offline';

/**
 * Wraps a handler for something that needs the server. Offline, it explains
 * instead of running. Checked at the moment of the tap, not render, so a
 * control rendered while online can't slip through after the connection drops.
 */
export function guardOnline<A extends unknown[]>(
  fn: (...args: A) => unknown,
  what = 'This',
): (...args: A) => void {
  return (...args: A) => {
    if (!isOnline()) {
      Alert.alert(OFFLINE_TITLE, `${what} needs a connection. Try again once you’re back online.`);
      return;
    }
    fn(...args);
  };
}

/**
 * A section that needs the server to change anything in it. Offline it stays
 * visible, so the person can still read their current settings, but is dimmed,
 * can't be touched, and is labelled.
 */
export function RequiresConnection({ children }: { children: ReactNode }) {
  const online = useIsOnline();
  if (online) return <>{children}</>;
  return (
    <View>
      <Text style={styles.caption}>{OFFLINE_TITLE}</Text>
      <View pointerEvents="none" style={styles.dimmed} accessibilityState={{ disabled: true }}>
        {children}
      </View>
    </View>
  );
}

/** In place of something with nothing to show offline: a screen never loaded
 *  online, a chart whose data comes from the server. */
export function OfflineUnavailable({ detail }: { detail: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{OFFLINE_TITLE}</Text>
      <Text style={styles.meta}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 12, fontWeight: '500', color: '#7886a0', marginBottom: 6, marginLeft: 4 },
  dimmed: { opacity: 0.4 },
  card: {
    backgroundColor: '#0d1014', borderWidth: 1, borderColor: '#1b2029', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '500', color: '#97a1b4' },
  meta: { fontSize: 13, color: '#7886a0', marginTop: 2, lineHeight: 18 },
});
