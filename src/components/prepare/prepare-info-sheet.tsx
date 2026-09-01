import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ITEMS = [
  {
    emoji: '📅',
    title: 'Set an appointment date',
    body: 'Add your next clinical appointment and optional focus areas. Prepare builds around that date.',
  },
  {
    emoji: '✨',
    title: 'Review detected patterns',
    body: 'Symetric shows you patterns from the past 90 days. Check off which ones you want to discuss. Add a note to give your clinician more context.',
  },
  {
    emoji: '❓',
    title: 'Build your question list',
    body: 'Review the patterns Symetric found, then write your own questions from what stands out. Mark the most important ones as priority.',
  },
  {
    emoji: '📝',
    title: 'Record notable changes',
    body: 'Log medication changes, therapy sessions, and life events so your clinician knows what’s happened since your last visit.',
  },
  {
    emoji: '⬇️',
    title: 'Generate a PDF report',
    body: 'Export a structured summary of your data to share with your clinician before or during your appointment.',
  },
];

// Ported from the web app's PrepareInfoSheet.tsx. The web version's SVG
// stroke icons are swapped for emoji (same treatment as other RN info
// sheets in this app) and the drag-to-dismiss gesture is dropped in favor
// of tap-outside-to-close, matching MarkerModal's overlay pattern.
export default function PrepareInfoSheet({ isOpen, onClose }: Props) {
  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>How Prepare works</Text>

            <View style={styles.list}>
              {ITEMS.map((item, i) => (
                <View key={i} style={styles.item}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                  <View style={styles.itemText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.footer}>Your data stays on Symetric. The PDF report is generated and downloaded locally.</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,12,18,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141820', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#1e2533', borderBottomWidth: 0, padding: 24, paddingBottom: 48, maxHeight: '80%' },
  handle: { width: 32, height: 3, backgroundColor: '#2d3748', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '600', color: '#e2e8f0', marginBottom: 20 },
  list: { gap: 20 },
  item: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  emoji: { fontSize: 18, lineHeight: 20 },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#c8d0e0', marginBottom: 4 },
  itemBody: { fontSize: 13, color: '#6b7a99', lineHeight: 20 },
  footer: { fontSize: 12, color: '#4a5568', marginTop: 24, lineHeight: 18 },
});
