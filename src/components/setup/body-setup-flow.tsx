import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TimePair } from '@/components/onboarding/check-in-preferences-step';
import {
  DayBar, FooterRow, Note, OptOutLink, SelectTile, SetupScreen, SuggestRow, TileGrid,
} from '@/components/setup/setup-kit';
import { Toggle } from '@/components/settings/settings-primitives';
import { useAuth } from '@/contexts/auth-context';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';
import {
  BODY_DOMAINS, CHECKIN_BODY_DOMAIN_ORDER, DEFAULT_MORNING_DOMAINS, MORNING_CAPABLE_DOMAIN_ORDER, MORNING_DOMAIN_LIMIT,
} from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import { saveProfile } from '@/lib/offline/queued-writes';
import { toMinutes, type TimeRange } from '@/lib/quiet-hours';
import type { BodyDomainType } from '@/lib/supabase';
import type { TimeFormat } from '@/lib/time-format';

/** Half-width tile copy, cut down from each domain's hint in body/constants. */
const TILE_COPY: Partial<Record<BodyDomainType, string>> = {
  fatigue: 'How heavy your body felt',
  pain_mechanical: 'Places you could point to',
  pain_widespread: 'Aching or burning all over',
  joint_instability: 'Looseness, giving way',
  breathlessness: 'Air hunger, tight chest',
  orthostatic: 'Lightheaded on standing',
  gut: 'Nausea, bloating, cramping',
  brain_fog: 'Woolly thinking, lost words',
};

/** The old default three, offered as a button rather than pre-ticked. */
const SUGGESTED: BodyDomainType[] = ['fatigue', 'pain_mechanical', 'orthostatic'];

const PICKABLE = CHECKIN_BODY_DOMAIN_ORDER.filter(d => !BODY_DOMAINS[d].required);
const REQUIRED = CHECKIN_BODY_DOMAIN_ORDER.filter(d => BODY_DOMAINS[d].required);

/**
 * Body tracking setup as two short screens (2026-11-14 redesign), replacing
 * one long sheet.
 *
 * What it fixes: all eight symptoms started selected and picked-vs-not was only
 * a border colour; the descriptions each symptom already had weren't shown;
 * "End of day exhaustion" was asked every evening but never mentioned; the
 * evening's two times sat as unrelated pickers; turning on the morning
 * check-in repeated all eight pills; and the sheet's content scrolled under
 * the status bar.
 *
 * Nothing is written until Done, in one profile update, so closing half way
 * leaves the setup card exactly as it was.
 */
