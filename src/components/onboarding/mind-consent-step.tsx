import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingBackButton, OnboardingCheckbox, OnboardingPrimaryButton } from '@/components/onboarding/onboarding-controls';

interface MindConsentStepProps {
  mindNotHealthServiceAck: boolean;
  mindDataConsent: boolean;
  onUpdate: (updates: { mindNotHealthServiceAck?: boolean; mindDataConsent?: boolean }) => void;
  onNext: () => void;
  onBack: () => void;
}

// Ported from the web app's MindConsentStep.tsx — straight layout/primitive
// port, no native-only mechanics involved. The Privacy Policy / Terms links
// are non-functional on the web version too (href="#" + preventDefault) —
// carried over as-is rather than inventing a URL; wire both up for real once
// those pages exist.
export default function MindConsentStep({
  mindNotHealthServiceAck,
  mindDataConsent,
  onUpdate,
  onNext,
  onBack,
}: MindConsentStepProps) {
  const canProceed = mindNotHealthServiceAck && mindDataConsent;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>Symetric Mind</Text>
        <Text style={styles.subheading}>Before we get started, please read and confirm the following.</Text>

        <View style={styles.checkboxGroup}>
          <OnboardingCheckbox
            checked={mindNotHealthServiceAck}
            onToggle={() => onUpdate({ mindNotHealthServiceAck: !mindNotHealthServiceAck })}>
            I understand Symetric is not a mental health service, health device or diagnostic tool.
          </OnboardingCheckbox>
          <OnboardingCheckbox checked={mindDataConsent} onToggle={() => onUpdate({ mindDataConsent: !mindDataConsent })}>
            I consent to Symetric collecting and storing information on mental domains I select, e.g. mood and
            anxiety, and any additional data, e.g. added context or events, I provide for the purposes of record
            keeping and finding patterns.
          </OnboardingCheckbox>
        </View>

        <Text style={styles.legal}>
          By continuing, you agree to our <Text style={styles.legalLink}>Privacy Policy</Text> and{' '}
          <Text style={styles.legalLink}>Terms of Use</Text>.
        </Text>

        <View style={styles.buttonRow}>
          <OnboardingBackButton onPress={onBack} />
          <View style={styles.primaryButtonFlex}>
            <OnboardingPrimaryButton label="Continue" onPress={onNext} disabled={!canProceed} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 40 },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 16 },
  subheading: { fontSize: 15, color: '#94a3b8', lineHeight: 24, marginBottom: 28 },
  checkboxGroup: { gap: 12, marginBottom: 28 },
  legal: { fontSize: 12, color: '#4a5568', lineHeight: 18, marginBottom: 28 },
  legalLink: { color: '#818cf8', textDecorationLine: 'underline' },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  primaryButtonFlex: { flex: 1 },
});
