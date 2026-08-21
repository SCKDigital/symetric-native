import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingBackButton, OnboardingCheckbox, OnboardingPrimaryButton } from '@/components/onboarding/onboarding-controls';
import { DOMAIN_COPY, DOMAIN_ORDER } from '@/lib/domains';
import { DomainType } from '@/lib/supabase';

interface DomainSelectionStepProps {
  selectedDomains: DomainType[];
  onUpdate: (domains: DomainType[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const domains = DOMAIN_ORDER.map(type => ({ type, ...DOMAIN_COPY[type] }));

const MIN_DOMAINS = 2;
const MAX_DOMAINS = 8;

// Ported from the web app's DomainSelectionStep.tsx — straight layout port,
// no native-only mechanics.
export default function DomainSelectionStep({ selectedDomains, onUpdate, onNext, onBack }: DomainSelectionStepProps) {
  const handleToggle = (domain: DomainType) => {
    if (selectedDomains.includes(domain)) {
      onUpdate(selectedDomains.filter(d => d !== domain));
    } else if (selectedDomains.length < MAX_DOMAINS) {
      onUpdate([...selectedDomains, domain]);
    }
  };

  const canProceed = selectedDomains.length >= MIN_DOMAINS;
  const showError = !canProceed && selectedDomains.length === 1;

  const helperText =
    selectedDomains.length === 0
      ? 'Select at least 2 domains to continue'
      : selectedDomains.length === 1
        ? 'Select 1 more to continue'
        : `${selectedDomains.length} selected`;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>What do you want to track?</Text>
        <Text style={styles.subheading}>
          Choose the symptoms and experiences you want to pay attention to - as few as 2, as many as all 8. This is
          the only time you’ll need to do this: every check-in after today only shows what you pick right now, so
          there’s nothing to scroll past and nothing to hide later.
        </Text>
        <Text style={styles.hint}>
          Not sure where to start? Mood, energy, and anxiety are commonly tracked together. You can always add more
          domains later from Settings.
        </Text>

        <View style={styles.domainList}>
          {domains.map(domain => (
            <OnboardingCheckbox key={domain.type} checked={selectedDomains.includes(domain.type)} onToggle={() => handleToggle(domain.type)}>
              <Text style={styles.domainLabel}>{domain.label}</Text>
              <Text style={styles.domainDescription}>{domain.description}</Text>
            </OnboardingCheckbox>
          ))}
        </View>

        {showError && <Text style={styles.errorText}>Please select at least 2 domains to track.</Text>}
        <Text style={styles.helperText}>{helperText}</Text>

        <View style={styles.buttonRow}>
          <OnboardingBackButton onPress={onBack} />
          <View style={styles.primaryButtonFlex}>
            <OnboardingPrimaryButton label="Continue" onPress={onNext} disabled={!canProceed} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 16 },
  subheading: { fontSize: 15, color: '#94a3b8', lineHeight: 24, marginBottom: 8 },
  hint: { fontSize: 14, color: '#64748b', lineHeight: 22, marginBottom: 28 },
  domainList: { gap: 8, marginBottom: 28 },
  domainLabel: { fontSize: 15, fontWeight: '500', color: '#e2e8f0', marginBottom: 3 },
  domainDescription: { fontSize: 13, color: '#64748b', lineHeight: 19 },
  errorText: { fontSize: 13, color: '#f87171', marginBottom: 16 },
  helperText: { fontSize: 13, color: '#4a5568', marginBottom: 24 },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  primaryButtonFlex: { flex: 1 },
});
