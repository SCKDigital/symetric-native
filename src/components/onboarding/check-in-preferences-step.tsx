import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DayBar, FieldLabel, FooterRow, Note, Segmented, SetupScreen } from '@/components/setup/setup-kit';
import { PlatformPicker } from '@/components/shared/platform-picker';
import { makeAccentStyles } from '@/lib/accent-styles';
import { dateToTimeString, timeStringToDate } from '@/lib/date-utils';
import {
  approxQuietCount, clampToWindow, defaultQuietHours, fitQuietHours, quietHoursProblem, toMinutes, type TimeRange,
} from '@/lib/quiet-hours';
import { formatWindowTime, type TimeFormat } from '@/lib/time-format';

export interface CheckInPreferencesUpdate {
  checkInsPerDay?: number;
  windowStart?: string;
  windowEnd?: string;
  /** null removes quiet hours. */
  quiet?: TimeRange | null;
}

interface CheckInPreferencesStepProps {
  checkInsPerDay: number;
  windowStart: string;
  windowEnd: string;
  /** How times are shown. Setup takes this from the phone rather than asking. */
  timeFormat: TimeFormat;
  quiet: TimeRange | null;
  onUpdate: (updates: CheckInPreferencesUpdate) => void;
  onNext: () => void;
  onClose: () => void;
  stepLabel: string;
  progress: number;
  saving?: boolean;
}

const MIN_WINDOW_MINUTES = 360;

/**
 * When to check in, redesigned 2026-11-14.
 *
 * Four sections became one picture. A day bar shows waking hours, roughly
 * where check-ins land and any quiet stretch. The clock-format question is
 * gone (setup uses the phone's own setting; Settings can still change it), and
 * quiet hours fold away behind one line because they're optional.
 *
 * Quiet hours can only sit inside waking hours: their pickers clamp to the
 * window, and narrowing the window shrinks them to fit. See lib/quiet-hours.ts.
 */
export default function CheckInPreferencesStep({
  checkInsPerDay, windowStart, windowEnd, timeFormat, quiet, onUpdate, onNext, onClose, stepLabel, progress, saving,
}: CheckInPreferencesStepProps) {
  const styles = useStyles();
  const window = { start: windowStart, end: windowEnd };
  const windowOk = toMinutes(windowEnd) - toMinutes(windowStart) >= MIN_WINDOW_MINUTES;
  const quietProblem = quiet && windowOk ? quietHoursProblem(quiet, window) : null;

  // Changing waking hours carries quiet hours along, so the two can't drift
  // apart. Only applied once the window is itself valid.
  const setWindow = (next: TimeRange) => {
    const update: CheckInPreferencesUpdate = { windowStart: next.start, windowEnd: next.end };
    if (quiet && toMinutes(next.end) - toMinutes(next.start) >= MIN_WINDOW_MINUTES) update.quiet = fitQuietHours(quiet, next);
    onUpdate(update);
  };

  const muted = quiet ? approxQuietCount(window, checkInsPerDay, quiet) : 0;
  const legend = `Around ${checkInsPerDay} times a day, at different times.`
    + (muted ? ' One may land in quiet hours. It will still be waiting when you open the app.' : " You'll see each one coming.");

  return (
    <SetupScreen
      stepLabel={stepLabel}
      progress={progress}
      title="When are you usually awake?"
      lede="We'll only check in between these times."
      onClose={onClose}
      footer={(
        <FooterRow
          note="Times follow your phone's clock"
          label="Continue"
          onPress={onNext}
          disabled={!windowOk || !!quietProblem}
          busy={saving}
        />
      )}>
      <DayBar window={window} checkIns={checkInsPerDay} quiet={quiet} timeFormat={timeFormat}>
        <TimePair
          left={{ label: 'Up by', value: windowStart }}
          right={{ label: 'Winding down', value: windowEnd }}
          timeFormat={timeFormat}
          onChange={(side, v) => setWindow(side === 'left' ? { start: v, end: windowEnd } : { start: windowStart, end: v })}
        />
      </DayBar>
      {!windowOk && <Note tone="error">Your waking hours need to be at least 6 hours, with winding down after waking up.</Note>}

      <FieldLabel>How many check-ins a day?</FieldLabel>
      <Segmented
        options={[2, 3, 4].map(n => ({ value: n, label: String(n) }))}
        value={checkInsPerDay}
        onChange={n => onUpdate({ checkInsPerDay: n })}
      />
      <Note>{legend}</Note>

      {quiet ? (
        <View style={styles.quietBox}>
          <View style={styles.quietHead}>
            <Text style={styles.quietTitle}>Quiet hours</Text>
            <Pressable onPress={() => onUpdate({ quiet: null })} hitSlop={8} accessibilityRole="button">
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
          <TimePair
            left={{ label: 'From', value: quiet.start }}
            right={{ label: 'Until', value: quiet.end }}
            timeFormat={timeFormat}
            // Clamped as well as limited: Android's time dialog ignores
            // minimum and maximum, so the limit is enforced on the value.
            limit={window}
            onChange={(side, v) => {
              const t = clampToWindow(v, window);
              onUpdate({ quiet: side === 'left' ? { start: t, end: quiet.end } : { start: quiet.start, end: t } });
            }}
          />
          <Text style={styles.quietNote}>Inside your waking hours only. Check-ins still happen; you just aren&apos;t notified.</Text>
          {quietProblem && <Note tone="error">{quietProblem}</Note>}
        </View>
      ) : (
        <Pressable onPress={() => onUpdate({ quiet: defaultQuietHours(window) })} disabled={!windowOk} accessibilityRole="button" hitSlop={6}>
          <Text style={[styles.addQuiet, !windowOk && styles.addQuietOff]}>+ Add quiet hours</Text>
        </Pressable>
      )}
    </SetupScreen>
  );
}

