import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import HighlightedSentence from '@/components/shared/highlighted-sentence';
import { useAuth } from '@/contexts/auth-context';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchPatternReviewsForAppointment, upsertPatternReview } from '@/lib/api/pattern-reviews';
import { trackPatternMarkedForDiscussion, trackPatternNoteAdded } from '@/lib/analytics';
import { BODY_COLOR, DOMAIN_COLORS, MIND_AREA_COLOR } from '@/lib/domains';
import { CONFIDENCE_COPY, GRADE_ORDER, type Area, type Grade, type PatternFinding } from '@/lib/pattern-findings';
import type { PatternSource, PreparePatternReview } from '@/lib/supabase';

const AREA_LABEL: Record<Area, string> = { mind: 'Mind', body: 'Body', sleep: 'Sleep', medication: 'Medication' };
const AREA_COLOR: Record<Area, string> = { mind: MIND_AREA_COLOR, body: BODY_COLOR, sleep: DOMAIN_COLORS.sleep, medication: '#a5b4fc' };

function reviewKey(patternId: string, patternSource: PatternSource) {
  return `${patternSource}:${patternId}`;
}

function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function ConfidenceBadge({ grade }: { grade: Grade }) {
  const conf = CONFIDENCE_COPY[grade];
  return (
    <View style={styles.badgeRow}>
      <Text style={styles.badgeText}>{conf.short}</Text>
      <View style={styles.badgeTrack}>
        <View style={[styles.badgeFill, { width: `${conf.barFraction * 100}%` }]} />
      </View>
    </View>
  );
}

interface PatternRowProps {
  finding: PatternFinding;
  review: PreparePatternReview | undefined;
  onToggle: (patternId: string, patternSource: PatternSource, shouldDiscuss: boolean) => void;
  onNoteChange: (patternId: string, patternSource: PatternSource, note: string) => Promise<void>;
}

