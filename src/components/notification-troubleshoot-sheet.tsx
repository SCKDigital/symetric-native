import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { SheetButton, SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import { makeAccentStyles } from '@/lib/accent-styles';

// The fuller guide, with a way to contact support at the end of it.
const HELP_URL = 'https://symetric.app/notifications';

/**
 * What to check when a test notification doesn't arrive.
 *
 * Opened from "No" under "Did it arrive?" in first-run setup, and from
 * "Not arriving?" under Settings' test button. Short and on-device on purpose:
 * it works offline and doesn't take someone out of the app at the moment
 * they're trying to get it working. symetric.app/notifications is the
 * fallback for anything this doesn't fix.
 *
 * The checks are the causes the server can't see. If the push service
 * rejected the send, the test reports that itself (lib/test-notification.ts);
 * this sheet is for a send that succeeded and still never showed.
 */
const STEPS: Record<'ios' | 'android', { title: string; body: string }[]> = {
  ios: [
    { title: 'Notifications are allowed', body: 'Settings › Symetric › Notifications. Allow Notifications should be on, with Banners or Lock Screen ticked.' },
    { title: 'A Focus isn’t hiding them', body: 'Do Not Disturb, Sleep and Work Focus all silence apps that aren’t on their allowed list. Add Symetric, or check with Focus off.' },
    { title: 'They aren’t held for a summary', body: 'Settings › Notifications › Scheduled Summary. If Symetric is in it, reminders wait for the summary instead of arriving on time.' },
  ],
  android: [
    { title: 'Notifications are allowed', body: 'Open phone settings below, then Notifications. They should be on for Symetric, including the reminders category.' },
    { title: 'Battery saving isn’t stopping Symetric', body: 'Battery › Unrestricted (or “Don’t optimise”). Samsung, Xiaomi, OnePlus and Oppo phones put apps to sleep, which is the usual reason reminders work for a day and then stop.' },
    { title: 'Do Not Disturb isn’t on', body: 'Swipe down from the top of the screen and check Do Not Disturb, or a bedtime or focus mode, is off.' },
  ],
};

export default function NotificationTroubleshootSheet({ onClose, onRetry }: {
  onClose: () => void;
  /** Send another test from inside the sheet, once something's been changed. */
  onRetry?: () => void;
}) {
  const styles = useStyles();
  const steps = STEPS[Platform.OS === 'ios' ? 'ios' : 'android'];

  return (
    <SheetShell
      title="Not getting notifications?"
      description="Check these three things. Most of the time it’s one of them."
      onClose={onClose}>
      <View style={styles.steps}>
        {steps.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <SheetButton label="Open phone settings" onPress={() => { Linking.openSettings().catch(() => {}); }} />
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Send another test</Text>
        </Pressable>
      )}
      <Pressable onPress={() => { Linking.openURL(HELP_URL).catch(() => {}); }} accessibilityRole="link"
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <Text style={styles.secondaryText}>Still not working? More help</Text>
      </Pressable>
      <SheetCancel onPress={onClose} label="Close" />
    </SheetShell>
  );
}

const useStyles = makeAccentStyles(b => ({
  steps: { gap: 16, marginTop: 8, marginBottom: 20 },
  step: { flexDirection: 'row', gap: 12 },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', lineHeight: 22,
    fontSize: 12, fontWeight: '700', color: b.onFill, backgroundColor: b.fill,
  },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  stepBody: { fontSize: 13.5, color: '#8892a4', lineHeight: 20 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontSize: 14, color: b.text, fontWeight: '500' },
  pressed: { opacity: 0.7 },
}));
