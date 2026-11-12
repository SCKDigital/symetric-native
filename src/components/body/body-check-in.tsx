import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import DomainSlider from '@/components/checkin/domain-slider';
import BodyMap, { type PainSite } from '@/components/body/body-map';
import CharacterTags from '@/components/body/character-tags';
import EventSitePicker, { type EventSite } from '@/components/body/event-site-picker';
import { useAuth } from '@/contexts/auth-context';
import {
  trackBodyBackfillUsed, trackBodyCheckInCompleted, trackBodyCheckInStarted, trackBodyEventLogged, trackBodyMapOpened,
} from '@/lib/analytics';
import {
  BODY_DOMAINS, BODY_EARLY_LOG_HOUR, BODY_EARLY_LOG_SENSITIVE_DOMAINS, BODY_EVENT_ORDER, BODY_EVENTS,
  BREATHLESSNESS_CHARACTER_TAGS, CHECKIN_BODY_DOMAIN_ORDER, PAIN_CHARACTER_TAGS, REACTION_CHARACTER_TAGS,
} from '@/lib/body/constants';
import * as Crypto from 'expo-crypto';
import { loadBodyBaselines } from '@/lib/body/load-body-baselines';
import { BODY_COLOR } from '@/lib/domains';
import { addDays, parseDateString, todayDateString } from '@/lib/date-utils';
import { pendingPayloads, submit } from '@/lib/offline/outbox';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType, BodyEventType, BodySide } from '@/lib/supabase';
import { makeAccentStyles } from '@/lib/accent-styles';

