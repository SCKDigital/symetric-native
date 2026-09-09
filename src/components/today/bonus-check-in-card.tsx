import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DomainSlider from '@/components/checkin/domain-slider';
import EditCheckInModal from '@/components/checkin/edit-check-in-modal';
import { useAuth } from '@/contexts/auth-context';
import { trackCheckInCompleted } from '@/lib/analytics';
import { RESCUE_WINDOW_MS } from '@/lib/constants';
import { DOMAIN_COPY, getDomainColorFromProfile } from '@/lib/domains';
import { getMinutesRemaining, isWithinEditWindow } from '@/lib/edit-window';
import { CheckIn, DomainType, supabase } from '@/lib/supabase';

// Port of the web app's QuickMoodCard.tsx — the "Log a bonus mind check-in"
// row at the foot of Today, and the slider sheet behind it. Unlike a scheduled
// check-in this INSERTS a new completed check_ins row rather than updating one,
// which is why it can't just reuse CheckInForm (that updates an existing row).
//
// Mechanic swap: the one-hour cooldown is kept in AsyncStorage rather than
// localStorage, so reading it is async and the card renders nothing until the
// stored value has been read. Without the cooldown a bad evening could be
// logged a dozen times and swamp the day's real scheduled check-ins in every
// average the detectors compute.

const COOLDOWN_MS = 60 * 60 * 1000;

function cooldownKey(userId: string) {
  return `symetric:quickMoodCooldown:${userId}`;
}

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface Props {
  activeDomains?: DomainType[];
  /** Only forwarded to the edit modal, which shows each domain's baseline. */
  baselines?: Record<DomainType, number>;
  onLogged?: () => void;
}

