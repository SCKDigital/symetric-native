import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Ported from the web app's MarkerFirstTimeSheet.tsx — shown once, the
// first time a user ever creates a marker. Same tap-outside-to-close
// treatment as prepare-info-sheet.tsx instead of the web's drag-to-dismiss.
export default function MarkerFirstTimeSheet({ isOpen, onClose }: Props) {
  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Marking changes</Text>
          <Text style={styles.body}>
            Markers show as vertical lines on your charts. They won&rsquo;t affect your check-ins - they just help you see patterns before and after something changed.
          </Text>
          <Pressable onPress={onClose} style={styles.button}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,12,18,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141820', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#1e2533', borderBottomWidth: 0, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, backgroundColor: '#2d3748', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '600', color: '#e2e8f0', marginBottom: 10, letterSpacing: -0.3 },
  body: { fontSize: 15, color: '#8892a4', lineHeight: 24, marginBottom: 24 },
  button: { width: '100%', padding: 14, backgroundColor: '#6366f1', borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
