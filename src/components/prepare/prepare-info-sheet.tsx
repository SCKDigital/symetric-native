import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// The five item glyphs, traced from the web app's PrepareInfoSheet.tsx — same
// path data, same 16-unit viewBox, same 1.6 stroke.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="#7b83f0"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Frame>
      <Rect x={2} y={3} width={12} height={11} rx={1.5} />
      <Line x1={2} y1={7} x2={14} y2={7} />
      <Line x1={5} y1={1} x2={5} y2={4} />
      <Line x1={11} y1={1} x2={11} y2={4} />
      <Line x1={6} y1={10.5} x2={10} y2={10.5} />
    </Frame>
  );
}

function SparkleIcon() {
  return (
    <Frame>
      <Path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2" />
    </Frame>
  );
}

function QuestionIcon() {
  return (
    <Frame>
      <Circle cx={8} cy={8} r={6.5} />
      <Path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3" />
      <Line x1={8} y1={11} x2={8} y2={11} strokeWidth={2.2} />
    </Frame>
  );
}

function ChangesIcon() {
  return (
    <Frame>
      <Circle cx={8} cy={8} r={6.5} />
      <Circle cx={8} cy={8} r={2.25} />
    </Frame>
  );
}

function DownloadIcon() {
  return (
    <Frame>
      <Path d="M8 2v8" />
      <Path d="M4.5 6.5 8 10l3.5-3.5" />
      <Path d="M2.5 12.5h11" />
    </Frame>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ITEMS = [
  {
    icon: <CalendarIcon />,
    title: 'Set an appointment date',
    body: 'Add your next clinical appointment and optional focus areas. Prepare builds around that date.',
  },
  {
    icon: <SparkleIcon />,
    title: 'Review detected patterns',
    body: 'Symetric shows you patterns from the past 90 days. Check off which ones you want to discuss. Add a note to give your clinician more context.',
  },
  {
    icon: <QuestionIcon />,
    title: 'Build your question list',
    body: 'Review the patterns Symetric found, then write your own questions from what stands out. Mark the most important ones as priority.',
  },
  {
    icon: <ChangesIcon />,
    title: 'Record notable changes',
    body: 'Log medication changes, therapy sessions, and life events so your clinician knows what’s happened since your last visit.',
  },
  {
    icon: <DownloadIcon />,
    title: 'Generate a PDF report',
    body: 'Export a structured summary of your data to share with your clinician before or during your appointment.',
  },
];

// Ported from the web app's PrepareInfoSheet.tsx, SVG stroke icons included.
// The drag-to-dismiss gesture is dropped in favor of tap-outside-to-close,
// matching MarkerModal's overlay pattern.
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
                  <View style={styles.icon}>{item.icon}</View>
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
  icon: { flexShrink: 0, paddingTop: 1 },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#c8d0e0', marginBottom: 4 },
  itemBody: { fontSize: 13, color: '#6b7a99', lineHeight: 20 },
  footer: { fontSize: 12, color: '#4a5568', marginTop: 24, lineHeight: 18 },
});
