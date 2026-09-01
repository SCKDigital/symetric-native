import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Descriptive, non-scored multi-select chips — same tap-to-toggle pill
 * treatment as EventSitePicker's site chips. No limit on selections, nothing
 * required. Never render an interpretation of the selection here — this is
 * plain descriptive context, not a screening tool. Ported from the web
 * app's CharacterTags.tsx.
 */
export default function CharacterTags({ options, selected, onChange }: Props) {
  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>What did it feel like? (optional)</Text>
      <View style={styles.row}>
        {options.map(tag => {
          const active = selected.includes(tag);
          return (
            <Pressable key={tag} onPress={() => toggle(tag)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#2d3748' },
  label: { fontSize: 12, color: '#8892a4', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 11, minHeight: 32, borderRadius: 999, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12', justifyContent: 'center' },
  chipActive: { borderWidth: 1.5, borderColor: '#a5b4fc', backgroundColor: 'rgba(165,180,252,0.15)' },
  chipText: { fontSize: 12.5, color: '#8892a4' },
  chipTextActive: { color: '#a5b4fc', fontWeight: '600' },
});
