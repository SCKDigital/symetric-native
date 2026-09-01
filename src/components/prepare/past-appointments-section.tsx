import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchAllAppointments } from '@/lib/api/appointments';
import { parseDateString } from '@/lib/date-utils';
import type { Appointment } from '@/lib/supabase';

function categoryLabel(categories: Appointment['focus_categories']): string {
  const hasMind = categories.includes('mind');
  const hasBody = categories.includes('body');
  if (hasMind && hasBody) return 'Mind + Body';
  if (hasBody) return 'Body';
  return 'Mind';
}

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  userId: string;
  /** Bumped by the parent whenever an appointment is created/edited/completed
   *  so this list refetches without owning that lifecycle itself. */
  refreshKey: number;
}

/**
 * Completed appointments are never deleted (completeAppointment only flips
 * is_completed) — this is the one place that record is actually visible,
 * since fetchUpcomingAppointment excludes them and Prepare otherwise never
 * looks at them again once a new appointment is set. Ported from the web
 * app's PastAppointmentsSection.tsx.
 */
export default function PastAppointmentsSection({ userId, refreshKey }: Props) {
  const [past, setPast] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Re-synced to true on every refetch (mount, and each refreshKey bump
    // from the parent), not just once — see use-history.ts for the same
    // reasoning on why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchAllAppointments(userId)
      .then(all => { if (!cancelled) setPast(all.filter(a => a.is_completed)); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  if (loading || past.length === 0) return null;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen(o => !o)} style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.label}>Past appointments</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{past.length}</Text>
          </View>
        </View>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={styles.list}>
          {past.map(appt => (
            <View key={appt.id} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemDate}>{fmtDate(appt.appointment_date)}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{categoryLabel(appt.focus_categories)}</Text>
                </View>
              </View>
              {appt.focus_areas && appt.focus_areas.length > 0 && (
                <Text style={styles.itemFocus}>{appt.focus_areas.join(', ')}</Text>
              )}
              {appt.notes && <Text style={styles.itemNotes}>{appt.notes}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 16, paddingHorizontal: 20, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9 },
  countBadge: { paddingVertical: 1, paddingHorizontal: 6, backgroundColor: 'rgba(129,140,248,0.15)', borderRadius: 20 },
  countText: { fontSize: 11, fontWeight: '600', color: '#818cf8' },
  chevron: { fontSize: 10, color: '#6b7a99' },
  list: { marginTop: 14, gap: 14 },
  item: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e2533' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  itemDate: { fontSize: 14, fontWeight: '500', color: '#c8d0e0' },
  pill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 20, backgroundColor: 'rgba(129,140,248,0.12)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.25)' },
  pillText: { fontSize: 10, fontWeight: '600', color: '#818cf8' },
  itemFocus: { fontSize: 12, color: '#6b7a99', marginBottom: 4 },
  itemNotes: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
});