function friendlyDate(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  if (dateStr === addDays(todayStr, -1)) return 'Yesterday';
  return parseDateString(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  initialDate?: string;
}

type DomainValues = Partial<Record<BodyDomainType, number>>;

/** checkinId when the day's only entry is one still waiting to sync: there is
 *  an entry (so a save is an edit) but no server id for it yet. */
const PENDING_ENTRY = 'pending';

// The evening check-in form (chunks 1, 3, and 4 of the body-tracking port,
// see project_rn_body_tracking_scoping.md): domain sliders (now respecting
// profile.body_domains_active, customizable via Settings' real toggle
// sheet as of chunk 4), the interactive BodyMap pain-site diagram (chunk 3
// — closes the check-in-form gap: pain_diffuse/body_pain_sites, deferred
// since chunk 1), event checklist (with the chip-based EventSitePicker),
// character tags, and a note field. Deliberately NOT ported: the optional
// morning check-in, onboarding's body-consent step.
export default function BodyCheckIn({ visible, onClose, initialDate }: Props) {
  const styles = useStyles();
  const { user, profile } = useAuth();
  // Sliders live inside this ScrollView. A horizontal drag that starts with
  // any vertical component gets claimed by the scroll, which is what made the
  // sliders feel sticky — worst on the last domain, where there is the most
  // scroll travel left to compete for. Locked while a slider is being dragged.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [today] = useState(() => todayDateString());

  const [selectedDate, setSelectedDate] = useState(initialDate ?? today);
  const [loading, setLoading] = useState(true);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [values, setValues] = useState<DomainValues>({});
  // Each domain's own rolling baseline, used as the slider's resting position
  // and as the value stored for a domain that is never touched. Empty until
  // the history fetch lands; every read falls back to the 0-10 midpoint, which
  // is also what rollingBodyBaseline returns before there are 7 logged days.
  const [domainBaselines, setDomainBaselines] = useState<Partial<Record<BodyDomainType, number>>>({});
  const [painDiffuse, setPainDiffuse] = useState(false);
  const [painSites, setPainSites] = useState<PainSite[]>([]);
  const [painCharacter, setPainCharacter] = useState<string[]>([]);
  const [breathlessnessCharacter, setBreathlessnessCharacter] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [tickedEvents, setTickedEvents] = useState<Set<BodyEventType>>(new Set());
  const [existingEventIds, setExistingEventIds] = useState<Partial<Record<BodyEventType, string>>>({});
  const [eventSites, setEventSites] = useState<Partial<Record<BodyEventType, EventSite[]>>>({});
  const [eventCharacter, setEventCharacter] = useState<Partial<Record<BodyEventType, string[]>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // profile.body_domains_active's DB default/history can still carry the
  // legacy 'exertion' value (see BODY_DOMAIN_ORDER's comment) — filtering
  // through CHECKIN_BODY_DOMAIN_ORDER.includes/BODY_DOMAINS lookups below
  // already drops anything not in the current config, same defensive
  // pattern the web app's own bodyClusterDetection.ts uses.
  const activeDomains = profile?.body_domains_active?.length
    ? CHECKIN_BODY_DOMAIN_ORDER.filter(d => profile.body_domains_active.includes(d) || BODY_DOMAINS[d].required)
    : CHECKIN_BODY_DOMAIN_ORDER;

  useEffect(() => {
    if (visible) trackBodyCheckInStarted();
  }, [visible]);

  useEffect(() => {
    if (selectedDate !== today) {
      const daysAgo = Math.round((parseDateString(today).getTime() - parseDateString(selectedDate).getTime()) / 86400000);
      trackBodyBackfillUsed(daysAgo);
    }
  }, [selectedDate, today]);

  useEffect(() => {
    if ((values.pain_mechanical ?? 0) > 0 || (values.joint_instability ?? 0) > 0) {
      trackBodyMapOpened();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(values.pain_mechanical ?? 0) > 0 || (values.joint_instability ?? 0) > 0]);

  // An untouched slider records this domain's baseline rather than a flat 5,
  // so "typical for me" is what gets stored on a day nothing was changed. Same
  // rolling-median rule the detectors use, so the stored value and the value
  // it is later compared against come from one definition. Days before the one
  // being edited only — including it would fold a value into its own baseline.
  useEffect(() => {
    if (!user || !visible) return;
    let cancelled = false;
    loadBodyBaselines(user.id, selectedDate).then(next => {
      if (!cancelled) setDomainBaselines(next);
    });
    return () => { cancelled = true; };
  }, [user, visible, selectedDate]);

  useEffect(() => {
    if (!user || !visible) return;
    let cancelled = false;
    // Re-synced to true on every selectedDate/visible change, not just once
    // — see use-history.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    (async () => {
      const { data: checkin } = await supabase
        .from('body_checkins').select('*').eq('user_id', user.id).eq('entry_date', selectedDate).maybeSingle();

      if (cancelled) return;

      if (checkin) {
        setCheckinId(checkin.id);
        const nextValues: DomainValues = {};
        for (const d of CHECKIN_BODY_DOMAIN_ORDER) {
          const v = checkin[d as keyof typeof checkin] as number | null | undefined;
          if (v !== null && v !== undefined) nextValues[d] = v;
        }
        setValues(nextValues);
        setPainDiffuse(checkin.pain_diffuse);
        setPainCharacter(checkin.pain_character ?? []);
        setBreathlessnessCharacter(checkin.breathlessness_character ?? []);
        setNote(checkin.note ?? '');
        setNoteExpanded(!!checkin.note);

        const { data: sites } = await supabase.from('body_pain_sites').select('*').eq('body_checkin_id', checkin.id);
        if (!cancelled) setPainSites((sites ?? []).map(s => ({ region: s.region, side: s.side, aspect: s.aspect })));
      } else {
        setCheckinId(null);
        setValues({});
        setPainDiffuse(false);
        setPainSites([]);
        setPainCharacter([]);
        setBreathlessnessCharacter([]);
        setNote('');
        setNoteExpanded(false);
      }

      const { data: events } = await supabase
        .from('body_events').select('*, body_event_sites(region, side)')
        .eq('user_id', user.id).eq('event_date', selectedDate);

      if (cancelled) return;

      const nextTicked = new Set<BodyEventType>();
      const nextIds: Partial<Record<BodyEventType, string>> = {};
      const nextSites: Partial<Record<BodyEventType, EventSite[]>> = {};
      const nextCharacter: Partial<Record<BodyEventType, string[]>> = {};
      for (const ev of events ?? []) {
        const type = ev.event_type as BodyEventType;
        nextTicked.add(type);
        nextIds[type] = ev.id;
        const sitesForEvent = (ev as unknown as { body_event_sites: { region: string; side: BodySide | null }[] }).body_event_sites;
        if (sitesForEvent?.length) nextSites[type] = sitesForEvent.map(s => ({ region: s.region, side: s.side }));
        const characterForEvent = (ev as unknown as { character: string[] | null }).character;
        if (characterForEvent?.length) nextCharacter[type] = characterForEvent;
      }

      // An entry for this day still waiting in the outbox is newer than
      // anything the server holds (and is all there is offline), so the form
      // reopens on it. Server event ids are kept, so unticking an event that
      // is already on the server still removes it.
      const pending = pendingPayloads('body.save').filter(p => p.entryDate === selectedDate).at(-1);
      if (pending) {
        const f = pending.fields as Record<string, unknown>;
        if (!checkin) setCheckinId(PENDING_ENTRY);
        const nextValues: DomainValues = {};
        for (const d of CHECKIN_BODY_DOMAIN_ORDER) {
          const v = f[d];
          if (typeof v === 'number') nextValues[d] = v;
        }
        setValues(nextValues);
        setPainDiffuse(!!f.pain_diffuse);
        setPainCharacter((f.pain_character as string[] | undefined) ?? []);
        setBreathlessnessCharacter((f.breathlessness_character as string[] | undefined) ?? []);
        setNote((f.note as string | null) ?? '');
        setNoteExpanded(!!f.note);
        setPainSites(pending.painSites.map(s => ({ region: s.region, side: s.side, aspect: s.aspect }) as PainSite));
        nextTicked.clear();
        for (const k of Object.keys(nextSites) as BodyEventType[]) delete nextSites[k];
        for (const k of Object.keys(nextCharacter) as BodyEventType[]) delete nextCharacter[k];
        for (const ev of pending.events) {
          nextTicked.add(ev.type);
          nextIds[ev.type] ??= ev.newId;
          if (ev.sites.length) nextSites[ev.type] = ev.sites.map(s => ({ region: s.region, side: s.side as BodySide | null }));
          if (ev.character?.length) nextCharacter[ev.type] = ev.character;
        }
      }

      setTickedEvents(nextTicked);
      setExistingEventIds(nextIds);
      setEventSites(nextSites);
      setEventCharacter(nextCharacter);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, visible, selectedDate]);

  const showBodyMap = (values.pain_mechanical ?? 0) > 0 || (values.joint_instability ?? 0) > 0;
  const showPainCharacter = (values.pain_mechanical ?? 0) > 0 || (values.pain_widespread ?? 0) > 0;
  const showBreathlessnessCharacter = (values.breathlessness ?? 0) > 0;
  const painCharacterAnchor = activeDomains.includes('pain_widespread')
    ? 'pain_widespread'
    : activeDomains.includes('pain_mechanical')
      ? 'pain_mechanical'
      : null;
  const isEarlyLog = selectedDate === today && new Date().getHours() < BODY_EARLY_LOG_HOUR;

  const toggleEvent = (type: BodyEventType) => {
    setTickedEvents(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        setEventSites(s => ({ ...s, [type]: [] }));
        setEventCharacter(c => ({ ...c, [type]: [] }));
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    const retro = selectedDate !== today;
    const payload: Record<string, unknown> = {
      user_id: user.id,
      entry_date: selectedDate,
      pain_diffuse: painDiffuse,
      pain_character: painCharacter.filter(t => PAIN_CHARACTER_TAGS.includes(t)),
      breathlessness_character: breathlessnessCharacter.filter(t => BREATHLESSNESS_CHARACTER_TAGS.includes(t)),
      note: note || null,
      entered_retroactively: retro,
    };
    for (const d of activeDomains) {
      // Every domain the form showed stores what its slider was showing,
      // touched or not, so the form never claims a rating it didn't save. For
      // an untouched domain that is the rolling baseline — invented data, but
      // "typical for me" rather than a flat 5, which distorts the baselines it
      // feeds far less.
      //
      // activeDomains, not CHECKIN_BODY_DOMAIN_ORDER: a domain this person has
      // never turned on has no slider, so there is nothing it was showing and
      // nothing to invent. Iterating the full list wrote a value for every
      // domain in the app on every save, and a never-enabled domain has no
      // history for rollingBodyBaseline to work from, so that value was the 5
      // fallback — every day, forever. That is how a flat 5 for gut reached
      // History for someone who had never been offered the question.
      //
      // Domains that are off are omitted from the payload rather than written
      // as null, which is the rule the morning form already states: writes
      // touch only what is currently asked, so turning a domain off never
      // nulls the readings taken while it was on.
      payload[d] = values[d] ?? domainBaselines[d] ?? 5;
    }

    // The whole entry goes as one command: the day's row, its pain sites and
    // its events, as the form now shows them. Sent now if the server can be
    // reached, kept on the phone otherwise. The handler (lib/offline/commands
    // .ts) reconciles against the server when it runs, so the delete-then-
    // insert steps that used to run here, each able to fail on its own, now
    // either all land or are all retried.
    const { user_id: _userId, entry_date: _entryDate, ...fields } = payload;
    if (checkinId) fields.edited_at = new Date().toISOString();
    const result = await submit(user.id, 'body.save', {
      entryDate: selectedDate,
      fields,
      painSites: painSites.map(s => ({ region: s.region, side: s.side, aspect: s.aspect })),
      events: BODY_EVENT_ORDER.filter(type => tickedEvents.has(type)).map(type => ({
        type,
        newId: Crypto.randomUUID(),
        retro,
        character: eventCharacter[type]?.length ? eventCharacter[type]! : null,
        sites: (eventSites[type] ?? []).map(s => ({ region: s.region, side: s.side })),
      })),
      removedEventTypes: BODY_EVENT_ORDER.filter(type => type in existingEventIds && !tickedEvents.has(type)),
    });
    if (result.status === 'rejected') {
      console.error('[BodyCheckIn] save rejected:', result.error);
      setSaving(false);
      setError('Could not save. Try again.');
      return;
    }
    for (const type of tickedEvents) {
      if (!(type in existingEventIds)) trackBodyEventLogged(type);
    }

    const domainCount = activeDomains.filter(d => values[d] !== undefined).length;
    trackBodyCheckInCompleted(domainCount, tickedEvents.size, retro);

    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  if (!user) return null;

  const dateShortcuts = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={scrollEnabled}>
          <View style={styles.header}>
            <Text style={styles.headerLabel}>Body check-in</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>{friendlyDate(selectedDate, today)}</Text>
            <View style={styles.dateShortcutRow}>
              {dateShortcuts.map(({ label, value }) => {
                const isSelected = selectedDate === value;
                return (
                  <Pressable key={value} onPress={() => setSelectedDate(value)} style={[styles.dateShortcut, isSelected && styles.dateShortcutActive]}>
                    <Text style={[styles.dateShortcutText, isSelected && styles.dateShortcutTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {!loading && (
            <>
              <View style={styles.slidersCard}>
                <View style={styles.slidersGroup}>
                  {activeDomains.map(d => {
                    const config = BODY_DOMAINS[d];
                    const note2 = isEarlyLog && BODY_EARLY_LOG_SENSITIVE_DOMAINS.includes(d)
                      ? "The day isn't over yet. You can come back and edit this later."
                      : undefined;
                    return (
                      <View key={d}>
                        <DomainSlider
              onSlidingStart={() => setScrollEnabled(false)}
              onSlidingComplete={() => setScrollEnabled(true)}
                          domain={d}
                          label={config.label}
                          hint={config.hint}
                          lowLabel={config.lowAnchor}
                          highLabel={config.highAnchor}
                          value={values[d] ?? domainBaselines[d] ?? 5}
                          onChange={v => setValues(prev => ({ ...prev, [d]: v }))}
                          color={BODY_COLOR}
                          note={note2}

                        />
                        {d === painCharacterAnchor && showPainCharacter && (
                          <CharacterTags options={PAIN_CHARACTER_TAGS} selected={painCharacter} onChange={setPainCharacter} />
                        )}
                        {d === 'breathlessness' && showBreathlessnessCharacter && (
                          <CharacterTags options={BREATHLESSNESS_CHARACTER_TAGS} selected={breathlessnessCharacter} onChange={setBreathlessnessCharacter} />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              {showBodyMap && (
                <View style={styles.mapCard}>
                  <Text style={styles.mapHint}>Where does it hurt or feel unstable?</Text>
                  <BodyMap sites={painSites} onChange={setPainSites} />
                  <Pressable onPress={() => setPainDiffuse(prev => !prev)} style={[styles.diffuseButton, painDiffuse && styles.diffuseButtonActive]}>
                    <View style={[styles.diffuseCheckbox, painDiffuse && styles.diffuseCheckboxActive]} />
                    <Text style={[styles.diffuseButtonText, painDiffuse && styles.diffuseButtonTextActive]}>Diffuse: can’t pin it anywhere</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.eventsCard}>
                <Text style={styles.eventsHint}>Anything happen today?</Text>
                <View style={styles.eventsList}>
                  {BODY_EVENT_ORDER.map(type => {
                    const config = BODY_EVENTS[type];
                    const ticked = tickedEvents.has(type);
                    return (
                      <View key={type}>
                        <Pressable onPress={() => toggleEvent(type)} style={styles.eventRow}>
                          <View style={[styles.eventCheckbox, ticked && styles.eventCheckboxChecked]} />
                          <View style={styles.eventText}>
                            <Text style={[styles.eventLabel, ticked && styles.eventLabelTicked]}>{config.label}</Text>
                            {config.hint && <Text style={styles.eventHint}>{config.hint}</Text>}
                          </View>
                        </Pressable>
                        {ticked && config.sitePrompt && (
                          <EventSitePicker eventType={type} sites={eventSites[type] ?? []} onChange={s => setEventSites(prev => ({ ...prev, [type]: s }))} />
                        )}
                        {ticked && config.characterPrompt && (
                          <CharacterTags options={REACTION_CHARACTER_TAGS} selected={eventCharacter[type] ?? []} onChange={tags => setEventCharacter(prev => ({ ...prev, [type]: tags }))} />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.noteCard}>
                {noteExpanded ? (
                  <>
                    <Text style={styles.noteLabel}>Note</Text>
                    <TextInput
                      value={note}
                      onChangeText={t => setNote(t.slice(0, 500))}
                      placeholder="Anything else worth remembering about today?"
                      placeholderTextColor="#4a5568"
                      multiline
                      style={styles.noteInput}
                    />
                  </>
                ) : (
                  <Pressable onPress={() => setNoteExpanded(true)}>
                    <Text style={styles.addNoteText}>+ Add a note</Text>
                  </Pressable>
                )}
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

const useStyles = makeAccentStyles(b => ({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 96 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerLabel: { fontSize: 13, fontWeight: '500', color: BODY_COLOR, textTransform: 'uppercase', letterSpacing: 0.6 },
  closeIcon: { fontSize: 18, color: '#64748b' },
  dateBlock: { marginBottom: 20 },
  dateLabel: { fontSize: 20, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.2, marginBottom: 10 },
  dateShortcutRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dateShortcut: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12' },
  dateShortcutActive: { borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  dateShortcutText: { fontSize: 12, color: '#8892a4' },
  dateShortcutTextActive: { color: BODY_COLOR },
  slidersCard: { backgroundColor: '#1e2840', borderWidth: 1, borderColor: '#3d4f7a', borderRadius: 20, padding: 24, paddingTop: 28, marginBottom: 16 },
  slidersGroup: { gap: 28 },
  mapCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  mapHint: { fontSize: 13, color: '#718096', marginBottom: 14 },
  diffuseButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2d3748' },
  diffuseButtonActive: { borderWidth: 1.5, borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  diffuseCheckbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: '#4a5568' },
  diffuseCheckboxActive: { borderWidth: 0, backgroundColor: BODY_COLOR },
  diffuseButtonText: { fontSize: 12.5, color: '#8892a4' },
  diffuseButtonTextActive: { color: BODY_COLOR },
  eventsCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  eventsHint: { fontSize: 13, color: '#718096', marginBottom: 14 },
  eventsList: { gap: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, minHeight: 44 },
  eventCheckbox: { width: 18, height: 18, borderRadius: 5, marginTop: 1, borderWidth: 1.5, borderColor: '#4a5568' },
  eventCheckboxChecked: { borderWidth: 0, backgroundColor: b.textSoft },
  eventText: { flex: 1 },
  eventLabel: { fontSize: 14, color: '#cbd5e0' },
  eventLabelTicked: { color: '#e2e8f0' },
  eventHint: { fontSize: 12, color: '#6b7690', marginTop: 1 },
  noteCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  noteLabel: { fontSize: 13, color: '#718096', marginBottom: 10 },
  noteInput: { color: '#e2e8f0', fontSize: 13, minHeight: 60, textAlignVertical: 'top', padding: 0 },
  addNoteText: { fontSize: 13, color: '#718096' },
  saveButton: { padding: 14, borderRadius: 12, backgroundColor: BODY_COLOR, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#1e2533' },
  saveButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saveButtonTextDisabled: { color: '#4a5568' },
  requiredHint: { fontSize: 13, color: '#8892a4', marginTop: 10, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 12, textAlign: 'center' },
}));
