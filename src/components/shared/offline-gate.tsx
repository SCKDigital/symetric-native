import { Alert, StyleSheet, Text, View } from 'react-native';

import { isOnline } from '@/lib/offline/connectivity';

// What the app does with anything that can't work without the server.
//
// Nearly everything works offline: entries, settings, appointments, flags all
// go through the outbox (lib/offline/outbox.ts). What's left genuinely needs
// the server at that moment: signing in, onboarding consent, push
// registration, export, deletes, the report, web links. Those say so, in the
// same words everywhere, rather than failing with a connection error.

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
  card: {
    backgroundColor: '#0d1014', borderWidth: 1, borderColor: '#1b2029', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '500', color: '#97a1b4' },
  meta: { fontSize: 13, color: '#7886a0', marginTop: 2, lineHeight: 18 },
});
