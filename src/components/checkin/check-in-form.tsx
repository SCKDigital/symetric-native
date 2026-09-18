import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import DomainSlider from '@/components/checkin/domain-slider';
import { useAuth } from '@/contexts/auth-context';
import { trackCheckInCompleted } from '@/lib/analytics';
import { useComfort } from '@/hooks/use-comfort';
import { COMFORT_TOKENS, NORMAL_TOKENS, type ComfortTokens } from '@/lib/comfort-theme';
import { getDomainColorFromProfile, DOMAIN_COPY } from '@/lib/domains';
import { CheckIn, DomainType, supabase } from '@/lib/supabase';

interface CheckInFormProps {
  checkIn: CheckIn;
  activeDomains: DomainType[];
  baselines: Record<DomainType, number>;
  completedCount: number;
  totalCount: number;
  onComplete: () => void;
  /** Pre-fill sliders with existing values (edit mode). */
  initialValues?: Partial<Record<DomainType, number>>;
  /** Pre-fill notes field (edit mode). */
  initialNotes?: string;
  /** Override the submit button label. Defaults to "Done". */
  submitButtonText?: string;
  /** If provided, called with the just-saved CheckIn instead of showing the internal confirmation screen. */
  onCompleted?: (completedCheckIn: CheckIn) => void;
  /** When true, shows "QUICK MIND CHECK-IN" header instead of "NOW · MIND CHECK-IN". */
  quickCheckInMode?: boolean;
}

// Ported from the web app's CheckInForm.tsx — same props, same save shape
// (a plain `check_ins` update, no new columns), same confirmation screen.
export default function CheckInForm({
  checkIn,
  activeDomains,
  baselines,
  completedCount,
  totalCount,
  onComplete,
  initialValues,
  initialNotes,
  submitButtonText,
  onCompleted,
  quickCheckInMode = false,
}: CheckInFormProps) {
  const { user, profile } = useAuth();
  const { active: comfortActive } = useComfort();
  const styles = comfortActive ? STYLES.comfort : STYLES.normal;
  // Sliders live inside this ScrollView. A horizontal drag that starts with
  // any vertical component gets claimed by the scroll, which is what made the
  // sliders feel sticky — worst on the last domain, where there is the most
  // scroll travel left to compete for. Locked while a slider is being dragged.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [values, setValues] = useState<Record<DomainType, number>>(
    // Resting position is the domain's own baseline, not a flat 5, so a
    // typical day can be submitted without touching anything and still record
    // "typical for me". initialValues wins when an existing check-in is being
    // reopened. Falls back to the scale midpoint before a baseline exists.
    activeDomains.reduce(
      (acc, domain) => ({ ...acc, [domain]: initialValues?.[domain] ?? Math.round(baselines[domain] ?? 5) }),
      {} as Record<DomainType, number>,
    ),
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updateData: Partial<CheckIn> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: notes || undefined,
        ...values,
      };
      // PostgREST failures are returned, not thrown, so the try/catch around
      // this never saw them: a rejected write fell straight through to the
      // "Logged" tick, the analytics event and the screen closing. The user was
      // told their check-in saved when nothing had been written.
      const { error } = await supabase.from('check_ins').update(updateData).eq('id', checkIn.id);
      if (error) {
        console.error('[CheckInForm] save failed:', error);
        setSaveError("Couldn't save that. Check your connection and try again.");
        setSaving(false);
        return;
      }
      trackCheckInCompleted(activeDomains.length);

      if (onCompleted) {
        onCompleted({ ...checkIn, ...updateData });
      } else {
        setDoneCount(completedCount + 1);
        setShowConfirmation(true);
        setTimeout(() => onComplete(), 1500);
      }
    } catch (e) {
      console.error('[CheckInForm] save threw:', e);
      setSaveError("Couldn't save that. Check your connection and try again.");
      setSaving(false);
    }
  };

  if (showConfirmation) {
    return (
      <View style={styles.confirmationRoot}>
        <View style={styles.confirmationIcon}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Path d="M3 8l3.5 3.5L13 5" stroke={comfortActive ? COMFORT_TOKENS.accentText : '#818cf8'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <Text style={styles.confirmationLogged}>Logged</Text>
        <Text style={styles.confirmationCount}>
          {doneCount} of {totalCount} done today
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={scrollEnabled}>
        <View style={styles.card}>
          <Text style={styles.cardHeader}>{quickCheckInMode ? 'Quick mind check-in' : 'Now · Mind check-in'}</Text>

          <View style={styles.slidersGroup}>
            {activeDomains.map(domain => (
              <DomainSlider
              onSlidingStart={() => setScrollEnabled(false)}
              onSlidingComplete={() => setScrollEnabled(true)}
                key={domain}
                domain={domain}
                label={DOMAIN_COPY[domain].label}
                value={values[domain]}
                baseline={baselines[domain]}
                onChange={value => setValues({ ...values, [domain]: value })}
                color={getDomainColorFromProfile(domain, profile)}
              />
            ))}
          </View>
        </View>

        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Context</Text>
          <TextInput
            value={notes}
            onChangeText={text => setNotes(text.slice(0, 200))}
            placeholder="Brief context only (optional)"
            placeholderTextColor="#4a5568"
            multiline
            maxLength={200}
            style={styles.notesInput}
          />
          <View style={styles.notesFooter}>
            <Text style={[styles.notesCount, notes.length > 180 && styles.notesCountWarn]}>{notes.length} / 200</Text>
          </View>
        </View>

        {saveError && <Text style={styles.saveError}>{saveError}</Text>}

        <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => pressed && !saving && styles.pressed}>
          <View style={[styles.submitButton, saving && styles.submitButtonDisabled]}>
            {saving ? <ActivityIndicator color="#4a5568" /> : <Text style={styles.submitButtonText}>{saveError ? 'Try again' : (submitButtonText ?? 'Done')}</Text>}
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const STYLES = { normal: makeStyles(NORMAL_TOKENS), comfort: makeStyles(COMFORT_TOKENS) };

function makeStyles(t: ComfortTokens) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  saveError: { fontSize: t.fs(13), color: '#f87171', marginBottom: 12, lineHeight: 19 },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 96 },
  card: {
    backgroundColor: '#1e2840',
    borderWidth: 1,
    borderColor: '#3d4f7a',
    borderRadius: 20,
    padding: 24,
    paddingTop: 28,
    marginBottom: 16,
  },
  cardHeader: { fontSize: t.fs(13), color: t.accentText, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 24 },
  slidersGroup: { gap: 28 },
  notesCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  notesLabel: { fontSize: t.fs(13), color: '#718096', marginBottom: 10 },
  notesInput: { color: '#e2e8f0', fontSize: t.fs(13), minHeight: 60, textAlignVertical: 'top', padding: 0 },
  notesFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  notesCount: { fontSize: t.fs(11), color: '#4a5568' },
  notesCountWarn: { color: '#f6ad55' },
  submitButton: { padding: 14, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#1e2533' },
  submitButtonText: { color: '#ffffff', fontSize: t.fs(15), fontWeight: '600' },
  pressed: { opacity: 0.85 },
  confirmationRoot: { flex: 1, backgroundColor: '#0a0c12', alignItems: 'center', justifyContent: 'center' },
  confirmationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmationLogged: { fontSize: t.fs(15), color: '#a0aec0', marginBottom: 6 },
  confirmationCount: { fontSize: t.fs(13), color: '#718096' },
  });
}
