import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CompletionStepProps {
  onComplete: () => Promise<void>;
  windowDeferred?: boolean;
}

// Ported from the web app's CompletionStep.tsx — straight port, no
// native-only mechanics.
export default function CompletionStep({ onComplete, windowDeferred = false }: CompletionStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleComplete = async () => {
    setLoading(true);
    setError('');
    try {
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>You’re all set</Text>

        <View style={styles.body}>
          <Text style={styles.bodyText}>
            Symetric will prompt you to log throughout the day - takes about 20 seconds each time, scoped to the
            domains you just picked. The pattern data builds gradually.
          </Text>
          <Text style={[styles.bodyText, styles.bodyTextMuted]}>
            Your data is stored securely and never shared. You can export or delete it any time from Settings.
          </Text>
        </View>

        {windowDeferred && (
          <View style={styles.deferredBox}>
            <Text style={styles.deferredText}>
              Since you’re getting started later in your active window, we’ve skipped today’s scheduled check-ins.
              Your regular check-ins begin tomorrow - but you can check in now to help build your baseline.
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable onPress={handleComplete} disabled={loading} style={({ pressed }) => pressed && !loading && styles.pressed}>
          <View style={[styles.button, loading && styles.buttonDisabled]}>
            {loading ? <ActivityIndicator color="#64748b" /> : <Text style={styles.buttonText}>Begin</Text>}
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 32 },
  body: { gap: 16, marginBottom: 48 },
  bodyText: { fontSize: 15, color: '#cbd5e1', lineHeight: 24 },
  bodyTextMuted: { fontSize: 13, color: '#94a3b8' },
  deferredBox: { marginBottom: 24, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#1e2533', backgroundColor: '#0f1420' },
  deferredText: { fontSize: 14, lineHeight: 22, color: '#64748b' },
  errorBox: { padding: 12, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, marginBottom: 24 },
  errorText: { fontSize: 14, color: '#cbd5e1' },
  button: { paddingVertical: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#1e293b' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  pressed: { opacity: 0.7 },
});
