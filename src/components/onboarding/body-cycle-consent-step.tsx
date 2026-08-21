import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  OnboardingBackButton,
  OnboardingCheckbox,
  OnboardingPrimaryButton,
  YesNoToggle,
} from '@/components/onboarding/onboarding-controls';

interface BodyCycleConsentStepProps {
  bodyInterested: boolean;
  bodyConsent: boolean;
  cycleInterested: boolean;
  cycleConsent: boolean;
  onUpdate: (updates: {
    bodyInterested?: boolean;
    bodyConsent?: boolean;
    cycleInterested?: boolean;
    cycleConsent?: boolean;
  }) => void;
  onNext: () => Promise<void>;
  onBack: () => void;
}

// Ported from the web app's BodyCycleConsentStep.tsx — straight port, no
// native-only mechanics. This step also triggers the final save (the
// record-consent edge function call lives in the Onboarding orchestrator),
// so it owns its own loading/error state exactly like the source.
export default function BodyCycleConsentStep({
  bodyInterested,
  bodyConsent,
  cycleInterested,
  cycleConsent,
  onUpdate,
  onNext,
  onBack,
}: BodyCycleConsentStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canProceed = (!bodyInterested || bodyConsent) && (!cycleInterested || cycleConsent);

  const handleContinue = async () => {
    if (!canProceed) return;
    setLoading(true);
    setError('');
    try {
      await onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>Symetric Body</Text>

        <View style={styles.section}>
          <Text style={styles.question}>I have physical symptoms I want to track for greater context.</Text>
          <YesNoToggle
            value={bodyInterested}
            onChange={yes => onUpdate({ bodyInterested: yes, ...(yes ? {} : { bodyConsent: false }) })}
          />
          {bodyInterested && (
            <View style={styles.conditionalCheckbox}>
              <OnboardingCheckbox checked={bodyConsent} onToggle={() => onUpdate({ bodyConsent: !bodyConsent })}>
                I consent to Symetric collecting and storing information on physical domains I select, e.g. fatigue
                and pain, and any additional data, e.g. added context or events, I provide for the purposes of
                record keeping and finding patterns.
              </OnboardingCheckbox>
            </View>
          )}
        </View>

        <View style={[styles.section, styles.sectionTight]}>
          <Text style={styles.question}>I have a menstrual cycle I want to track (once a month) for greater context.</Text>
          <YesNoToggle
            value={cycleInterested}
            onChange={yes => onUpdate({ cycleInterested: yes, ...(yes ? {} : { cycleConsent: false }) })}
          />
          {cycleInterested && (
            <View style={styles.conditionalCheckbox}>
              <OnboardingCheckbox checked={cycleConsent} onToggle={() => onUpdate({ cycleConsent: !cycleConsent })}>
                I consent to Symetric collecting and storing information on the date of Day 1 of my cycle and any
                additional data, e.g. added context or events, I provide for the purposes of record keeping and
                finding patterns.
              </OnboardingCheckbox>
            </View>
          )}
        </View>

        <Text style={styles.hint}>You can opt in or out of these at any time under Settings.</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <OnboardingBackButton onPress={onBack} disabled={loading} />
          <View style={styles.primaryButtonFlex}>
            <OnboardingPrimaryButton
              label="Begin"
              loadingLabel="Setting up…"
              onPress={handleContinue}
              disabled={!canProceed}
              loading={loading}
            />
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
  section: { marginBottom: 28 },
  sectionTight: { marginBottom: 20 },
  question: { fontSize: 15, color: '#94a3b8', lineHeight: 24, marginBottom: 12 },
  conditionalCheckbox: { marginTop: 12 },
  hint: { fontSize: 12, color: '#4a5568', lineHeight: 18, marginBottom: 28 },
  errorBox: { padding: 14, backgroundColor: '#141820', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10, marginBottom: 16 },
  errorText: { fontSize: 13, color: '#a0aec0' },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  primaryButtonFlex: { flex: 1 },
});
