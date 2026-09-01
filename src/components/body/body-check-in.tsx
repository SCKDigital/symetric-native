import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DomainSlider from '@/components/checkin/domain-slider';
import CharacterTags from '@/components/body/character-tags';
import EventSitePicker, { type EventSite } from '@/components/body/event-site-picker';
import { useAuth } from '@/contexts/auth-context';
import {
  trackBodyBackfillUsed, trackBodyCheckInCompleted, trackBodyCheckInStarted, trackBodyEventLogged,
} from '@/lib/analytics';
import {
  BODY_DOMAINS, BODY_EARLY_LOG_HOUR, BODY_EARLY_LOG_SENSITIVE_DOMAINS, BODY_EVENT_ORDER, BODY_EVENTS,
  BREATHLESSNESS_CHARACTER_TAGS, CHECKIN_BODY_DOMAIN_ORDER, PAIN_CHARACTER_TAGS, REACTION_CHARACTER_TAGS,
} from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import { addDays, parseDateString, todayDateString } from '@/lib/date-utils';
import { supabase } from '@/lib/supabase';
import type { BodyDomainType, BodyEventType, BodySide } from '@/lib/supabase';

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

// Chunk 1 of the body-tracking port (see project_rn_rewrite_scoping.md):
// the evening check-in form — domain sliders, event checklist (with the
// chip-based EventSitePicker, not the interactive body map), character
// tags, and a note field. Deliberately NOT ported this chunk: BodyMap
// (the 528-line interactive front/back pain-site diagram — pain_diffuse
// and body_pain_sites go with it, both always saved as their empty/false
// default here), the optional morning check-in, Settings' per-domain
// toggle sheet, onboarding's body-consent step, and every read side
// (History/Insights/report) of body data. `activeDomains` currently
// always resolves to the full CHECKIN_BODY_DOMAIN_ORDER rather than
// reading profile.body_domains_active, since there's no Settings UI yet
// to have customized it away from the DB default.
export default function BodyCheckIn({ visible, onClose, initialDate }: Props) {
  const { user } = useAuth();
  const [today] = useState(() => todayDateString());

  const [selectedDate, setSelectedDate] = useState(initialDate ?? today);
  const [loading, setLoading] = useState(true);
  const [checkinId, setCheckinId] = useState<string | null>(null);
  const [values, setValues] = useState<DomainValues>({});
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

  const activeDomains = CHECKIN_BODY_DOMAIN_ORDER;

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
        setPainCharacter(checkin.pain_character ?? []);
        setBreathlessnessCharacter(checkin.breathlessness_character ?? []);
        setNote(checkin.note ?? '');
        setNoteExpanded(!!checkin.note);
      } else {
        setCheckinId(null);
        setValues({});
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
      setTickedEvents(nextTicked);
      setExistingEventIds(nextIds);
      setEventSites(nextSites);
      setEventCharacter(nextCharacter);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, visible, selectedDate]);

  const showPainCharacter = (values.pain_mechanical ?? 0) > 0 || (values.pain_widespread ?? 0) > 0;
  const showBreathlessnessCharacter = (values.breathlessness ?? 0) > 0;
  const painCharacterAnchor = activeDomains.includes('pain_widespread')
    ? 'pain_widespread'
    : activeDomains.includes('pain_mechanical')
      ? 'pain_mechanical'
      : null;
  const isEarlyLog = selectedDate === today && new Date().getHours() < BODY_EARLY_LOG_HOUR;
  const untouchedRequiredDomains = activeDomains.filter(d => BODY_DOMAINS[d].required && values[d] === undefined);

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
      pain_diffuse: false,
      pain_character: painCharacter.filter(t => PAIN_CHARACTER_TAGS.includes(t)),
      breathlessness_character: breathlessnessCharacter.filter(t => BREATHLESSNESS_CHARACTER_TAGS.includes(t)),
      note: note || null,
      entered_retroactively: retro,
    };
    for (const d of CHECKIN_BODY_DOMAIN_ORDER) {
      payload[d] = values[d] ?? null;
    }

    let id = checkinId;
    if (id) {
      const { error: updErr } = await supabase.from('body_checkins').update({ ...payload, edited_at: new Date().toISOString() }).eq('id', id);
      if (updErr) { setSaving(false); setError('Could not save. Try again.'); return; }
    } else {
      const { data: inserted, error: insErr } = await supabase.from('body_checkins').insert(payload).select('id').single();
      if (insErr || !inserted) { setSaving(false); setError('Could not save. Try again.'); return; }
      id = inserted.id;
    }

    for (const type of BODY_EVENT_ORDER) {
      const wasTicked = type in existingEventIds;
      const isTicked = tickedEvents.has(type);
      const sites = eventSites[type];
      const character = eventCharacter[type];

      if (isTicked && !wasTicked) {
        const { data: ev } = await supabase
          .from('body_events')
          .insert({ user_id: user.id, event_date: selectedDate, event_type: type, body_checkin_id: id, entered_retroactively: retro, character: character?.length ? character : null })
          .select('id').single();
        if (ev && sites?.length) {
          await supabase.from('body_event_sites').insert(sites.map(s => ({ body_event_id: ev.id, user_id: user.id, region: s.region, side: s.side })));
        }
        trackBodyEventLogged(type);
      } else if (isTicked && wasTicked) {
        const evId = existingEventIds[type]!;
        await supabase.from('body_events').update({ character: character?.length ? character : null }).eq('id', evId);
        await supabase.from('body_event_sites').delete().eq('body_event_id', evId);
        if (sites?.length) {
          await supabase.from('body_event_sites').insert(sites.map(s => ({ body_event_id: evId, user_id: user.id, region: s.region, side: s.side })));
        }
      } else if (!isTicked && wasTicked) {
        await supabase.from('body_events').delete().eq('id', existingEventIds[type]!);
      }
    }

    const domainCount = CHECKIN_BODY_DOMAIN_ORDER.filter(d => values[d] !== undefined).length;
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                          domain={d}
                          label={config.label}
                          hint={config.hint}
                          lowLabel={config.lowAnchor}
                          highLabel={config.highAnchor}
                          value={values[d] ?? 5}
                          onChange={v => setValues(prev => ({ ...prev, [d]: v }))}
                          color={BODY_COLOR}
                          note={note2}
                          touched={config.required ? values[d] !== undefined : undefined}
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

              <Pressable onPress={handleSave} disabled={saving || untouchedRequiredDomains.length > 0} style={[styles.saveButton, (saving || untouchedRequiredDomains.length > 0) && styles.saveButtonDisabled]}>
                {saving ? <ActivityIndicator color="#4a5568" /> : <Text style={[styles.saveButtonText, untouchedRequiredDomains.length > 0 && styles.saveButtonTextDisabled]}>{saved ? 'Saved' : checkinId ? 'Save changes' : 'Save'}</Text>}
              </Pressable>

              {untouchedRequiredDomains.length > 0 && (
                <Text style={styles.requiredHint}>Rate {untouchedRequiredDomains.map(d => `"${BODY_DOMAINS[d].label}"`).join(', ')} before saving.</Text>
              )}
              {error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  eventsCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  eventsHint: { fontSize: 13, color: '#718096', marginBottom: 14 },
  eventsList: { gap: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, minHeight: 44 },
  eventCheckbox: { width: 18, height: 18, borderRadius: 5, marginTop: 1, borderWidth: 1.5, borderColor: '#4a5568' },
  eventCheckboxChecked: { borderWidth: 0, backgroundColor: '#a5b4fc' },
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
});
