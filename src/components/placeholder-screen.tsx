import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Scaffold-only stand-in for a screen that hasn't been ported yet. Each real
 * screen replaces its own PlaceholderScreen usage as that slice of the web
 * app's logic and UI gets rebuilt against React Native primitives.
 */
export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.note}>
        {note}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  note: {
    fontSize: 14,
    lineHeight: 21,
  },
});