function PatternRow({ finding, review, onToggle, onNoteChange }: PatternRowProps) {
  const shouldDiscuss = review?.should_discuss ?? true;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(review?.user_note ?? '');
  const debouncedNote = useDebounce(note, 500);
  const [noteSaving, setNoteSaving] = useState(false);
  const source = finding.patternSource ?? 'cluster';
  const canPersist = finding.patternId != null;

  // `review` arrives asynchronously (fetched after this row already
  // mounted with review undefined), so the local editable `note` draft has
  // to be synced to it once it lands — one of React's own documented
  // legitimate uses of an effect ("adjusting state when a prop changes"),
  // not the redundant-derived-state case the rule is normally catching.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNote(review?.user_note ?? ''); }, [review?.user_note]);

  useEffect(() => {
    if (!canPersist) return;
    if (debouncedNote === (review?.user_note ?? '')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteSaving(true);
    onNoteChange(finding.patternId!, source, debouncedNote).finally(() => setNoteSaving(false));
    // Only re-run when the debounced value actually changes — canPersist/source/review are stable per finding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNote]);

  return (
    <View style={[styles.row, !shouldDiscuss && styles.rowDimmed]}>
      <View style={styles.rowInner}>
        {canPersist ? (
          <Pressable
            onPress={() => onToggle(finding.patternId!, source, !shouldDiscuss)}
            hitSlop={4}
            style={[styles.checkbox, shouldDiscuss ? { backgroundColor: AREA_COLOR[finding.areas[0]] } : styles.checkboxEmpty]}>
            {shouldDiscuss && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ) : (
          <View style={styles.checkboxSpacer} />
        )}

        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={styles.sentence}>
              <HighlightedSentence sentence={finding.sentence} highlights={finding.sentenceHighlights} />
            </Text>
            <View style={styles.badgeWrap}>
              <ConfidenceBadge grade={finding.grade} />
            </View>
          </View>
          <Text style={styles.evidence}>{finding.evidenceLine}</Text>
          <View style={styles.areaRow}>
            {finding.areas.map(a => (
              <View key={a} style={[styles.areaPill, { backgroundColor: `${AREA_COLOR[a]}20` }]}>
                <Text style={[styles.areaPillText, { color: AREA_COLOR[a] }]}>{AREA_LABEL[a]}</Text>
              </View>
            ))}
          </View>

          {canPersist && (
            <>
              <Pressable onPress={() => setNoteOpen(o => !o)} hitSlop={4}>
                <Text style={[styles.noteToggle, review?.user_note && styles.noteToggleActive]}>
                  {noteOpen ? 'Hide note' : review?.user_note ? 'Edit note' : '+ Add note'}
                </Text>
              </Pressable>
              {noteOpen && (
                <View style={styles.noteBlock}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add context for your clinician…"
                    placeholderTextColor="#4a5568"
                    multiline
                    numberOfLines={2}
                    style={styles.noteInput}
                  />
                  <Text style={[styles.noteStatus, noteSaving && styles.noteStatusSaving]}>
                    {noteSaving ? 'Saving…' : note !== (review?.user_note ?? '') ? 'Unsaved' : ''}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

type FilterMode = 'all' | 'marked' | 'unmarked';

interface Props {
  appointmentId: string;
  findings: PatternFinding[];
}

// Ported from the web app's PatternReviewSection.tsx. Mechanic swap:
// window.confirm() before an "unmark all" that would strand notes -> an
// Alert.alert wrapped in a small confirmAsync() promise helper. markPatternDiscussed
// (used only by PostAppointmentSection, not ported yet) is intentionally not
// in lib/api/pattern-reviews.ts — add it when that section is ported.
export default function PatternReviewSection({ appointmentId, findings }: Props) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PreparePatternReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [showEarlySignals, setShowEarlySignals] = useState(false);

  useEffect(() => {
    // Re-synced to true/null on every appointmentId change, not just once
    // — see use-history.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchPatternReviewsForAppointment(appointmentId)
      .then(setReviews)
      .catch(() => setError('Unable to load patterns. Try again.'))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  const reviewMap = useMemo(
    () => Object.fromEntries(reviews.map(r => [reviewKey(r.pattern_id, r.pattern_source), r])),
    [reviews]
  );

  function handleToggle(patternId: string, patternSource: PatternSource, shouldDiscuss: boolean) {
    if (!user) return;
    const key = reviewKey(patternId, patternSource);
    setReviews(prev => {
      const existing = prev.find(r => reviewKey(r.pattern_id, r.pattern_source) === key);
      if (existing) return prev.map(r => (reviewKey(r.pattern_id, r.pattern_source) === key ? { ...r, should_discuss: shouldDiscuss } : r));
      return [...prev, {
        id: `optimistic-${key}`, user_id: user.id, appointment_id: appointmentId,
        pattern_id: patternId, pattern_source: patternSource, should_discuss: shouldDiscuss,
        user_note: null, was_discussed: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } as PreparePatternReview];
    });
    if (shouldDiscuss) trackPatternMarkedForDiscussion();
    upsertPatternReview(user.id, appointmentId, patternId, shouldDiscuss, undefined, patternSource)
      .then(updated => setReviews(prev => prev.map(r => (reviewKey(r.pattern_id, r.pattern_source) === key ? updated : r))))
      .catch(() => setReviews(prev => prev.map(r => (reviewKey(r.pattern_id, r.pattern_source) === key ? { ...r, should_discuss: !shouldDiscuss } : r))));
  }

  async function handleNoteChange(patternId: string, patternSource: PatternSource, note: string) {
    if (!user) return;
    const key = reviewKey(patternId, patternSource);
    const review = reviews.find(r => reviewKey(r.pattern_id, r.pattern_source) === key);
    const shouldDiscuss = review?.should_discuss ?? true;
    const updated = await upsertPatternReview(user.id, appointmentId, patternId, shouldDiscuss, note, patternSource);
    setReviews(prev => prev.map(r => (reviewKey(r.pattern_id, r.pattern_source) === key ? updated : r)));
    if (note.trim().length > 0) trackPatternNoteAdded();
  }

  async function markAll(shouldDiscuss: boolean) {
    if (!user) return;
    const persistable = findings.filter(f => f.patternId != null);
    if (!shouldDiscuss) {
      const markedWithNotes = persistable.filter(f => {
        const review = reviewMap[reviewKey(f.patternId!, f.patternSource!)];
        return review?.should_discuss !== false && review?.user_note;
      });
      if (markedWithNotes.length > 0) {
        const count = markedWithNotes.length;
        const ok = await confirmAsync('Unmark all patterns?', `${count} pattern${count === 1 ? '' : 's'} with notes will be unmarked. Notes will be kept.`, 'Unmark all');
        if (!ok) return;
      }
    }
    setReviews(prev => {
      const existingKeys = new Set(prev.map(r => reviewKey(r.pattern_id, r.pattern_source)));
      const newReviews: PreparePatternReview[] = persistable
        .filter(f => !existingKeys.has(reviewKey(f.patternId!, f.patternSource!)))
        .map(f => ({
          id: `optimistic-${reviewKey(f.patternId!, f.patternSource!)}`, user_id: user.id, appointment_id: appointmentId,
          pattern_id: f.patternId!, pattern_source: f.patternSource!, should_discuss: shouldDiscuss,
          user_note: null, was_discussed: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as PreparePatternReview));
      return [...prev.map(r => ({ ...r, should_discuss: shouldDiscuss })), ...newReviews];
    });
    await Promise.all(persistable.map(f => upsertPatternReview(user.id, appointmentId, f.patternId!, shouldDiscuss, undefined, f.patternSource!)));
    setReviews(await fetchPatternReviewsForAppointment(appointmentId));
  }

  const discussCount = useMemo(
    () => findings.filter(f => f.patternId == null || reviewMap[reviewKey(f.patternId, f.patternSource!)]?.should_discuss !== false).length,
    [findings, reviewMap]
  );

  const { firm, earlySignals } = useMemo(() => {
    const sorted = [...findings].sort((a, b) => {
      if (GRADE_ORDER[a.grade] !== GRADE_ORDER[b.grade]) return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
      return b.onsetDate.localeCompare(a.onsetDate);
    });
    return { firm: sorted.filter(f => f.grade !== 'limited'), earlySignals: sorted.filter(f => f.grade === 'limited') };
  }, [findings]);

  function applyFilter(list: PatternFinding[]): PatternFinding[] {
    return list.filter(f => {
      if (f.patternId == null) return filter !== 'unmarked';
      const shouldDiscuss = reviewMap[reviewKey(f.patternId, f.patternSource!)]?.should_discuss ?? true;
      if (filter === 'marked') return shouldDiscuss;
      if (filter === 'unmarked') return !shouldDiscuss;
      return true;
    });
  }

  if (findings.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Patterns</Text>
        <Text style={styles.emptyTitle}>No patterns detected yet</Text>
        <Text style={styles.emptyBody}>Keep logging check-ins. Symetric will detect patterns as more data becomes available. In the meantime, you can add custom questions.</Text>
      </View>
    );
  }

  const visibleFirm = applyFilter(firm);
  const visibleEarly = applyFilter(earlySignals);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.sectionLabel}>Patterns</Text>
          {discussCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{discussCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.countSummary}>{loading ? '…' : `${discussCount} of ${findings.length} to discuss`}</Text>
      </View>
      <Text style={styles.hint}>Uncheck patterns you don&rsquo;t need to discuss.</Text>

      <View style={styles.toolbar}>
        <View style={styles.filterRow}>
          {(['all', 'marked', 'unmarked'] as FilterMode[]).map(f => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterPill, filter === f && styles.filterPillActive]}>
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f === 'all' ? 'All' : f === 'marked' ? 'To discuss' : 'Skipping'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => markAll(discussCount < findings.length)} hitSlop={4}>
          <Text style={styles.markAllText}>{discussCount < findings.length ? 'Mark all' : 'Unmark all'}</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View>
          {[1, 2, 3].map(i => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonLineWide} />
              <View style={styles.skeletonLineNarrow} />
            </View>
          ))}
        </View>
      ) : (
        <View>
          {visibleFirm.length === 0 && visibleEarly.length === 0 ? (
            <Text style={styles.emptyFilterText}>{filter === 'marked' ? 'No patterns marked to discuss.' : 'All patterns are marked to discuss.'}</Text>
          ) : (
            visibleFirm.map(f => (
              <PatternRow key={`${f.patternSource ?? 'x'}-${f.id}`} finding={f}
                review={f.patternId != null ? reviewMap[reviewKey(f.patternId, f.patternSource!)] : undefined}
                onToggle={handleToggle} onNoteChange={handleNoteChange} />
            ))
          )}
          {visibleEarly.length > 0 && (
            !showEarlySignals ? (
              <Pressable onPress={() => setShowEarlySignals(true)} style={styles.showEarlyButton}>
                <Text style={styles.showEarlyText}>Show {visibleEarly.length} early signal{visibleEarly.length !== 1 ? 's' : ''}</Text>
              </Pressable>
            ) : (
              visibleEarly.map(f => (
                <PatternRow key={`${f.patternSource ?? 'x'}-${f.id}`} finding={f}
                  review={f.patternId != null ? reviewMap[reviewKey(f.patternId, f.patternSource!)] : undefined}
                  onToggle={handleToggle} onNoteChange={handleNoteChange} />
              ))
            )
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { paddingVertical: 1, paddingHorizontal: 6, backgroundColor: 'rgba(129,140,248,0.15)', borderRadius: 20 },
  countText: { fontSize: 11, fontWeight: '600', color: '#818cf8' },
  countSummary: { fontSize: 12, color: '#6b7a99' },
  hint: { fontSize: 12, color: '#4a5568', marginBottom: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', gap: 4 },
  filterPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: '#1e2533' },
  filterPillActive: { borderWidth: 0, backgroundColor: 'rgba(79,70,229,0.15)' },
  filterPillText: { fontSize: 12, color: '#4a5568' },
  filterPillTextActive: { color: '#818cf8', fontWeight: '600' },
  markAllText: { fontSize: 12, color: '#4a5568' },
  errorBanner: { marginBottom: 12, padding: 10, paddingHorizontal: 12, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', borderRadius: 8 },
  errorText: { fontSize: 13, color: '#f87171' },
  skeletonRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  skeletonLineWide: { height: 14, backgroundColor: '#1e2533', borderRadius: 4, width: '65%', marginBottom: 8, opacity: 0.6 },
  skeletonLineNarrow: { height: 11, backgroundColor: '#1e2533', borderRadius: 4, width: '40%', opacity: 0.4 },
  emptyTitle: { fontSize: 14, fontWeight: '500', color: '#8892a4', marginTop: 12, marginBottom: 6 },
  emptyBody: { fontSize: 13, color: '#4a5568', lineHeight: 19 },
  emptyFilterText: { fontSize: 13, color: '#4a5568', paddingVertical: 12 },
  row: { borderBottomWidth: 1, borderBottomColor: '#1e2533', paddingVertical: 14 },
  rowDimmed: { opacity: 0.45 },
  rowInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 5, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxEmpty: { borderWidth: 1.5, borderColor: '#2d3748' },
  checkboxSpacer: { width: 20, height: 20 },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rowContent: { flex: 1 },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  sentence: { flex: 1, fontSize: 14, fontWeight: '500', color: '#c8d0e0', lineHeight: 19 },
  badgeWrap: { paddingTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { fontSize: 11, color: '#8892a4' },
  badgeTrack: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  badgeFill: { height: '100%', backgroundColor: '#6b7a99', borderRadius: 2 },
  evidence: { fontSize: 12, color: '#6b7a99', marginBottom: 6 },
  areaRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 8 },
  areaPill: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 20 },
  areaPillText: { fontSize: 11, fontWeight: '500' },
  noteToggle: { fontSize: 12, color: '#4a5568' },
  noteToggleActive: { color: '#818cf8' },
  noteBlock: { marginTop: 8 },
  noteInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, padding: 10, paddingHorizontal: 12, color: '#c8d0e0', fontSize: 13, minHeight: 44, textAlignVertical: 'top' },
  noteStatus: { fontSize: 11, color: '#4a5568', marginTop: 4, height: 14 },
  noteStatusSaving: { color: '#818cf8' },
  showEarlyButton: { paddingTop: 12 },
  showEarlyText: { fontSize: 13, color: '#6366f1' },
});
