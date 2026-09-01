import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

// Ported from the web app's components/insights/BackRow.tsx — a chevron
// button + title row, shared by every area-detail screen (BodyAreaDetail
// first; MindAreaDetail etc. aren't ported yet). Mechanic swap only:
// button/svg/h2 → Pressable/react-native-svg's Svg+Polyline/Text, same
// chevron geometry.

interface Props {
  label: string;
  onBack: () => void;
}

export default function BackRow({ label, onBack }: Props) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} accessibilityLabel="Back to the evidence" hitSlop={8} style={styles.button}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8892a4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="15 18 9 12 15 6" />
        </Svg>
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { padding: 4 },
  label: { fontSize: 20, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.4 },
});
