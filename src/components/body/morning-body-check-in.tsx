import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import DomainSlider from '@/components/checkin/domain-slider';
import { useAuth } from '@/contexts/auth-context';
import { trackBodyMorningCheckInCompleted } from '@/lib/analytics';
import { BODY_DOMAINS, MORNING_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import { todayDateString } from '@/lib/date-utils';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType } from '@/lib/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Prefixed with morning_ on the row — separate columns from the evening
// domains of the same name, e.g. morning_pain vs pain. Never overwrite one
// with the other; that difference (waking stiff vs. crashing later) is the
// entire point of having both.
type MorningValues = Partial<Record<BodyDomainType, number>>;

// Morning-specific phrasing for domains whose evening hint doesn't fit a
// waking-up context. Only overrides where given — orthostatic falls back to
// the shared BODY_DOMAINS hint below.
const MORNING_HINTS: Partial<Record<BodyDomainType, string>> = {
  fatigue: "How much does it feel like you're wading through mud right now?",
  pain: 'One number for everything that hurts right now.',
};

// Chunk 5 of the body-tracking port (see project_rn_body_tracking_scoping.md):
// the optional morning check-in — three sliders (fatigue, pain, standing
// up), no backfill (always today, a same-morning-only snapshot), no
// events/map/character tags. Ported from the web app's
// MorningBodyCheckIn.tsx. NOT ported: MorningBodyCheckInCard's Today-tab
// availability-window/dismissal logic — same "Settings entry point, no
// Today-tab card" scoping as the evening check-in's own entry point.
export default function MorningBodyCheckIn({ visible, onClose }: Props) {
  const { user } = useAuth();
  // Always today — there's no backfill for the morning check-in.
  const [selectedDate] = useState(() => todayDateString());

  const [loading, setLoading] = useState(true);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [existingRetro, setExistingRetro] = useState(false);
  const [values, setValues] = useState<MorningValues>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user || !visible) return;
    let cancelled = false;
    // Re-synced to true on every visible change, not just once — see
    // use-history.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    (async () => {
      const { data: checkin } = await supabase
        .from('body_checkins')
        .select('id, entered_retroactively, morning_fatigue, morning_pain, morning_orthostatic')
        .eq('user_id', user.id)
        .eq('entry_date', selectedDate)
        .maybeSingle();

      if (cancelled) return;

      if (checkin) {
        setCheckinId(checkin.id);
        setExistingRetro(checkin.entered_retroactively ?? false);
        const row = checkin as unknown as Record<string, number | null>;
        const nextValues: MorningValues = {};
        for (const d of MORNING_BODY_DOMAIN_ORDER) {
          const v = row[`morning_${d}`];
          if (v !== null && v !== undefined) nextValues[d] = v;
        }
        setValues(nextValues);
      } else {
        setCheckinId(null);
        setExistingRetro(false);
        setValues({});
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, visible, selectedDate]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      user_id: user.id,
      entry_date: selectedDate,
      // Never downgrade a row already flagged retroactive by the evening
      // entry — the morning save itself is always same-day.
      entered_retroactively: existingRetro,
      morning_logged_at: new Date().toISOString(),
    };
    for (const d of MORNING_BODY_DOMAIN_ORDER) {
      payload[`morning_${d}`] = values[d] ?? null;
    }

    if (checkinId) {
      const { error: updErr } = await supabase.from('body_checkins').update({ ...payload, edited_at: new Date().toISOString() }).eq('id', checkinId);
      if (updErr) { setSaving(false); setError('Could not save. Try again.'); return; }
    } else {
      const { error: insErr } = await supabase.from('body_checkins').insert(payload);
      if (insErr) { setSaving(false); setError('Could not save. Try again.'); return; }
    }

    const domainCount = MORNING_BODY_DOMAIN_ORDER.filter(d => values[d] !== undefined).length;
    trackBodyMorningCheckInCompleted(domainCount, false);

    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  if (!user) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.headerLabel}>Morning body check-in</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>Today</Text>
            <Text style={styles.dateSubtitle}>How you woke up, separate from your end of day check-in.</Text>
          </View>

          {!loading && (
            <>
              <View style={styles.slidersCard}>
                <View style={styles.slidersGroup}>
                  {MORNING_BODY_DOMAIN_ORDER.map(d => {
                    const config = BODY_DOMAINS[d];
                    return (
                      <DomainSlider
                        key={d}
                        domain={`morning_${d}`}
                        label={config.label}
                        hint={MORNING_HINTS[d] ?? config.hint}
                        lowLabel={config.lowAnchor}
                        highLabel={config.highAnchor}
                        value={values[d] ?? 5}
                        onChange={v => setValues(prev => ({ ...prev, [d]: v }))}
                        color={BODY_COLOR}
                      />
                    );
                  })}
                </View>
              </View>

              <Pressable onPress={handleSave} disabled={saving} style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
                {saving ? <ActivityIndicator color="#4a5568" /> : <Text style={styles.saveButtonText}>{saved ? 'Saved' : checkinId ? 'Save changes' : 'Save'}</Text>}
              </Pressable>

              {error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 96 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerLabel: { fontSize: 13, fontWeight: '500', color: BODY_COLOR, textTransform: 'uppercase', letterSpacing: 0.6 },
  closeIcon: { fontSize: 18, color: '#64748b' },
  dateBlock: { marginBottom: 20 },
  dateLabel: { fontSize: 20, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.2, marginBottom: 6 },
  dateSubtitle: { fontSize: 13, color: '#718096' },
  slidersCard: { backgroundColor: '#1e2840', borderWidth: 1, borderColor: '#3d4f7a', borderRadius: 20, padding: 24, paddingTop: 28, marginBottom: 16 },
  slidersGroup: { gap: 28 },
  saveButton: { padding: 14, borderRadius: 12, backgroundColor: BODY_COLOR, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#1e2533' },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 12, textAlign: 'center' },
});
