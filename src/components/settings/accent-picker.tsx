import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ACCENTS, ACCENT_DESCRIPTIONS, ACCENT_LABELS, ACCENT_NAMES } from '@/constants/accents';
import { useAccentChoice } from '@/contexts/accent-context';

/**
 * The accent picker.
 *
 * Three swatches inline rather than a row that opens a sheet, which is how
 * every other choice in Settings works. The exception is deliberate: this is
 * the one setting whose effect is the screen you are looking at, and the whole
 * app repaints on the tap. Putting it behind a sheet would hide the result
 * behind the thing showing it.
 *
 * Each swatch is painted in its OWN accent, not the active one — you are
 * choosing between colours, so the colours have to be visible before you
 * commit. That is why this component reads ACCENTS directly as well as going
 * through the hook.
 */
export function AccentPicker() {
  const { name, setAccent, error } = useAccentChoice();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Accent colour</Text>
      <Text style={styles.help}>{ACCENT_DESCRIPTIONS[name]}</Text>

      <View style={styles.row}>
        {ACCENT_NAMES.map(option => {
          const tokens = ACCENTS[option];
          const selected = option === name;
          return (
            <Pressable
              key={option}
              onPress={() => setAccent(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${ACCENT_LABELS[option]} accent`}
              style={({ pressed }) => [
                styles.swatch,
                // The selected ring is drawn in the option's own colour, so
                // it reads at a glance even before the app has repainted.
                selected && { borderColor: tokens.text, borderWidth: 2 },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.chip, { backgroundColor: tokens.fill }]}>
                {selected && (
                  <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                    <Path
                      d="M3 8l3.5 3.5L13 5"
                      stroke={tokens.onFill}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                )}
              </View>
              <Text style={[styles.name, selected && { color: tokens.text }]}>
                {ACCENT_LABELS[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// Plain StyleSheet, not makeAccentStyles: none of this chrome follows the
// active accent. Every colour that varies is one of the three options and
// comes from ACCENTS inline, because the picker has to show all three at
// once regardless of which is on.
const styles = StyleSheet.create({
  wrap: { paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  label: { fontSize: 15, color: '#e2e8f0', fontWeight: '500' },
  help: { fontSize: 13, color: '#8892a4', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  swatch: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    // Transparent rather than absent, so selecting one does not shift the
    // other two by the ring's width.
    borderColor: 'transparent',
    backgroundColor: '#12151d',
  },
  pressed: { opacity: 0.75 },
  chip: {
    width: 40,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, color: '#8892a4', fontWeight: '500' },
  error: { fontSize: 12, color: '#f87171', marginTop: 8 },
});
