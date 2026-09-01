import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import MarkerFirstTimeSheet from '@/components/marker-first-time-sheet';
import MarkerModal from '@/components/marker-modal';
import { useAuth } from '@/contexts/auth-context';
import { addDays, parseDateString, todayDateString } from '@/lib/date-utils';
import { markerColors, markerTypeLabels } from '@/lib/marker-colors';
import { createMarker, deleteMarker, fetchMarkersInRange, updateMarker as updateMarkerQuery } from '@/lib/queries/markers';
import { supabase } from '@/lib/supabase';
import type { CreateMarkerInput, InterventionMarker } from '@/types/marker';

const MARKER_FIRST_TIME_KEY = 'symetric_marker_first_time';

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface CheckInNote {
  scheduled_date: string;
  notes: string;
}

interface DataGap {
  start: string;
  end: string;
  days: number;
}

interface Props {
  fromDate?: string;
  toDate?: string;
}

// Ported from the web app's NotableChangesSection.tsx. Mechanic swap: the
// "show the first-time marker sheet once" flag uses AsyncStorage instead of
// localStorage, so handleModalClose is async now.
export default function NotableChangesSection({ fromDate, toDate }: Props) {
  const { user, profile } = useAuth();
  const [today] = useState(() => todayDateString());
  const [markers, setMarkers] = useState<InterventionMarker[]>([]);
  const [contextNotes, setContextNotes] = useState<CheckInNote[]>([]);
  const [dataGaps, setDataGaps] = useState<DataGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMarker, setEditingMarker] = useState<InterventionMarker | null>(null);
  const [showFirstTime, setShowFirstTime] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const startDate = fromDate ?? addDays(today, -90);
  const endDate = toDate ?? today;

  useEffect(() => {
    if (!user) return;

    async function loadContextNotes(): Promise<CheckInNote[]> {
      const { data } = await supabase
        .from('check_ins')
        .select('scheduled_date, notes')
        .eq('user_id', user!.id)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .not('notes', 'is', null)
        .order('scheduled_date', { ascending: false });

      return ((data ?? []) as CheckInNote[]).filter(ci => ci.notes && ci.notes.length > 50);
    }

    async function detectGaps(): Promise<DataGap[]> {
      const { data } = await supabase
        .from('check_ins')
        .select('scheduled_date')
        .eq('user_id', user!.id)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .eq('status', 'completed')
        .order('scheduled_date');

      const completedDates = new Set((data ?? []).map((ci: { scheduled_date: string }) => ci.scheduled_date));
      const gaps: DataGap[] = [];
      let gapStart: string | null = null;
      let gapDays = 0;

      let current = startDate;
      while (current <= endDate) {
        if (!completedDates.has(current)) {
          if (!gapStart) gapStart = current;
          gapDays++;
        } else if (gapStart && gapDays >= 3) {
          gaps.push({ start: gapStart, end: addDays(current, -1), days: gapDays });
          gapStart = null;
          gapDays = 0;
        } else {
          gapStart = null;
          gapDays = 0;
        }
        current = addDays(current, 1);
      }
      if (gapStart && gapDays >= 3) gaps.push({ start: gapStart, end: endDate, days: gapDays });
      return gaps;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([fetchMarkersInRange(startDate, endDate), loadContextNotes(), detectGaps()])
      .then(([m, notes, gaps]) => {
        setMarkers(m);
        setContextNotes(notes);
        setDataGaps(gaps);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [startDate, endDate, user]);

  async function handleModalClose() {
    setShowModal(false);
    setEditingMarker(null);
    const flag = await AsyncStorage.getItem(MARKER_FIRST_TIME_KEY);
    if (flag) {
      await AsyncStorage.removeItem(MARKER_FIRST_TIME_KEY);
      setShowFirstTime(true);
    }
  }

  async function handleSave(input: CreateMarkerInput) {
    const isFirst = markers.length === 0;
    if (editingMarker) {
      const updated = await updateMarkerQuery({ id: editingMarker.id, ...input });
      setMarkers(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    } else {
      const created = await createMarker(input);
      setMarkers(prev => [...prev, created].sort((a, b) => a.marker_date.localeCompare(b.marker_date)));
      if (isFirst) await AsyncStorage.setItem(MARKER_FIRST_TIME_KEY, 'true');
    }
  }

  async function handleDelete(id: string) {
    await deleteMarker(id);
    setMarkers(prev => prev.filter(m => m.id !== id));
  }

  const hasContent = markers.length > 0 || contextNotes.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Notable changes</Text>
        <Pressable onPress={() => { setEditingMarker(null); setShowModal(true); }} hitSlop={8}>
          <Text style={styles.addText}>+ Mark change</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Medications, therapy, and life events in the selected period.</Text>

      {loading ? (
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonLine} />
        </View>
      ) : (
        <>
          {!hasContent && (
            <Text style={styles.emptyText}>None recorded. Add medication changes, therapy sessions, or major life events to give your clinician context.</Text>
          )}

          {markers.length > 0 && (
            <View style={contextNotes.length > 0 || dataGaps.length > 0 ? styles.blockSpaced : undefined}>
              {markers.map(marker => {
                const color = markerColors[marker.marker_type] ?? '#818cf8';
                const typeLabel = markerTypeLabels[marker.marker_type] ?? marker.marker_type;
                return (
                  <View key={marker.id} style={styles.markerRow}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <View style={styles.markerText}>
                      <Text style={styles.markerLabel}>{marker.label}</Text>
                      <Text style={styles.markerMeta}>{typeLabel} · {fmtDate(marker.marker_date)}</Text>
                    </View>
                    <Pressable onPress={() => { setEditingMarker(marker); setShowModal(true); }} hitSlop={6} style={styles.editIcon}>
                      <Text style={styles.editIconText}>✎</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {contextNotes.length > 0 && (
            <View style={dataGaps.length > 0 ? styles.blockSpaced : undefined}>
              <Text style={styles.subLabel}>Context notes</Text>
              {contextNotes.map(note => {
                const isExpanded = expandedNote === note.scheduled_date;
                return (
                  <View key={note.scheduled_date} style={styles.noteRow}>
                    <Text style={styles.noteDate}>{fmtShort(note.scheduled_date)}</Text>
                    <View style={styles.noteTextWrap}>
                      <Text style={styles.noteText} numberOfLines={isExpanded ? undefined : 2}>{note.notes}</Text>
                      {note.notes.length > 120 && (
                        <Pressable onPress={() => setExpandedNote(isExpanded ? null : note.scheduled_date)} hitSlop={4}>
                          <Text style={styles.readMore}>{isExpanded ? 'Show less' : 'Read more'}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {dataGaps.length > 0 && (
            <View>
              <Text style={styles.subLabel}>Data gaps</Text>
              {dataGaps.map((gap, i) => (
                <Text key={i} style={styles.gapText}>Missed {gap.days} day{gap.days === 1 ? '' : 's'}: {fmtShort(gap.start)} - {fmtShort(gap.end)}</Text>
              ))}
            </View>
          )}
        </>
      )}

      {showModal && user && (
        <MarkerModal
          marker={editingMarker ?? undefined}
          onSave={handleSave}
          onDelete={editingMarker ? handleDelete : undefined}
          onClose={handleModalClose}
          cycleTrackingEnabled={profile?.cycle_tracking_enabled ?? false}
        />
      )}

      <MarkerFirstTimeSheet isOpen={showFirstTime} onClose={() => setShowFirstTime(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9 },
  addText: { fontSize: 13, fontWeight: '500', color: '#818cf8' },
  hint: { fontSize: 12, color: '#4a5568', marginBottom: 12 },
  skeletonRow: { height: 40, justifyContent: 'center' },
  skeletonLine: { height: 12, backgroundColor: '#1e2533', borderRadius: 4, width: '50%', opacity: 0.6 },
  emptyText: { fontSize: 13, color: '#6b7a99' },
  blockSpaced: { marginBottom: 16 },
  markerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  markerText: { flex: 1 },
  markerLabel: { fontSize: 14, color: '#c8d0e0', marginBottom: 2 },
  markerMeta: { fontSize: 12, color: '#4a5568' },
  editIcon: { padding: 2 },
  editIconText: { fontSize: 13, color: '#4a5568' },
  subLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  noteDate: { fontSize: 11, color: '#6b7a99', minWidth: 44, marginTop: 2 },
  noteTextWrap: { flex: 1 },
  noteText: { fontSize: 13, color: '#c8d0e0', lineHeight: 19 },
  readMore: { fontSize: 12, color: '#818cf8', marginTop: 4 },
  gapText: { fontSize: 13, color: '#6b7a99', marginBottom: 4 },
});