export default function BonusCheckInCard({ activeDomains, baselines, onLogged }: Props) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  // The last bonus check-in, so it can be corrected for ten minutes the way a
  // scheduled one can. Held here rather than coming from useTodayCheckIns
  // because Today's list is filtered on scheduled_date, and a bonus row is
  // inserted without one — deliberately, so an extra log doesn't inflate the
  // day's "2 of 4" progress. That does mean this is the only place it can be
  // reached from.
  const [lastBonus, setLastBonus] = useState<CheckIn | null>(null);
  const [editing, setEditing] = useState(false);
  // Drives the countdown and, at zero, retires the edit affordance.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const domains: DomainType[] = activeDomains && activeDomains.length > 0 ? activeDomains : ['mood'];

  // The web version keeps `values` in sync with the domain list via an effect.
  // Not needed here: every read defaults with `?? 5`, so a domain added to
  // tracking since this component mounted already renders at its resting
  // position, and syncing it in an effect would only add a render pass.

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    AsyncStorage.getItem(cooldownKey(user.id)).then(stored => {
      if (cancelled) return;
      const until = stored ? parseInt(stored, 10) : NaN;
      if (!isNaN(until) && until > Date.now()) {
        setCooldownUntil(until);
        setTimeRemaining(until - Date.now());
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  // A bonus logged just before the app was backgrounded should still be
  // correctable on return, so the row is fetched rather than only remembered
  // from this session's own insert. Identified by what makes it a bonus:
  // completed, with no scheduled_date.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .is('scheduled_date', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as CheckIn;
        if (row.completed_at && isWithinEditWindow(row.completed_at)) setLastBonus(row);
      });
    return () => { cancelled = true; };
  }, [user]);

  // Only ticks while there is something to count down.
  useEffect(() => {
    if (!lastBonus?.completed_at) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [lastBonus?.completed_at]);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const interval = setInterval(() => {
      const remaining = cooldownUntil - Date.now();
      if (remaining <= 0) {
        setCooldownUntil(null);
        setTimeRemaining(0);
        clearInterval(interval);
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  // Derived from the ticking `timeRemaining` rather than a fresh Date.now():
  // reading the clock during render is impure, and both are set together
  // everywhere cooldownUntil is.
  const isOnCooldown = cooldownUntil !== null && timeRemaining > 0;

  const handleSubmit = async () => {
    if (!user || saving) return;
    if (isOnCooldown) {
      setError(`You can log again in ${formatTimeRemaining(timeRemaining)}.`);
      return;
    }
    setSaving(true);
    setError('');

    const now = new Date();
    const payload: Record<string, unknown> = {
      user_id: user.id,
      scheduled_at: now.toISOString(),
      expires_at: new Date(now.getTime() + RESCUE_WINDOW_MS).toISOString(),
      completed_at: now.toISOString(),
      status: 'completed',
      notes: notes || undefined,
    };
    for (const d of domains) payload[d] = values[d] ?? 5;

    // The inserted row comes back so it can be handed straight to the edit
    // modal — a bonus check-in is not in Today's list to be found again.
    const { data: inserted, error: insertError } = await supabase
      .from('check_ins').insert(payload).select().single();
    setSaving(false);

    if (insertError) {
      console.error('[BonusCheckInCard] insert error:', insertError);
      setError('Could not save. Try again.');
      return;
    }

    setLastBonus((inserted as CheckIn | null) ?? null);
    setNowMs(Date.now());
    trackCheckInCompleted(domains.length);

    const until = Date.now() + COOLDOWN_MS;
    await AsyncStorage.setItem(cooldownKey(user.id), String(until));
    setCooldownUntil(until);
    setTimeRemaining(COOLDOWN_MS);
    setModalOpen(false);
    setValues(Object.fromEntries(domains.map(d => [d, 5])));
    setTouched({});
    setNotes('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onLogged?.();
  };

  if (loading) return null;

  const bonusCompletedAt = lastBonus?.completed_at ?? null;
  const bonusEditable = bonusCompletedAt !== null && isWithinEditWindow(bonusCompletedAt, nowMs);

  return (
    <>
      <Pressable
        onPress={() => {
          if (isOnCooldown) return;
          setNotes('');
          setError('');
          setModalOpen(true);
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.trigger, isOnCooldown && styles.triggerDisabled, pressed && !isOnCooldown && styles.pressed]}>
        <Text style={styles.triggerText}>Log a bonus mind check-in</Text>
        {isOnCooldown ? (
          <Text style={styles.triggerMeta}>Available in {formatTimeRemaining(timeRemaining)}</Text>
        ) : saved ? (
          <Text style={styles.triggerSaved}>Saved</Text>
        ) : (
          <Text style={styles.triggerPlus}>+</Text>
        )}
      </Pressable>

      {bonusEditable && bonusCompletedAt && (
        <Pressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel={`Edit last bonus check-in, ${getMinutesRemaining(bonusCompletedAt, nowMs)} minutes remaining`}
          style={({ pressed }) => [styles.editRow, pressed && styles.pressed]}>
          <Text style={styles.editRowText}>Edit last bonus check-in</Text>
          <Text style={styles.editRowMeta}>{getMinutesRemaining(bonusCompletedAt, nowMs)} min remaining</Text>
        </Pressable>
      )}

      {editing && lastBonus && (
        <EditCheckInModal
          checkIn={lastBonus}
          activeDomains={domains}
          baselines={baselines ?? ({} as Record<DomainType, number>)}
          onClose={() => setEditing(false)}
          onSaved={updated => {
            setLastBonus(updated);
            setEditing(false);
            onLogged?.();
          }}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetLabel}>BONUS MIND CHECK-IN</Text>
            <Text style={styles.sheetHeading}>How are you right now?</Text>

            {domains.map(d => (
              <DomainSlider
                key={d}
                domain={d}
                label={DOMAIN_COPY[d]?.label ?? d}
                value={values[d] ?? 5}
                touched={touched[d] ?? false}
                color={getDomainColorFromProfile(d, profile)}
                onChange={v => {
                  setValues(prev => ({ ...prev, [d]: v }));
                  setTouched(prev => ({ ...prev, [d]: true }));
                }}
              />
            ))}

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth noting? (optional)"
              placeholderTextColor="#4a5568"
              multiline
              style={styles.notes}
            />

            {error !== '' && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
              <Text style={styles.submitText}>{saving ? 'Saving...' : 'Done'}</Text>
            </Pressable>
            <Pressable onPress={() => setModalOpen(false)} disabled={saving}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  trigger: {
    borderWidth: 1, borderColor: '#1e2533', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: { fontSize: 14, color: '#b8c4d8' },
  triggerMeta: { fontSize: 12, color: '#9aabb8' },
  triggerSaved: { fontSize: 12, color: '#818cf8' },
  triggerPlus: { fontSize: 18, color: '#64748b', lineHeight: 20 },

  editRow: {
    borderWidth: 1, borderColor: '#1e2533', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginTop: -4, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editRowText: { fontSize: 14, color: '#818cf8' },
  editRowMeta: { fontSize: 12, color: '#6b7690' },

  sheet: { flex: 1, backgroundColor: '#0a0c12' },
  sheetContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60, gap: 8 },
  sheetLabel: { fontSize: 11, color: '#818cf8', fontWeight: '600', letterSpacing: 0.9 },
  sheetHeading: { fontSize: 22, fontWeight: '600', color: '#e2e8f0', marginBottom: 12 },
  notes: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#cbd5e0', minHeight: 80, marginTop: 12,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, color: '#f87171', marginTop: 10 },
  submit: {
    marginTop: 20, backgroundColor: '#4f46e5', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  cancel: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 14 },
});
