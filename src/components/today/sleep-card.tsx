import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChevronRightIcon } from '@/components/shared/chevrons';
import { useAuth } from '@/contexts/auth-context';
import { useEditWindowCountdown } from '@/hooks/use-edit-window-countdown';
import { trackSleepLogged } from '@/lib/analytics';
import { SLEEP_COPY as copy, SLEEP_OPTIONS, sleepScoreToMeta } from '@/lib/sleep';
import { SleepLog, supabase } from '@/lib/supabase';

// Port of the web app's SleepCard.tsx — the Today-screen sleep row, in its
// three states: a CTA when nothing is logged, the expanded question when
// tapped, and a dimmed summary once answered. Native had no sleep UI at all,
// so a night's sleep could only be recorded on the web app.
//
// Includes the ten-minute edit affordance the web card grew at the same time:
// the window runs from created_at, so re-saving inside it doesn't extend it.

interface Props {
  onLogged?: () => void;
}

export default function SleepCard({ onLogged }: Props) {
  const { user } = useAuth();
  const [sleepLog, setSleepLog] = useState<SleepLog | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoursInput, setHoursInput] = useState('');

  const minutesRemaining = useEditWindowCountdown(sleepLog?.created_at ?? null);
  const isWithinEditWindow = minutesRemaining > 0;

  useEffect(() => {
    if (!user) return;
    const today = new Date().toLocaleDateString('en-CA');
    supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error('[SleepCard] query error:', error);
        setSleepLog((data?.[0] as SleepLog) ?? null);
      });
  }, [user]);

  if (sleepLog === undefined) return null;

  // Returns the saved row, not a boolean: the edit window counts from
  // created_at, so the card has to hold the real row after a write.
  const saveSleepLog = async (score: number | null, skipped = false, hoursSlept: number | null = null): Promise<SleepLog | null> => {
    if (!user) return null;
    const today = new Date().toLocaleDateString('en-CA');
    // limit(1) rather than maybeSingle() — avoids PGRST116 if stale duplicate rows exist.
    const { data: rows, error: selectError } = await supabase
      .from('sleep_logs').select('id').eq('user_id', user.id).eq('log_date', today).limit(1);
    if (selectError) { console.error('[SleepCard] select error:', selectError); return null; }
    const existing = rows?.[0];
    const payload = existing
      ? { score, skipped, hours_slept: hoursSlept, edited_at: new Date().toISOString() }
      : { score, skipped, hours_slept: hoursSlept };
    const { data, error } = existing
      ? await supabase.from('sleep_logs').update(payload).eq('id', existing.id).select().limit(1)
      : await supabase.from('sleep_logs').insert({ user_id: user.id, log_date: today, ...payload }).select().limit(1);
    if (error) { console.error('[SleepCard] save error:', error); return null; }
    return (data?.[0] as SleepLog) ?? null;
  };

  const handleSelect = async (score: number) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const parsedHours = parseFloat(hoursInput);
      const hoursSlept = hoursInput.trim() !== '' && !isNaN(parsedHours) ? parsedHours : null;
      const wasEdit = editing;
      const saved = await saveSleepLog(score, false, hoursSlept);
      if (saved) {
        // An edit corrects a night already counted — don't log it as a second one.
        if (!wasEdit) trackSleepLogged();
        setSleepLog(saved);
        setEditing(false);
        setExpanded(false);
        onLogged?.();
      }
    } catch (e) {
      console.error('[SleepCard] handleSelect threw:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const saved = await saveSleepLog(null, true);
      if (saved) {
        setSleepLog(saved);
        setEditing(false);
        setExpanded(false);
        onLogged?.();
      }
    } catch (e) {
      console.error('[SleepCard] handleSkip threw:', e);
    } finally {
      setSaving(false);
    }
  };

  // Completed — only if explicitly skipped or scored. A row with score=null and
  // skipped=false is a stale/partial row; fall through to the CTA.
  if (sleepLog !== null && (sleepLog.skipped || sleepLog.score != null) && !editing) {
    const meta = sleepLog.score != null ? sleepScoreToMeta(sleepLog.score) : null;
    const startEditing = () => {
      setHoursInput(sleepLog.hours_slept != null ? String(sleepLog.hours_slept) : '');
      setEditing(true);
    };
    return (
      <View style={styles.block}>
        <View style={styles.loggedCard}>
          <View style={styles.loggedText}>
            <Text style={styles.loggedLabel}>{copy.loggedLabel.toUpperCase()}</Text>
            {meta === null ? (
              <Text style={styles.loggedValue}>{copy.skippedLabel}</Text>
            ) : (
              <View style={styles.loggedValueRow}>
                <Text style={styles.loggedValue}>{meta.label}</Text>
                <View style={styles.dots}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <View key={i} style={[styles.dot, i <= meta.stars ? styles.dotOn : styles.dotOff]} />
                  ))}
                </View>
                {sleepLog.hours_slept != null && (
                  <Text style={styles.loggedHours}>· {sleepLog.hours_slept}h</Text>
                )}
              </View>
            )}
          </View>
          <Text style={styles.tick}>✓</Text>
        </View>

        {isWithinEditWindow && (
          <Pressable
            onPress={startEditing}
            accessibilityRole="button"
            accessibilityLabel={`${copy.edit.cta}, ${minutesRemaining} ${minutesRemaining === 1 ? 'minute' : 'minutes'} remaining`}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editButtonText}>{copy.edit.cta}</Text>
            <Text style={styles.editButtonMeta}>{copy.edit.minutesRemaining(minutesRemaining)}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (expanded || editing) {
    return (
      <View style={styles.expanded}>
        <Text style={styles.question}>{copy.question}</Text>

        <Text style={styles.hoursLabel}>{copy.hoursLabel}</Text>
        <TextInput
          value={hoursInput}
          onChangeText={setHoursInput}
          placeholder={copy.hoursPlaceholder}
          placeholderTextColor="#4a5568"
          keyboardType="decimal-pad"
          editable={!saving}
          style={styles.hoursInput}
        />

        <View style={styles.options}>
          {SLEEP_OPTIONS.map(option => (
            <Pressable
              key={option.score}
              onPress={() => handleSelect(option.score)}
              disabled={saving}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.footerRow}>
          <Pressable onPress={handleSkip} disabled={saving}>
            <Text style={styles.footerLink}>{copy.skipForToday}</Text>
          </Pressable>
          {editing && (
            <Pressable onPress={() => setEditing(false)} disabled={saving}>
              <Text style={styles.footerLink}>{copy.edit.cancel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={() => setExpanded(true)} style={({ pressed }) => [styles.ctaCard, pressed && styles.pressed]}>
      <View>
        <Text style={styles.ctaLabel}>{copy.card.sectionLabel.toUpperCase()}</Text>
        <Text style={styles.ctaText}>{copy.card.cta}</Text>
      </View>
      <ChevronRightIcon size={16} color="#818cf8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 12 },
  pressed: { opacity: 0.7 },

  loggedCard: {
    backgroundColor: '#0f1117', borderWidth: 1, borderColor: '#1a2030', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', opacity: 0.7,
  },
  loggedText: { flex: 1 },
  loggedLabel: { fontSize: 11, color: '#8892a4', letterSpacing: 0.9, marginBottom: 3 },
  loggedValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loggedValue: { fontSize: 15, color: '#9aabb8' },
  loggedHours: { fontSize: 15, color: '#6b7688' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#818cf8' },
  dotOff: { backgroundColor: '#2d3748' },
  tick: { fontSize: 14, color: '#2d3748' },

  editButton: {
    marginTop: 8, backgroundColor: 'rgba(99,102,241,0.06)', borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.15)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editButtonText: { fontSize: 13, color: '#818cf8' },
  editButtonMeta: { fontSize: 11, color: '#4a5568' },

  expanded: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#263045', borderRadius: 16,
    padding: 18, marginBottom: 12,
  },
  question: { fontSize: 15, fontWeight: '600', color: '#e2e8f0', marginBottom: 14 },
  hoursLabel: { fontSize: 12, color: '#8892a4', marginBottom: 6 },
  hoursInput: {
    backgroundColor: '#1e2533', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16, fontSize: 14, color: '#cbd5e0', marginBottom: 14,
  },
  options: { gap: 6, marginBottom: 12 },
  option: {
    backgroundColor: '#1e2533', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  optionText: { fontSize: 14, color: '#cbd5e0' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footerLink: { fontSize: 13, color: '#64748b', paddingVertical: 4 },

  ctaCard: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#263045', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ctaLabel: { fontSize: 11, color: '#6366f1', letterSpacing: 0.9, fontWeight: '700', marginBottom: 3 },
  ctaText: { fontSize: 15, color: '#cbd5e0', fontWeight: '500' },
});
