import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Shared across all three consent steps — the web app defines an identical
// Checkbox component three times (one per step file); consolidated here
// since there's no behavioral reason to keep it duplicated.

export function OnboardingCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.checkboxRow, checked ? styles.checkboxRowChecked : styles.checkboxRowUnchecked]}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked && (
          <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <Path d="M2 6l2.5 2.5L10 3.5" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      {typeof children === 'string' ? <Text style={styles.checkboxLabel}>{children}</Text> : <View style={styles.checkboxContent}>{children}</View>}
    </Pressable>
  );
}

export function YesNoToggle({ value, onChange }: { value: boolean; onChange: (yes: boolean) => void }) {
  return (
    <View style={styles.yesNoRow}>
      {([
        { label: 'Yes', val: true },
        { label: 'No', val: false },
      ] as const).map(({ label, val }) => (
        <Pressable
          key={label}
          onPress={() => onChange(val)}
          style={[styles.yesNoButton, value === val ? styles.yesNoButtonActive : styles.yesNoButtonInactive]}>
          <Text style={[styles.yesNoLabel, value === val && styles.yesNoLabelActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function OnboardingPrimaryButton({
  label,
  loadingLabel,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  loadingLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={inactive} style={styles.primaryButtonWrap}>
      {inactive ? (
        <View style={[styles.primaryButton, styles.primaryButtonDisabled]}>
          {loading ? <ActivityIndicator color="#4a5568" /> : <Text style={styles.primaryButtonTextDisabled}>{label}</Text>}
        </View>
      ) : (
        <LinearGradient colors={['#4f46e5', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{loading ? (loadingLabel ?? label) : label}</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function OnboardingBackButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.backButton}>
      <Text style={styles.backButtonText}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkboxRow: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxRowChecked: { borderColor: 'rgba(99,102,241,0.5)', backgroundColor: 'rgba(99,102,241,0.1)' },
  checkboxRowUnchecked: { borderColor: '#1e2533', backgroundColor: '#141820' },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2d3748',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: { borderColor: '#818cf8', backgroundColor: '#4f46e5' },
  checkboxLabel: { flex: 1, fontSize: 14, color: '#cbd5e1', lineHeight: 21 },
  checkboxContent: { flex: 1 },

  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoButton: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  yesNoButtonActive: { borderColor: 'rgba(99,102,241,0.5)', backgroundColor: 'rgba(99,102,241,0.1)' },
  yesNoButtonInactive: { borderColor: '#1e2533', backgroundColor: '#141820' },
  yesNoLabel: { fontSize: 14, fontWeight: '500', color: '#6b7a99' },
  yesNoLabelActive: { color: '#e2e8f0' },

  primaryButtonWrap: {},
  primaryButton: { padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonDisabled: { backgroundColor: '#1e2533' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  primaryButtonTextDisabled: { color: '#4a5568', fontSize: 15, fontWeight: '600' },

  backButton: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1e2533' },
  backButtonText: { color: '#6b7a99', fontSize: 14 },
});
