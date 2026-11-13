import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Note, OptOutLink, PrimaryButton, SetupScreen } from '@/components/setup/setup-kit';
import { PlatformPicker } from '@/components/shared/platform-picker';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';
import { cycleDayForDate, dateToString, parseDateString, todayDateString } from '@/lib/date-utils';
import { markerColors } from '@/lib/marker-colors';
import { createMarker } from '@/lib/queries/markers';

const PINK = markerColors.cycle_phase;
const WEEKS = 6;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * "When did your last period start?" as its own screen (2026-11-14).
 *
 * The setup card used to open the general Add marker form: find Cycle among
 * four types, confirm "Day 1", pick a date from week-sized shortcuts or a raw
 * 2026-11-14, and fill in "What changed?". This asks the one question, with a
 * calendar of the last six weeks, and shows what the answer gives straight
 * away: the same Day N that History shows.
 *
 * The marker it saves is identical to the form's (cycle_phase, day_one,
 * "Day 1"), so nothing that reads markers changes.
 */
export function CycleDayOneScreen({ onSaved, onClose, onOptOut }: {
  onSaved: () => void;
  onClose: () => void;
  onOptOut: () => void;
}) {
  const styles = useStyles();
  const todayStr = todayDateString();
  const today = parseDateString(todayStr);
  // Monday-first weeks, the current one last.
  const thisMonday = addDays(today, -((today.getDay() + 6) % 7));
  const start = addDays(thisMonday, -7 * (WEEKS - 1));

  const [picked, setPicked] = useState<string | null>(null);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!picked || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createMarker({ marker_type: 'cycle_phase', marker_date: picked, label: 'Day 1', medication_action: 'day_one' });
      onSaved();
    } catch {
      setError('Could not save that. Try again.');
      setSaving(false);
    }
  };

  const weeks: { label: string | null; days: Date[] }[] = [];
  let month = -1;
  for (let w = 0; w < WEEKS; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    const opens = days.find(d => d.getMonth() !== month && (w === 0 || d.getDate() === 1));
    if (opens) month = opens.getMonth();
    weeks.push({ label: opens ? MONTHS[opens.getMonth()].toUpperCase() : null, days });
  }

  const pickedDate = picked ? parseDateString(picked) : null;
  const dayN = picked ? cycleDayForDate(todayStr, [picked]) : null;

  return (
    <SetupScreen
      stepLabel="Cycle · optional"
      title="When did your last period start?"
      lede="Tap the first day. An estimate is fine."
      onClose={onClose}
      footer={(
        <>
          <PrimaryButton label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={!picked || saving} wide />
          <OptOutLink label="I don't want to track my cycle" onPress={onOptOut} />
        </>
      )}>
      <View style={styles.cal}>
        <View style={styles.row}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} style={styles.dow}>{l}</Text>)}
        </View>
        {weeks.map((wk, wi) => (
          <View key={wi}>
            {wk.label && <Text style={styles.month}>{wk.label}</Text>}
            <View style={styles.row}>
              {wk.days.map(d => {
                const iso = dateToString(d);
                const future = iso > todayStr;
                const on = iso === picked;
                const isToday = iso === todayStr;
                return (
                  <View key={iso} style={styles.cell}>
                    <Pressable
                      onPress={() => setPicked(iso)}
                      disabled={future}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: future }}
                      accessibilityLabel={`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`}
                      style={[styles.day, isToday && styles.today, on && styles.dayOn]}>
                      <Text style={[styles.dayText, future && styles.dayFuture, on && styles.dayTextOn]}>{d.getDate()}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={() => setEarlierOpen(true)} accessibilityRole="button" hitSlop={6}>
        <Text style={styles.earlier}>Earlier than this?</Text>
      </Pressable>
      {earlierOpen && (
        <PlatformPicker
          mode="date"
          value={pickedDate ?? start}
          maximumDate={today}
          onPick={d => setPicked(dateToString(d))}
          onClose={() => setEarlierOpen(false)}
          dividerColor="#1e2533"
        />
      )}

      {pickedDate ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>
            Day 1 was {DAYS[pickedDate.getDay()]} {pickedDate.getDate()} {MONTHS[pickedDate.getMonth()].slice(0, 3)}
          </Text>
          <Text style={styles.resultBody}>
            {dayN !== null
              ? `That makes today day ${dayN}. You'll see the count on History from now on.`
              : "That's more than 60 days ago, so day counts will start from your next Day 1."}
          </Text>
        </View>
      ) : (
        <View style={[styles.result, styles.resultEmpty]}>
          <Text style={styles.resultHint}>Pick a day to see where you are in your cycle.</Text>
        </View>
      )}

      <Text style={styles.why}>Only you see this. It adds day counts to History and your report.</Text>
      {error && <Note tone="error">{error}</Note>}
    </SetupScreen>
  );
}

const useStyles = makeAccentStyles(b => ({
  cal: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 10, gap: 2 },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, color: '#4a5568', fontWeight: '600', paddingBottom: 2 },
  month: { fontSize: 11, color: '#6b7a99', fontWeight: '700', letterSpacing: 0.8, paddingTop: 6, paddingBottom: 2, paddingLeft: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 1 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: '#6b7a99' },
  dayOn: { backgroundColor: PINK, borderColor: PINK },
  dayText: { fontSize: 15, color: '#e2e8f0', fontVariant: ['tabular-nums'] },
  dayFuture: { color: '#4a5568', opacity: 0.5 },
  dayTextOn: { color: '#ffffff', fontWeight: '700' },
  earlier: { fontSize: 14, fontWeight: '600', color: b.text, paddingVertical: 2 },
  result: { borderRadius: 14, padding: 14, gap: 3, backgroundColor: brandTint(PINK, 0.08), borderWidth: 1, borderColor: brandTint(PINK, 0.3), minHeight: 64, justifyContent: 'center' },
  resultEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#1e2533' },
  resultTitle: { fontSize: 15, fontWeight: '600', color: '#f9a8d4' },
  resultBody: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  resultHint: { fontSize: 13, color: '#4a5568' },
  why: { fontSize: 12.5, color: '#4a5568', lineHeight: 18 },
}));
