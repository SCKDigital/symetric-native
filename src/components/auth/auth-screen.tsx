import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymetricLogo } from '@/components/symetric-logo';
import { useAuth } from '@/contexts/auth-context';

// Ported from the web app's src/components/auth/AuthScreen.tsx. Same three
// states (landing / email / sent), same copy, same staggered landing-screen
// fade-in timings. Differences are all platform mechanics: RN Animated
// instead of CSS transitions, KeyboardAvoidingView so the keyboard doesn't
// cover the email field, expo-linear-gradient for the CTA (RN has no CSS
// `linear-gradient`).

function useStaggeredFade(delaysMs: [number, number, number]) {
  const [values] = useState(() => delaysMs.map(() => new Animated.Value(0)));

  useEffect(() => {
    const timers = delaysMs.map((delay, i) =>
      setTimeout(() => {
        Animated.timing(values[i], { toValue: 1, duration: 900, useNativeDriver: true }).start();
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return values;
}

function LandingView({ onContinue }: { onContinue: () => void }) {
  const [wordmark, tagline, buttons] = useStaggeredFade([2300, 2600, 2900]);

  return (
    <View style={styles.landingRoot}>
      <View style={styles.landingCenter}>
        <SymetricLogo size={130} animate />

        <View style={styles.wordmarkGroup}>
          <Animated.Text style={[styles.wordmark, { opacity: wordmark }]}>symetric</Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: tagline }]}>See the whole picture.</Animated.Text>
        </View>

        <Animated.View style={[styles.buttonGroup, { opacity: buttons }]}>
          <Pressable onPress={onContinue} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}>
            <Text style={styles.continueButtonText}>Continue with email</Text>
          </Pressable>
          <Text style={styles.disclaimer}>Your data is yours - stored securely, never shared.</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function FormLogoHeader() {
  return (
    <View style={styles.formHeader}>
      <SymetricLogo size={48} />
      <Text style={styles.formHeaderText}>symetric</Text>
    </View>
  );
}

type Mode = 'landing' | 'email' | 'sent';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithMagicLink } = useAuth();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithMagicLink(email);
      setMode('sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'landing') {
    return <LandingView onContinue={() => setMode('email')} />;
  }

  return (
    <SafeAreaView style={styles.formRoot} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.formRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.formPadding}>
          <FormLogoHeader />

          <View style={styles.formCenter}>
            {mode === 'email' ? (
              <>
                <Text style={styles.heading}>Sign in or sign up</Text>
                <Text style={styles.subheading}>
                  Enter your email and we’ll send you a link to continue. No password needed.
                </Text>

                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor="#4a5568"
                  style={styles.input}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                />

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || !email}
                  style={({ pressed }) => [pressed && !loading && styles.pressed]}>
                  {loading ? (
                    <View style={[styles.submitButton, styles.submitButtonDisabled]}>
                      <ActivityIndicator color="#4a5568" />
                    </View>
                  ) : (
                    <LinearGradient
                      colors={['#4f46e5', '#6366f1']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.submitButton}>
                      <Text style={styles.submitButtonText}>Send link</Text>
                    </LinearGradient>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setMode('landing');
                    setError('');
                  }}
                  style={styles.backButton}>
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.heading}>Check your email</Text>
                <Text style={styles.sentBody}>We’ve sent you a link. It’ll work for 60 minutes.</Text>
                <Text style={styles.sentSubBody}>Don’t see it? Check your junk or spam folder too.</Text>

                <Pressable
                  onPress={() => {
                    setMode('email');
                    setError('');
                  }}
                  style={styles.backButton}>
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  landingRoot: { flex: 1, backgroundColor: '#0a0c12' },
  landingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 36 },
  wordmarkGroup: { alignItems: 'center', gap: 12 },
  wordmark: { fontSize: 24, fontWeight: '600', color: '#ffffff', letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#6b6882', maxWidth: 210, textAlign: 'center' },
  buttonGroup: { maxWidth: 340, width: '100%', gap: 12 },
  continueButton: { paddingVertical: 18, backgroundColor: '#5d52e0', borderRadius: 999, alignItems: 'center' },
  continueButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.88 },
  disclaimer: { fontSize: 11, color: '#38364a', textAlign: 'center' },

  formRoot: { flex: 1, backgroundColor: '#0a0c12' },
  formPadding: { flex: 1, paddingHorizontal: 24 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 40 },
  formHeaderText: { fontSize: 18, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.3 },
  formCenter: { flex: 1, justifyContent: 'center', paddingBottom: 48, gap: 4 },
  heading: { fontSize: 24, fontWeight: '600', color: '#e2e8f0', marginBottom: 6 },
  subheading: { fontSize: 14, color: '#4a5568', marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 13, color: '#718096', fontWeight: '500', marginBottom: 8 },
  input: {
    padding: 14,
    backgroundColor: '#141820',
    borderWidth: 1,
    borderColor: '#1e2533',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 15,
    marginBottom: 16,
  },
  errorBox: { padding: 14, backgroundColor: '#141820', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10, marginBottom: 16 },
  errorText: { fontSize: 13, color: '#a0aec0' },
  submitButton: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitButtonDisabled: { backgroundColor: '#1e2533' },
  submitButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  backButton: { alignItems: 'center', marginTop: 24 },
  backButtonText: { fontSize: 12, color: '#4a5568' },
  sentBody: { fontSize: 15, color: '#718096', lineHeight: 22, marginBottom: 8 },
  sentSubBody: { fontSize: 13, color: '#4a5568', lineHeight: 20 },
});
