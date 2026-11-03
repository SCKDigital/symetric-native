import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import MarkerModal from '@/components/marker-modal';
import { CalendarIcon, PillIcon, PinIcon } from '@/components/marker-icons';
import { parseDateString } from '@/lib/date-utils';
import { markerColors, markerTypeLabels } from '@/lib/marker-colors';
import { createMarker, deleteMarker, fetchMarkers, updateMarker } from '@/lib/queries/markers';
import type { InterventionMarker } from '@/types/marker';
import { makeAccentStyles } from '@/lib/accent-styles';

// Every event the person has logged, in one place. Before this, events were
// written from Today's "+ Add an event" and then only surfaced as chips on
// History day cards (90 days, four chips a day) and in the report: there was
// nowhere to see the whole list, or to find an old one to fix. It lives on the
// Events screen, under the findings, because that is where someone looking
// for "my events" already is.
//
// Every event, not the Insights range: this is a record, not an analysis.

/** Collapsed length. Long enough for a few months of typical logging. */
const INITIAL_COUNT = 8;

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function EventIcon({ type }: { type: InterventionMarker['marker_type'] }) {
  const color = markerColors[type];
  if (type === 'medication') return <PillIcon color={color} />;
  if (type === 'therapy') return <CalendarIcon color={color} />;
  if (type === 'life_event') return <PinIcon color={color} />;
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginHorizontal: 3 }} />;
}

interface Props {
  /** Called after any add/edit/delete, so the findings above re-read. */
  onChanged: () => void;
  cycleTrackingEnabled: boolean;
}

export default function AllEventsList({ onChanged, cycleTrackingEnabled }: Props) {
  const styles = useStyles();
  const [events, setEvents] = useState<InterventionMarker[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<InterventionMarker | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEvents(await fetchMarkers());
    } catch (e) {
      console.error('[AllEventsList] fetch error:', e);
      setEvents(prev => prev ?? []);
    }
  }, []);

  useEffect(() => {
    // See use-history.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const afterChange = async () => {
    await reload();
    onChanged();
  };

  if (events === null) return null;

  // Cycle Day 1s are only shown while cycle tracking is on, matching where
  // else they appear (the add-event types, History's Day N).
  const visible = events.filter(e => e.marker_type !== 'cycle_phase' || cycleTrackingEnabled);
  const shown = showAll ? visible : visible.slice(0, INITIAL_COUNT);

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>All events{visible.length > 0 ? ` · ${visible.length}` : ''}</Text>
        <Pressable onPress={() => { setError(null); setAdding(true); }} hitSlop={8}>
          <Text style={styles.addText}>+ Add an event</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {visible.length === 0 ? (
        <Text style={styles.empty}>No events yet. Log a medication change, an appointment or something that happened, and its effect can be read once there are days of check-ins either side.</Text>
      ) : (
        <View style={styles.card}>
          {shown.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => setEditing(e)}
              accessibilityLabel={`Edit ${e.label}`}
              style={[styles.row, i > 0 && styles.rowDivider]}>
              <EventIcon type={e.marker_type} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} numberOfLines={2}>{e.label}</Text>
                <Text style={styles.rowMeta}>{markerTypeLabels[e.marker_type]} · {fmtDate(e.marker_date)}</Text>
              </View>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          ))}
        </View>
      )}

      {visible.length > INITIAL_COUNT && (
        <Pressable onPress={() => setShowAll(s => !s)} style={styles.moreButton}>
          <Text style={styles.addText}>{showAll ? 'Show fewer' : `Show all ${visible.length}`}</Text>
        </Pressable>
      )}

      {adding && (
        <MarkerModal
          onSave={async input => {
            try {
              await createMarker(input);
              await afterChange();
            } catch (e) {
              console.error('[AllEventsList] create error:', e);
              setError("Couldn't save that event. Check your connection and try again.");
            }
          }}
          onClose={() => setAdding(false)}
          cycleTrackingEnabled={cycleTrackingEnabled}
        />
      )}

      {editing && (
        <MarkerModal
          marker={editing}
          onSave={async input => {
            await updateMarker({ id: editing.id, ...input });
            await afterChange();
          }}
          onDelete={async id => {
            await deleteMarker(id);
            await afterChange();
          }}
          onClose={() => setEditing(null)}
          cycleTrackingEnabled={cycleTrackingEnabled}
        />
      )}
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600' },
  addText: { fontSize: 13, color: b.text, fontWeight: '500' },
  empty: { fontSize: 13, color: '#6b7a99', lineHeight: 19 },
  error: { fontSize: 12, color: '#f87171', marginBottom: 8 },
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#1e2533' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, color: '#c8d0e0', lineHeight: 19 },
  rowMeta: { fontSize: 11, color: '#4a5568', marginTop: 2 },
  edit: { fontSize: 12, color: '#6b7a99' },
  moreButton: { paddingVertical: 10 },
}));
