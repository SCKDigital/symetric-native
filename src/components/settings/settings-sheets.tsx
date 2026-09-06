import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SheetButton, SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import type { TimeFormat } from '@/lib/time-format';

// The scheduling and preference sheets, ported from the web app's
// ActiveWindowSheet.tsx, FrequencySheet.tsx and sheets/SettingsSheets.tsx.
// Mechanic swap throughout: every <input type="time"> becomes a
// @react-native-community/datetimepicker, the same pattern body-tracking-sheet.tsx
// already established here.

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function timeStringToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatWindowTime(time: string, fmt: TimeFormat): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (fmt === '24hr') return `${String(h).padStart(2, '0')}:${m}`;
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${period}`;
}

/** A tappable time value that opens the platform time picker. */
function TimeField({ label, value, timeFormat, onChange }: {
  label: string; value: string; timeFormat: TimeFormat; onChange: (v: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setPicking(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(dateToTimeString(selected));
  };
  return (
    <View style={styles.timeField}>
      <Text style={styles.timeFieldLabel}>{label.toUpperCase()}</Text>
      <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [styles.timeInput, pressed && styles.pressed]}>
        <Text style={styles.timeInputText}>{formatWindowTime(value, timeFormat)}</Text>
      </Pressable>
      {picking && (
        <DateTimePicker
          value={timeStringToDate(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
      {picking && Platform.OS === 'ios' && (
        <Pressable onPress={() => setPicking(false)}>
          <Text style={styles.timeDone}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Active window ────────────────────────────────────────────────────────────

export function ActiveWindowSheet({ currentStart, currentEnd, timeFormat, onSave, onClose }: {
  currentStart: string; currentEnd: string; timeFormat: TimeFormat;
  onSave: (start: string, end: string) => Promise<void>; onClose: () => void;
}) {
  const [start, setStart] = useState(currentStart);
  const [end, setEnd] = useState(currentEnd);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Six hours minimum, same as the web sheet — below that the scheduler can't
  // space the day's check-ins far enough apart to be worth asking separately.
  const isValid = timeToMinutes(end) - timeToMinutes(start) >= 360;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(start, end);
      onClose();
    } catch {
      setSaveError("Couldn't save your active window. Please try again.");
      setSaving(false);
    }
  };

  return (
    <SheetShell title="Active window" description="The hours check-ins can be scheduled in." onClose={onClose}>
      <View style={styles.timeRow}>
        <TimeField label="Opens" value={start} timeFormat={timeFormat} onChange={setStart} />
        <TimeField label="Closes" value={end} timeFormat={timeFormat} onChange={setEnd} />
      </View>
      {!isValid && <Text style={styles.error}>Your window needs to be at least six hours long.</Text>}
      {saveError && <Text style={styles.error}>{saveError}</Text>}
      <SheetButton label={saving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={!isValid || saving} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Check-ins per day ────────────────────────────────────────────────────────

export function FrequencySheet({ current, onSave, onClose }: {
  current: number; onSave: (freq: number) => Promise<void>; onClose: () => void;
}) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(selected);
      onClose();
    } catch {
      setSaveError("Couldn't save that. Please try again.");
      setSaving(false);
    }
  };

  return (
    <SheetShell title="Mind check-ins per day" description="How many times a day to ask." onClose={onClose}>
      <View style={styles.segmented}>
        {[2, 3, 4].map(n => (
          <Pressable key={n} onPress={() => setSelected(n)} style={[styles.segment, selected === n && styles.segmentActive]}>
            <Text style={[styles.segmentText, selected === n && styles.segmentTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Three is enough for most people. More check-ins is not more accurate.</Text>
      {saveError && <Text style={styles.error}>{saveError}</Text>}
      <SheetButton label={saving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={saving} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Do not disturb hours ─────────────────────────────────────────────────────

export function DndSheet({ dndStartTime, dndEndTime, timeFormat, onTimeChange, onClose }: {
  dndStartTime: string; dndEndTime: string; timeFormat: TimeFormat;
  onTimeChange: (start: string, end: string) => void; onClose: () => void;
}) {
  const [start, setStart] = useState(dndStartTime);
  const [end, setEnd] = useState(dndEndTime);
  return (
    <SheetShell title="Do not disturb hours" description="No notifications during these hours. Check-ins still appear when you open the app." onClose={onClose}>
      <View style={styles.timeRow}>
        <TimeField label="From" value={start} timeFormat={timeFormat} onChange={setStart} />
        <TimeField label="Until" value={end} timeFormat={timeFormat} onChange={setEnd} />
      </View>
      <SheetButton label="Save" onPress={() => { onTimeChange(start, end); onClose(); }} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Time format ──────────────────────────────────────────────────────────────

export function TimeFormatSheet({ current, onChange, onClose }: {
  current: TimeFormat; onChange: (v: TimeFormat) => void; onClose: () => void;
}) {
  const opts: { value: TimeFormat; label: string; sub: string }[] = [
    { value: '12hr', label: '12-hour', sub: '7:30 am' },
    { value: '24hr', label: '24-hour', sub: '07:30' },
  ];
  return (
    <SheetShell title="Time format" onClose={onClose}>
      <View style={styles.optionList}>
        {opts.map(o => (
          <Pressable
            key={o.value}
            onPress={() => { onChange(o.value); onClose(); }}
            style={[styles.option, current === o.value && styles.optionActive]}>
            <Text style={[styles.optionLabel, current === o.value && styles.optionLabelActive]}>{o.label}</Text>
            <Text style={[styles.optionSub, current === o.value && styles.optionLabelActive]}>{o.sub}</Text>
          </Pressable>
        ))}
      </View>
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Domain enable/disable confirmations ──────────────────────────────────────

export function ConfirmDisableSheet({ domainLabel, onConfirm, onClose }: {
  domainLabel: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <SheetShell
      title={`Stop tracking ${domainLabel}?`}
      description="Your existing data is kept — it just won't be asked about in future check-ins. You can turn it back on any time."
      onClose={onClose}>
      <SheetButton
        label={saving ? 'Saving...' : 'Stop tracking it'}
        disabled={saving}
        onPress={async () => { setSaving(true); await onConfirm(); setSaving(false); }}
      />
      <SheetCancel onPress={onClose} label="Keep tracking it" />
    </SheetShell>
  );
}

/** Asked when a domain is turned on with no baseline on record, so the first
 *  check-in has something to compare against. */
export function BaselineModal({ domainLabel, onSubmit, onClose }: {
  domainLabel: string; onSubmit: (score: number) => Promise<void>; onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <SheetShell
      title={`Where does ${domainLabel} usually sit?`}
      description="A rough starting point, 0 to 10. It gets recalculated from your real check-ins as they build up."
      onClose={onClose}>
      <View style={styles.scaleRow}>
        {Array.from({ length: 11 }, (_, i) => i).map(n => (
          <Pressable
            key={n}
            disabled={saving}
            onPress={async () => { setSaving(true); await onSubmit(n); setSaving(false); }}
            style={({ pressed }) => [styles.scaleButton, pressed && styles.pressed]}>
            <Text style={styles.scaleButtonText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, color: '#f87171', marginBottom: 12 },
  hint: { fontSize: 12, color: '#8b90a4', lineHeight: 18, marginBottom: 12 },

  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timeField: { flex: 1 },
  timeFieldLabel: { fontSize: 11, color: '#4a5568', letterSpacing: 0.6, marginBottom: 6 },
  timeInput: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  timeInputText: { fontSize: 15, color: '#e2e8f0' },
  timeDone: { fontSize: 14, color: '#818cf8', textAlign: 'center', paddingVertical: 8 },

  segmented: {
    flexDirection: 'row', backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533',
    borderRadius: 10, padding: 3, gap: 2, marginBottom: 14,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#1e2533' },
  segmentText: { fontSize: 15, color: '#4a5568' },
  segmentTextActive: { color: '#e2e8f0', fontWeight: '600' },

  optionList: { gap: 8, marginBottom: 8 },
  option: {
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#0f1117',
    borderWidth: 1, borderColor: '#252b3b', borderRadius: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  optionActive: { backgroundColor: 'rgba(123,131,240,0.12)', borderColor: 'rgba(123,131,240,0.3)' },
  optionLabel: { fontSize: 15, color: '#e2e4ec' },
  optionLabelActive: { color: '#7b83f0' },
  optionSub: { fontSize: 13, color: '#555c72' },

  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  scaleButton: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0f1117', borderWidth: 1, borderColor: '#252b3b',
  },
  scaleButtonText: { fontSize: 15, color: '#e2e4ec' },
});
