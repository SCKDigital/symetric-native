import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { TimePair } from '@/components/onboarding/check-in-preferences-step';
import { KeyItem } from '@/components/setup/body-setup-flow';
import { DayBar, FooterRow, Note, SetupScreen } from '@/components/setup/setup-kit';
import { Toggle } from '@/components/settings/settings-primitives';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';
import { bodyTimingProblem } from '@/lib/body/timing';
import { BODY_COLOR } from '@/lib/domains';
import type { TimeRange } from '@/lib/quiet-hours';
import type { TimeFormat } from '@/lib/time-format';

interface Props {
  timeFormat: TimeFormat;
  /** Her mind waking window and check-ins per day, drawn faintly on the day
   *  bar behind the body check-ins. */
  mindWindow: TimeRange;
  mindPerDay: number;
  currentAvailableFrom: string;
  currentReminderTime: string;
  currentMorningEnabled: boolean;
  currentMorningTime: string;
  /** Opened from the Morning check-in switch: start with morning on. */
  startWithMorning?: boolean;
  onSaveTiming: (availableFrom: string, reminderTime: string, morningEnabled: boolean, morningTime: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Settings › Body tracking times, rebuilt 2026-11-14 to match body setup's
 * second screen: the same day bar, the same Opens / Remind me pair, the same
 * rules (lib/body/timing.ts).
 *
 * What changed from the port of the web sheet: times follow her 12/24-hour
 * setting instead of showing raw 17:00; the stale "three scores (fatigue,
 * pain, dizziness)" copy is gone, since she now picks her morning symptoms;
 * the symptom pills it repeated are left to the Settings page, which already
 * shows them; and a reminder before opening, or a morning check-in after the
 * evening one, can no longer be saved.
 *
 * Nothing is written until Save.
 */
export default function BodyTrackingSheet({
  timeFormat, mindWindow, mindPerDay, currentAvailableFrom, currentReminderTime,
  currentMorningEnabled, currentMorningTime, startWithMorning, onSaveTiming, onClose,
}: Props) {
  const styles = useStyles();
  const [from, setFrom] = useState(currentAvailableFrom.slice(0, 5));
  const [remind, setRemind] = useState(currentReminderTime.slice(0, 5));
  const [morningOn, setMorningOn] = useState(startWithMorning || currentMorningEnabled);
  const [morningAt, setMorningAt] = useState(currentMorningTime.slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = from !== currentAvailableFrom.slice(0, 5)
    || remind !== currentReminderTime.slice(0, 5)
    || morningOn !== currentMorningEnabled
    || morningAt !== currentMorningTime.slice(0, 5);
  const problem = bodyTimingProblem({ eveningFrom: from, reminder: remind, morningEnabled: morningOn, morningAt });

  const handleSave = async () => {
    if (!dirty) { onClose(); return; }
    if (problem || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveTiming(from, remind, morningOn, morningAt);
      onClose();
    } catch {
      setSaveError('Could not save your times. Try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SetupScreen
        stepLabel="Body tracking"
        title="When should we ask?"
        onClose={onClose}
        footer={(
          <FooterRow
            note={dirty ? undefined : 'No changes yet'}
            label={dirty ? 'Save' : 'Done'}
            onPress={handleSave}
            disabled={dirty && !!problem}
            busy={saving}
          />
        )}>
        <DayBar
          window={mindWindow}
          checkIns={mindPerDay}
          timeFormat={timeFormat}
          body={{ eveningFrom: from, reminder: remind, morning: morningOn ? morningAt : null, color: BODY_COLOR }}>
          <View style={styles.key}>
            <KeyItem color="#262f3d" label="Mind check-ins" />
            <KeyItem color={brandTint(BODY_COLOR, 0.55)} label="Body, evening" />
            {morningOn && <KeyItem color={BODY_COLOR} label="Body, morning" round />}
          </View>
        </DayBar>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Evening check-in</Text>
          <Text style={styles.blockSub}>
            Opens on Today at this time and stays open until you go to bed. The reminder is a single nudge, sent only
            if you haven&apos;t logged yet.
          </Text>
          <TimePair
            left={{ label: 'Opens', value: from }}
            right={{ label: 'Remind me', value: remind }}
            timeFormat={timeFormat}
            onChange={(side, v) => (side === 'left' ? setFrom(v) : setRemind(v))}
          />
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <View style={styles.blockHeadText}>
              <Text style={styles.blockTitle}>Morning check-in</Text>
              <Text style={styles.blockSub}>
                Optional. A short check-in before the day starts, so Symetric can compare how you wake with how the day
                ends. Choose what it asks about on the Settings page.
              </Text>
            </View>
            <Toggle value={morningOn} onValueChange={setMorningOn} />
          </View>
          {morningOn && (
            <TimePair left={{ label: 'Opens', value: morningAt }} timeFormat={timeFormat} onChange={(_, v) => setMorningAt(v)} />
          )}
        </View>

        {problem && <Note tone="error">{problem}</Note>}
        {saveError && <Note tone="error">{saveError}</Note>}
      </SetupScreen>
    </Modal>
  );
}

const useStyles = makeAccentStyles(() => ({
  key: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  block: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 14, gap: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockHeadText: { flex: 1, gap: 3 },
  blockTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  blockSub: { fontSize: 12.5, color: '#8892a4', lineHeight: 18 },
}));
