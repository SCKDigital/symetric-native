import { StyleSheet, Text, View } from 'react-native';

/**
 * Says that a screen is showing the copy saved the last time it loaded online,
 * and from when. Insights and Prepare are worked out from the server's data, so
 * offline they can't move. Showing that copy undated would pass old findings
 * off as current, and showing nothing would look broken.
 */
export default function OfflineSnapshotNote({ savedAt, what, extra }: { savedAt?: string; what: string; extra?: string }) {
  const when = savedAt
    ? ` from ${new Date(savedAt).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })}`
    : ' as last loaded';
  return (
    <View style={styles.note}>
      <Text style={styles.title}>Offline</Text>
      <Text style={styles.meta}>
        Showing {what}{when}. {extra ?? 'New entries count once they sync.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: '#0d1014', borderWidth: 1, borderColor: '#1b2029', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 18, marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '500', color: '#97a1b4' },
  meta: { fontSize: 13, color: '#7886a0', marginTop: 2 },
});
