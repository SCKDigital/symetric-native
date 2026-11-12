import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlatformPicker } from '@/components/shared/platform-picker';
import { addDays, dateToString, parseDateString, todayDateString } from '@/lib/date-utils';
import { visitCategoryLabel, visitDescription, type PastVisit } from '@/lib/past-visits';
import { defaultRangeForPreset, weeksBetween, type PrepareRange } from '@/lib/prepare-range';
import { brandTint } from '@/constants/brand';
import type { InterventionMarker } from '@/types/marker';
import { makeAccentStyles } from '@/lib/accent-styles';

function fmtLabel(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "21 Sept", with the year only when it isn't this year. */
function fmtShort(d: string): string {
  const date = parseDateString(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  range: PrepareRange;
  onChange: (r: PrepareRange) => void;
  /** Newest first (buildPastVisits). */
  pastVisits: PastVisit[];
  mostRecentMarker: InterventionMarker | null;
}

const PRESETS: ('14' | '30' | '60' | '90')[] = ['14', '30', '60', '90'];
const VISIT_PAGE = 5;

// Ported from the web app's DateRangeControl (defined inline in
// PrepareScreen.tsx). Mechanic swaps: two <input type="date"> fields ->
// one @react-native-community/datetimepicker shared between the start/end
// pills, tracked by which field is currently being edited.
//
// "Since appointment" opens a list of past appointments to start from, five
// at a time: the visit that matters for this one is not always the latest.
// This list replaced Prepare's separate Past appointments card, so it is
// also where past appointment notes are read: tapping a visit shows them.
export default function DateRangeControl({ range, onChange, pastVisits, mostRecentMarker }: Props) {
  const styles = useStyles();
  const [today] = useState(() => todayDateString());
  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null);
  const [pickingVisit, setPickingVisit] = useState(false);
  const [visitCount, setVisitCount] = useState(VISIT_PAGE);
  const isCustom = range.preset === 'custom';
  const sinceVisit = range.preset === 'since_visit';

  function applyPreset(p: '14' | '30' | '60' | '90') {
    setPickingVisit(false);
    onChange(defaultRangeForPreset(p, today));
  }

  function toggleVisitPicker() {
    setEditingField(null);
    setVisitCount(VISIT_PAGE);
    setPickingVisit(o => !o);
  }

  // The list stays open so the picked appointment's notes show beneath it;
  // the pill closes it.
  function applySinceVisit(visit: PastVisit) {
    onChange({ preset: 'since_visit', start: visit.date, end: today });
  }

  function applySinceMarker() {
    if (!mostRecentMarker) return;
    onChange({ preset: 'since_marker', start: mostRecentMarker.marker_date, end: today });
  }

  function applyCustom(start: string, end: string) {
    const clampedEnd = end > today ? today : end;
    const clampedStart = start > clampedEnd ? addDays(clampedEnd, -1) : start;
    onChange({ preset: 'custom', start: clampedStart, end: clampedEnd });
  }

  function handleDatePick(selectedDate: Date) {
    if (!editingField) return;
    const value = dateToString(selectedDate);
    if (editingField === 'start') applyCustom(value, range.end);
    else applyCustom(range.start, value);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Date range</Text>

      <View style={styles.pillRow}>
        {PRESETS.map(p => (
          <Pressable key={p} onPress={() => applyPreset(p)} style={[styles.pill, range.preset === p && styles.pillActive]}>
            <Text style={[styles.pillText, range.preset === p && styles.pillTextActive]}>{p} days</Text>
          </Pressable>
        ))}
        {pastVisits.length > 0 && (
          <Pressable
            onPress={toggleVisitPicker}
            accessibilityState={{ expanded: pickingVisit }}
            style={[styles.pill, sinceVisit && styles.pillActive, pickingVisit && !sinceVisit && styles.pillOpen]}>
            <Text style={[styles.pillText, sinceVisit && styles.pillTextActive]}>
              {sinceVisit ? `Since ${fmtShort(range.start)}` : 'Since appointment'} {pickingVisit ? '▴' : '▾'}
            </Text>
          </Pressable>
        )}
        {mostRecentMarker && (
          <Pressable onPress={() => { setPickingVisit(false); applySinceMarker(); }} style={[styles.pill, range.preset === 'since_marker' && styles.pillActive]}>
            <Text style={[styles.pillText, range.preset === 'since_marker' && styles.pillTextActive]}>Since {mostRecentMarker.label}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { setPickingVisit(false); if (!isCustom) applyCustom(addDays(today, -30), today); }} style={[styles.pill, isCustom && styles.pillActive]}>
          <Text style={[styles.pillText, isCustom && styles.pillTextActive]}>Custom</Text>
        </Pressable>
      </View>

      {pickingVisit && (
        <View style={styles.visitList}>
          <Text style={styles.visitPrompt}>Start the report from which appointment?</Text>
          {pastVisits.slice(0, visitCount).map(visit => {
            const category = visitCategoryLabel(visit.categories);
            const description = visitDescription(visit);
            const selected = sinceVisit && range.start === visit.date;
            return (
              <Pressable
                key={visit.key}
                onPress={() => applySinceVisit(visit)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.visitRow, selected && styles.visitRowSelected, pressed && { opacity: 0.7 }]}>
                <View style={styles.visitHeader}>
                  <Text style={[styles.visitDate, selected && styles.visitDateSelected]}>{fmtLabel(visit.date)}</Text>
                  {category && (
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryText}>{category}</Text>
                    </View>
                  )}
                  {visit.notes && !selected && <Text style={styles.notesHint}>Notes</Text>}
                </View>
                {description && <Text style={styles.visitDescription} numberOfLines={selected ? undefined : 1}>{description}</Text>}
                {selected && visit.notes && <Text style={styles.visitNotes}>{visit.notes}</Text>}
              </Pressable>
            );
          })}
          {pastVisits.length > visitCount && (
            <Pressable onPress={() => setVisitCount(n => n + VISIT_PAGE)} style={styles.loadMore} hitSlop={6}>
              <Text style={styles.loadMoreText}>Load more ({pastVisits.length - visitCount} older)</Text>
            </Pressable>
          )}
        </View>
      )}

      {isCustom && (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>Start</Text>
            <Pressable onPress={() => setEditingField('start')} style={styles.customInput}>
              <Text style={styles.customInputText}>{range.start}</Text>
            </Pressable>
          </View>
          <Text style={styles.customDash}>-</Text>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>End</Text>
            <Pressable onPress={() => setEditingField('end')} style={styles.customInput}>
              <Text style={styles.customInputText}>{range.end}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {editingField && (
        <PlatformPicker
          style={styles.pickerWrap}
          mode="date"
          value={parseDateString(editingField === 'start' ? range.start : range.end)}
          maximumDate={parseDateString(today)}
          onPick={handleDatePick}
          onClose={() => setEditingField(null)}
        />
      )}

      <Text style={styles.summary}>{fmtLabel(range.start)} to {fmtLabel(range.end)} · {weeksBetween(range.start, range.end)} weeks</Text>
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 18, paddingHorizontal: 20, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 12 },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748' },
  pillActive: { borderWidth: 0, backgroundColor: b.fill },
  pillText: { fontSize: 13, fontWeight: '500', color: '#8892a4' },
  pillTextActive: { color: b.onFill },
  pillOpen: { borderColor: b.text },
  visitList: { marginBottom: 12, borderTopWidth: 1, borderTopColor: '#1e2533', paddingTop: 12 },
  visitPrompt: { fontSize: 12, color: '#6b7a99', marginBottom: 6 },
  visitRow: { paddingVertical: 10, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 8 },
  visitRowSelected: { backgroundColor: brandTint(b.text, 0.1) },
  visitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitDate: { fontSize: 14, fontWeight: '500', color: '#c8d0e0' },
  visitDateSelected: { color: b.text },
  visitDescription: { fontSize: 12, color: '#6b7a99', marginTop: 3 },
  notesHint: { marginLeft: 'auto', fontSize: 11, color: '#6b7a99' },
  visitNotes: { fontSize: 13, color: '#8892a4', lineHeight: 19, marginTop: 8 },
  categoryPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: brandTint(b.text, 0.12), borderWidth: 1, borderColor: brandTint(b.text, 0.25) },
  categoryText: { fontSize: 10, fontWeight: '600', color: b.text },
  loadMore: { paddingTop: 10, alignSelf: 'flex-start' },
  loadMoreText: { fontSize: 13, fontWeight: '500', color: b.text },
  customRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' },
  customField: { gap: 3 },
  customLabel: { fontSize: 11, color: '#6b7a99' },
  customInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  customInputText: { fontSize: 13, color: '#c8d0e0' },
  customDash: { color: '#4a5568', marginBottom: 8 },
  pickerWrap: { marginBottom: 10 },
  summary: { fontSize: 12, color: '#4a5568' },
}));