/**
 * Two times side by side, sharing one picker that opens full width beneath
 * them. Each field owning its own picker squeezed the iOS spinner into half
 * the screen.
 */
export function TimePair({ left, right, timeFormat, limit, onChange }: {
  left: { label: string; value: string };
  /** Omit for a single time. */
  right?: { label: string; value: string };
  timeFormat: TimeFormat;
  /** Limits the iOS spinner. Callers still clamp, for Android. */
  limit?: TimeRange;
  onChange: (side: 'left' | 'right', value: string) => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  const field = (side: 'left' | 'right', f: { label: string; value: string }) => (
    <Pressable
      onPress={() => setOpen(open === side ? null : side)}
      accessibilityRole="button"
      accessibilityLabel={`${f.label}, ${formatWindowTime(f.value, timeFormat)}`}
      style={[styles.tf, open === side && styles.tfOpen]}>
      <Text style={styles.tfLabel}>{f.label.toUpperCase()}</Text>
      <Text style={styles.tfValue}>{formatWindowTime(f.value, timeFormat)}</Text>
    </Pressable>
  );
  const current = open === 'left' ? left.value : open === 'right' && right ? right.value : null;
  return (
    <View style={styles.pairWrap}>
      <View style={styles.pair}>
        {field('left', left)}
        {right ? field('right', right) : <View style={styles.tfSpacer} />}
      </View>
      {open && current && (
        <PlatformPicker
          mode="time"
          value={timeStringToDate(current)}
          is24Hour={timeFormat === '24hr'}
          minimumDate={limit ? timeStringToDate(limit.start) : undefined}
          maximumDate={limit ? timeStringToDate(limit.end) : undefined}
          onPick={d => onChange(open, dateToTimeString(d))}
          onClose={() => setOpen(null)}
          dividerColor="#1e2533"
        />
      )}
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  pairWrap: { gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  tf: { flex: 1, backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#1e2533', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  tfOpen: { borderColor: b.fillAlt },
  tfSpacer: { flex: 1 },
  tfLabel: { fontSize: 11, color: '#6b7a99', fontWeight: '600', letterSpacing: 0.5 },
  tfValue: { fontSize: 17, color: '#e2e8f0', fontVariant: ['tabular-nums'] },

  addQuiet: { fontSize: 15, fontWeight: '600', color: b.text, paddingVertical: 6 },
  addQuietOff: { color: '#4a5568' },
  quietBox: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 14, gap: 10 },
  quietHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quietTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  remove: { fontSize: 13, color: '#6b7a99' },
  quietNote: { fontSize: 12.5, color: '#8892a4', lineHeight: 18 },
}));
