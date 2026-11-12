import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsOnline } from '@/lib/offline/connectivity';
import { discardFailed, retryFailed, useOutbox } from '@/lib/offline/outbox';

function entries(n: number) {
  return n === 1 ? '1 entry' : `${n} entries`;
}

/**
 * The one line on Today that says what offline mode is doing. Absent whenever
 * there is nothing to say — online with nothing waiting is the normal case,
 * and it shouldn't cost a pixel.
 *
 * Exists mainly so nobody deletes the app on a plane believing their entries
 * are already safe on the server. Quiet on purpose: offline isn't an error,
 * and the same grey card as the comfort-mode banner rather than anything
 * that reads as a warning. Only a rejected entry gets actions.
 */
export default function SyncStatusBanner() {
  const online = useIsOnline();
  const { pendingCount, failedCount } = useOutbox();

  if (failedCount > 0) {
    const confirmDiscard = () => Alert.alert(
      `Discard ${entries(failedCount)}?`,
      'They were saved on this phone but the server wouldn’t accept them. Discarding removes them for good.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { discardFailed(); } },
      ],
    );
    return (
      <View style={styles.banner}>
        <View style={styles.text}>
          <Text style={styles.title}>{entries(failedCount)} couldn’t sync</Text>
          <Text style={styles.meta}>The server didn’t accept {failedCount === 1 ? 'it' : 'them'}.</Text>
        </View>
        <Pressable onPress={() => { retryFailed(); }} accessibilityRole="button" hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.action}>Retry</Text>
        </Pressable>
        <Pressable onPress={confirmDiscard} accessibilityRole="button" hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.action}>Discard</Text>
        </Pressable>
      </View>
    );
  }

  if (!online) {
    return (
      <View style={styles.banner}>
        <View style={styles.text}>
          <Text style={styles.title}>Offline</Text>
          <Text style={styles.meta}>
            {pendingCount > 0
              ? `${entries(pendingCount)} will sync when you’re back online`
              : 'Anything you log will sync when you’re back online'}
          </Text>
        </View>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={styles.banner}>
        <View style={styles.text}>
          <Text style={styles.title}>Syncing</Text>
          <Text style={styles.meta}>{entries(pendingCount)} waiting to send</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#0d1014', borderWidth: 1, borderColor: '#1b2029', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 18, marginBottom: 16,
  },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '500', color: '#97a1b4' },
  meta: { fontSize: 13, color: '#7886a0', marginTop: 2 },
  action: { fontSize: 14, fontWeight: '500', color: '#8b94a8' },
  pressed: { opacity: 0.7 },
});