export function BodySetupFlow({ timeFormat, mindWindow, mindPerDay, onDone, onClose, onOptOut }: {
  timeFormat: TimeFormat;
  mindWindow: TimeRange;
  mindPerDay: number;
  onDone: () => void;
  onClose: () => void;
  onOptOut: () => void;
}) {
  const styles = useStyles();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [picks, setPicks] = useState<BodyDomainType[]>(
    () => (profile?.body_domains_active ?? []).filter(d => PICKABLE.includes(d)),
  );
  const [from, setFrom] = useState(profile?.body_available_from?.slice(0, 5) ?? '17:00');
  const [remind, setRemind] = useState(profile?.body_reminder_time?.slice(0, 5) ?? '21:00');
  const [morningOn, setMorningOn] = useState(profile?.body_morning_enabled ?? false);
  const [morningAt, setMorningAt] = useState(profile?.body_morning_time?.slice(0, 5) ?? '08:00');
  const [morningPicks, setMorningPicks] = useState<BodyDomainType[]>(
    () => (profile?.body_morning_domains?.length ? profile.body_morning_domains : DEFAULT_MORNING_DOMAINS),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePick = (d: BodyDomainType) =>
    setPicks(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d]));

  // The morning form only offers what's tracked in the evening: a morning
  // reading is worth having because it can be compared with one.
  const morningOptions = MORNING_CAPABLE_DOMAIN_ORDER.filter(d => picks.includes(d));
  const morningChosen = morningOptions.filter(d => morningPicks.includes(d)).slice(0, MORNING_DOMAIN_LIMIT);
  const toggleMorning = (d: BodyDomainType) => {
    if (morningChosen.includes(d)) setMorningPicks(p => p.filter(x => x !== d));
    else if (morningChosen.length < MORNING_DOMAIN_LIMIT) setMorningPicks(p => [...p.filter(x => morningOptions.includes(x)), d]);
  };

  // Neither rule was checked before: a reminder could fire before its
  // check-in opened, and the morning check-in could open after the evening one.
  const timingProblem = toMinutes(remind) < toMinutes(from)
    ? 'Your reminder needs to be at or after the time the evening check-in opens.'
    : morningOn && toMinutes(morningAt) >= toMinutes(from)
      ? 'The morning check-in needs to open before the evening one.'
      : null;

  const save = async () => {
    if (!user || busy || timingProblem) return;
    setBusy(true);
    setError(null);
    const { error: e } = await saveProfile(user.id, {
      body_domains_active: [...CHECKIN_BODY_DOMAIN_ORDER.filter(d => picks.includes(d)), ...REQUIRED],
      body_available_from: from,
      body_reminder_time: remind,
      body_morning_enabled: morningOn,
      body_morning_time: morningAt,
      body_morning_domains: morningChosen,
      body_setup_complete: true,
    });
    if (e) {
      setError('Could not save your body settings. Try again.');
      setBusy(false);
      return;
    }
    await refreshProfile();
    setBusy(false);
    onDone();
  };

  const optOut = <OptOutLink label="I don't want to track my body" onPress={onOptOut} />;

  if (step === 1) {
    const n = picks.length;
    return (
      <SetupScreen
        stepLabel="Body · 1 of 2"
        progress={0.5}
        progressColor={BODY_COLOR}
        title="Which body symptoms do you want to track?"
        lede="Asked once each evening. Pick any you live with."
        onClose={onClose}
        footer={(
          <>
            <FooterRow note={n === 0 ? 'Pick 1 or more' : `${n} picked, plus exhaustion`} label="Continue" onPress={() => setStep(2)} disabled={n === 0} />
            {optOut}
          </>
        )}>
        <SuggestRow title="Not sure? Start with three" detail="Fatigue, joint & muscle pain, dizziness" onUse={() => setPicks(SUGGESTED)} />
        <TileGrid>
          {PICKABLE.map(d => (
            <SelectTile
              key={d}
              label={BODY_DOMAINS[d].label}
              description={TILE_COPY[d]}
              color={BODY_COLOR}
              selected={picks.includes(d)}
              onPress={() => togglePick(d)}
            />
          ))}
        </TileGrid>
        <View style={styles.fixed}>
          <View style={styles.fixedDot} />
          <Text style={styles.fixedText}>
            <Text style={styles.fixedStrong}>{REQUIRED.map(d => BODY_DOMAINS[d].label).join(', ')}</Text> is always asked.
          </Text>
        </View>
      </SetupScreen>
    );
  }

  return (
    <SetupScreen
      stepLabel="Body · 2 of 2"
      progress={1}
      progressColor={BODY_COLOR}
      title="When should we ask?"
      onClose={onClose}
      footer={(
        <>
          <FooterRow note="All changeable in Settings" label="Done" onPress={save} disabled={!!timingProblem} busy={busy} onBack={() => setStep(1)} />
          {optOut}
        </>
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
        <Text style={styles.blockSub}>Opens in the evening, and stays open until you go to bed.</Text>
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
            <Text style={styles.blockTitle}>Morning check-in too</Text>
            <Text style={styles.blockSub}>Optional. Lets Symetric compare how you wake with how the day ends.</Text>
          </View>
          <Toggle value={morningOn} onValueChange={setMorningOn} />
        </View>
        {morningOn && (
          <>
            <TimePair
              left={{ label: 'Opens', value: morningAt }}
              timeFormat={timeFormat}
              onChange={(_, v) => setMorningAt(v)}
            />
            <Text style={styles.blockSub}>
              Up to {MORNING_DOMAIN_LIMIT} of your evening symptoms · {morningChosen.length} of {MORNING_DOMAIN_LIMIT}
            </Text>
            <View style={styles.chips}>
              {morningOptions.map(d => {
                const on = morningChosen.includes(d);
                const off = !on && morningChosen.length >= MORNING_DOMAIN_LIMIT;
                return (
                  <Pressable
                    key={d}
                    onPress={() => toggleMorning(d)}
                    disabled={off}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: off }}
                    style={[styles.chip, on && styles.chipOn, off && styles.chipOff]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{BODY_DOMAINS[d].label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {timingProblem && <Note tone="error">{timingProblem}</Note>}
      {error && <Note tone="error">{error}</Note>}
    </SetupScreen>
  );
}

function KeyItem({ color, label, round }: { color: string; label: string; round?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.keyItem}>
      <View style={[styles.keySwatch, { backgroundColor: color }, round && styles.keyRound]} />
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

const useStyles = makeAccentStyles(() => ({
  fixed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  fixedDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: brandTint(BODY_COLOR, 0.45) },
  fixedText: { flex: 1, fontSize: 13, color: '#8892a4', lineHeight: 18 },
  fixedStrong: { color: '#e2e8f0', fontWeight: '600' },

  key: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 12, height: 7, borderRadius: 4 },
  keyRound: { width: 8, height: 8 },
  keyText: { fontSize: 11.5, color: '#6b7a99' },

  block: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 14, gap: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockHeadText: { flex: 1, gap: 3 },
  blockTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  blockSub: { fontSize: 12.5, color: '#8892a4', lineHeight: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: '#1e2533', backgroundColor: '#0a0c12', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 },
  chipOn: { borderColor: BODY_COLOR, backgroundColor: brandTint(BODY_COLOR, 0.12) },
  chipOff: { opacity: 0.35 },
  chipText: { fontSize: 13, color: '#8892a4' },
  chipTextOn: { color: '#e2c08a' },
}));
