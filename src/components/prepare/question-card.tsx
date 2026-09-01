import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { deleteQuestion, markQuestionAddressed, updateQuestion } from '@/lib/api/questions';
import type { PrepareQuestion } from '@/lib/supabase';

interface Props {
  question: PrepareQuestion;
  onChange: (updated: PrepareQuestion) => void;
  onDelete: (id: string) => void;
  onTogglePriority: (question: PrepareQuestion) => Promise<void>;
  /** Long-press-to-drag handle, passed down by DraggableFlatList's renderItem
   *  (the web version's dnd-kit dragHandleProps equivalent). */
  drag?: () => void;
  isActive?: boolean;
}

function StarIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

// Ported from the web app's QuestionCard.tsx. Mechanic swap: the drag
// handle uses DraggableFlatList's `drag`/`isActive` render-item callbacks
// (onLongPress={drag}) instead of dnd-kit's pointer-sensor listeners — no
// separate SortableQuestionCard wrapper needed, DraggableFlatList handles
// that role itself.
export default function QuestionCard({ question, onChange, onDelete, onTogglePriority, drag, isActive }: Props) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(question.question_text);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleSaveEdit() {
    if (!editText.trim() || editText.trim() === question.question_text) {
      setEditing(false);
      setEditText(question.question_text);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateQuestion(question.id, { question_text: editText.trim() });
      onChange(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteQuestion(question.id);
      onDelete(question.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleAddressed() {
    const updated = await markQuestionAddressed(question.id, !question.is_addressed);
    onChange(updated);
  }

  async function handleTogglePriority() {
    setToggling(true);
    try {
      await onTogglePriority(question);
    } finally {
      setToggling(false);
    }
  }

  return (
    <View style={[styles.card, question.is_addressed && styles.cardAddressed, isActive && styles.cardActive]}>
      <View style={styles.row}>
        {drag && (
          <Pressable onLongPress={drag} disabled={isActive} hitSlop={8} style={styles.dragHandle}>
            <Text style={styles.dragHandleText}>⠿</Text>
          </Pressable>
        )}

        <Pressable onPress={handleToggleAddressed} hitSlop={4} style={[styles.checkbox, question.is_addressed ? styles.checkboxChecked : styles.checkboxEmpty]}>
          {question.is_addressed && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>

        <View style={styles.textWrap}>
          {editing ? (
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              numberOfLines={2}
              autoFocus
              style={styles.editInput}
            />
          ) : (
            <Text style={styles.questionText}>{question.question_text}</Text>
          )}
          {question.is_auto_generated && !editing && <Text style={styles.autoGenText}>Auto-generated</Text>}
        </View>

        {!editing && (
          <View style={styles.actions}>
            <Pressable onPress={() => setEditing(true)} hitSlop={6} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>✎</Text>
            </Pressable>
            <Pressable onPress={() => setShowDelete(v => !v)} hitSlop={6} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>🗑</Text>
            </Pressable>
          </View>
        )}
      </View>

      {editing && (
        <View style={styles.editActions}>
          <Pressable onPress={handleSaveEdit} disabled={saving} style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
            <Text style={[styles.saveButtonText, saving && styles.saveButtonTextDisabled]}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
          <Pressable onPress={() => { setEditing(false); setEditText(question.question_text); }} hitSlop={4}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {!editing && (
        <View style={styles.bottomRow}>
          <Pressable onPress={handleTogglePriority} disabled={toggling} style={styles.priorityButton}>
            <StarIcon filled={question.is_priority} color={question.is_priority ? '#818cf8' : '#4a5568'} />
            <Text style={[styles.priorityText, question.is_priority && styles.priorityTextActive]}>
              {question.is_priority ? 'Priority' : 'Make priority'}
            </Text>
          </Pressable>

          {showDelete && (
            <>
              <Pressable onPress={handleDelete} disabled={deleting} hitSlop={4}>
                <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
              <Pressable onPress={() => setShowDelete(false)} hitSlop={4}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  cardAddressed: { opacity: 0.4 },
  cardActive: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dragHandle: { paddingTop: 2, paddingBottom: 2 },
  dragHandleText: { color: '#2d3748', fontSize: 16 },
  checkbox: { width: 18, height: 18, borderRadius: 4, marginTop: 3, alignItems: 'center', justifyContent: 'center' },
  checkboxEmpty: { borderWidth: 1.5, borderColor: '#2d3748' },
  checkboxChecked: { backgroundColor: '#4a5568' },
  checkmark: { color: '#9ca3af', fontSize: 10, fontWeight: '700' },
  textWrap: { flex: 1, minWidth: 0 },
  questionText: { fontSize: 14, color: '#c8d0e0', lineHeight: 20 },
  editInput: { backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#3730a3', borderRadius: 8, padding: 8, paddingHorizontal: 10, color: '#e2e8f0', fontSize: 14, minHeight: 44, textAlignVertical: 'top' },
  autoGenText: { fontSize: 11, color: '#4a5568', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6 },
  iconButton: { padding: 2 },
  iconButtonText: { fontSize: 13, color: '#4a5568' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 28 },
  saveButton: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#4f46e5', borderRadius: 7 },
  saveButtonDisabled: { backgroundColor: '#2d3748' },
  saveButtonText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  saveButtonTextDisabled: { color: '#6b7a99' },
  cancelText: { fontSize: 13, color: '#6b7a99' },
  bottomRow: { paddingLeft: 28, marginTop: 6, flexDirection: 'row', gap: 12, alignItems: 'center' },
  priorityButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priorityText: { fontSize: 12, color: '#4a5568' },
  priorityTextActive: { color: '#818cf8' },
  deleteText: { fontSize: 12, color: '#f87171', fontWeight: '600' },
});
