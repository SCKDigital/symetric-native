import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import QuestionCard from '@/components/prepare/question-card';
import { useAuth } from '@/contexts/auth-context';
import { createQuestion, fetchQuestionsForAppointment, reorderQuestions, updateQuestion } from '@/lib/api/questions';
import { trackQuestionAdded, trackQuestionReordered } from '@/lib/analytics';
import type { PrepareQuestion } from '@/lib/supabase';

interface Props {
  appointmentId: string;
}

// Ported from the web app's QuestionsSection.tsx (+ SortableQuestionCard.tsx,
// folded into this file's renderItem since DraggableFlatList already plays
// SortableQuestionCard's wrapper role — no separate component needed).
// Mechanic swap: @dnd-kit's DndContext/SortableContext -> two
// react-native-draggable-flatlist lists (priority/other, matching the web
// app's own two-group split), each scrollEnabled=false since they're
// nested inside prepare.tsx's outer ScrollView. Requires
// GestureHandlerRootView at the app root (added to _layout.tsx).
export default function QuestionsSection({ appointmentId }: Props) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<PrepareQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = await fetchQuestionsForAppointment(appointmentId);
      setQuestions(qs);
    } catch {
      setError('Unable to load questions. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    // See use-history.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuestions();
  }, [loadQuestions]);

  async function handleAdd() {
    if (!user || !addText.trim()) return;
    setAdding(true);
    try {
      const q = await createQuestion(user.id, appointmentId, addText.trim(), false, false);
      setQuestions(prev => [...prev, q]);
      setAddText('');
      setShowAdd(false);
      trackQuestionAdded('manual');
    } finally {
      setAdding(false);
    }
  }

  async function handleTogglePriority(question: PrepareQuestion) {
    const updated = await updateQuestion(question.id, { is_priority: !question.is_priority });
    setQuestions(prev => prev.map(q => (q.id === updated.id ? updated : q)));
  }

  function handleChange(updated: PrepareQuestion) {
    setQuestions(prev => prev.map(q => (q.id === updated.id ? updated : q)));
  }

  function handleDelete(id: string) {
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function handleDragEnd(reordered: PrepareQuestion[], isPriority: boolean) {
    setQuestions(prev => {
      const otherGroup = isPriority ? prev.filter(q => !q.is_priority) : prev.filter(q => q.is_priority);
      return isPriority ? [...reordered, ...otherGroup] : [...otherGroup, ...reordered];
    });
    await reorderQuestions(reordered.map(q => q.id), isPriority);
    trackQuestionReordered();
  }

  const priority = useMemo(() => questions.filter(q => q.is_priority), [questions]);
  const other = useMemo(() => questions.filter(q => !q.is_priority), [questions]);

  const renderQuestion = ({ item, drag, isActive }: RenderItemParams<PrepareQuestion>) => (
    <QuestionCard question={item} onChange={handleChange} onDelete={handleDelete} onTogglePriority={handleTogglePriority} drag={drag} isActive={isActive} />
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Questions</Text>
        <Text style={styles.countText}>{loading ? '…' : `${questions.length} question${questions.length === 1 ? '' : 's'}`}</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadQuestions} hitSlop={4}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.skeleton}>
          {[80, 60, 70].map((w, i) => (
            <View key={i} style={[styles.skeletonLine, { width: `${w}%` }]} />
          ))}
        </View>
      ) : (
        <>
          {questions.length === 0 && <Text style={styles.emptyText}>No questions yet - add your own below</Text>}

          {priority.length > 0 && (
            <View>
              <Text style={styles.groupLabelPriority}>Priority</Text>
              <DraggableFlatList
                data={priority}
                keyExtractor={q => q.id}
                renderItem={renderQuestion}
                onDragEnd={({ data }) => handleDragEnd(data, true)}
                scrollEnabled={false}
                activationDistance={10}
              />
            </View>
          )}

          {other.length > 0 && (
            <View>
              {priority.length > 0 && <Text style={styles.groupLabel}>Other</Text>}
              <DraggableFlatList
                data={other}
                keyExtractor={q => q.id}
                renderItem={renderQuestion}
                onDragEnd={({ data }) => handleDragEnd(data, false)}
                scrollEnabled={false}
                activationDistance={10}
              />
            </View>
          )}
        </>
      )}

      <View style={styles.addBlock}>
        {!showAdd ? (
          <Pressable onPress={() => setShowAdd(true)} hitSlop={4}>
            <Text style={styles.addText}>+ Add question</Text>
          </Pressable>
        ) : (
          <View>
            <TextInput
              value={addText}
              onChangeText={setAddText}
              placeholder="Type a question…"
              placeholderTextColor="#4a5568"
              multiline
              numberOfLines={2}
              autoFocus
              style={styles.addInput}
            />
            <View style={styles.addActions}>
              <Pressable onPress={handleAdd} disabled={adding || !addText.trim()} style={[styles.addButton, (adding || !addText.trim()) && styles.addButtonDisabled]}>
                <Text style={[styles.addButtonText, (adding || !addText.trim()) && styles.addButtonTextDisabled]}>{adding ? 'Adding…' : 'Add'}</Text>
              </Pressable>
              <Pressable onPress={() => { setShowAdd(false); setAddText(''); }} hitSlop={4}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9 },
  countText: { fontSize: 12, color: '#6b7a99' },
  errorBanner: { marginBottom: 12, padding: 10, paddingHorizontal: 12, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  errorText: { fontSize: 13, color: '#f87171', flex: 1 },
  retryText: { fontSize: 13, fontWeight: '600', color: '#f87171' },
  skeleton: { paddingVertical: 8 },
  skeletonLine: { height: 14, backgroundColor: '#1e2533', borderRadius: 4, marginBottom: 10, opacity: 0.6 },
  emptyText: { fontSize: 14, fontWeight: '500', color: '#8892a4', paddingVertical: 12 },
  groupLabelPriority: { fontSize: 11, fontWeight: '600', color: '#818cf8', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  groupLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12 },
  addBlock: { marginTop: 12 },
  addText: { fontSize: 13, fontWeight: '500', color: '#818cf8' },
  addInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, padding: 10, paddingHorizontal: 12, color: '#e2e8f0', fontSize: 14, minHeight: 52, textAlignVertical: 'top' },
  addActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addButton: { paddingVertical: 7, paddingHorizontal: 16, backgroundColor: '#4f46e5', borderRadius: 7 },
  addButtonDisabled: { backgroundColor: '#2d3748' },
  addButtonText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  addButtonTextDisabled: { color: '#6b7a99' },
  cancelText: { fontSize: 13, color: '#6b7a99', paddingVertical: 7, paddingHorizontal: 14 },
});
