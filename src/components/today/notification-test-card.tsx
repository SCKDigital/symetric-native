import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import NotificationTroubleshootSheet from '@/components/notification-troubleshoot-sheet';
import { useAuth } from '@/contexts/auth-context';
import { makeAccentStyles } from '@/lib/accent-styles';
import { isOnline } from '@/lib/offline/connectivity';
import { sendTestNotification } from '@/lib/test-notification';

/**
 * The second half of the reminders step: prove they actually arrive.
 *
 * Turning reminders on only proves the phone registered. Whether a
 * notification then shows depends on things the server can't see — a Focus
 * mode, a battery optimiser, a summary that holds them back — and the person
 * otherwise finds out by missing a day of check-ins without knowing why. So
 * setup sends one straight away and asks.
 *
 * "Did it arrive?" is a question rather than a result because only the person
 * holding the phone can answer it: a send the push service accepted is all the
 * app can confirm. "No" opens the troubleshooting sheet.
 *
 * Skippable at every point. The reminders step itself is already recorded as
 * done before this card shows, so leaving the app mid-way doesn't bring it back.
 */
type Phase = 'offer' | 'sending' | 'sent' | { failed: string };

export default function NotificationTestCard({ onDone }: { onDone: () => void }) {
  const styles = useStyles();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('offer');
  const [helpOpen, setHelpOpen] = useState(false);

  const send = async () => {
    if (!user || phase === 'sending') return;
    if (!isOnline()) { setPhase({ failed: 'You’re offline. A test needs a connection.' }); return; }
    setPhase('sending');
    const result = await sendTestNotification(user.id);
    setPhase(result.ok ? 'sent' : { failed: result.message });
  };

  const failed = typeof phase === 'object' ? phase.failed : null;

  let title: string;
  let body: string;
  let primary: { label: string; onPress: () => void };
  let secondary: { label: string; onPress: () => void }[];

  if (phase === 'sent') {
    title = 'Did it arrive?';
    body = 'A notification from Symetric should have just appeared.';
    primary = { label: 'Yes, it arrived', onPress: onDone };
    secondary = [{ label: 'No', onPress: () => setHelpOpen(true) }];
  } else if (failed) {
    title = 'The test didn’t send';
    body = failed;
    primary = { label: 'Try again', onPress: send };
    secondary = [{ label: 'Help', onPress: () => setHelpOpen(true) }, { label: 'Skip', onPress: onDone }];
  } else {
    title = 'Check reminders reach you';
    body = 'Send yourself a test notification. It should arrive within a few seconds, even with Symetric open.';
    primary = { label: phase === 'sending' ? 'Sending…' : 'Send a test', onPress: send };
    secondary = [{ label: 'Skip', onPress: onDone }];
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardBody, failed && styles.cardError]}>{body}</Text>
      <View style={styles.cardActions}>
        <Pressable onPress={primary.onPress} accessibilityRole="button"
          style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}>
          <Text style={styles.cardButtonText}>{primary.label}</Text>
        </Pressable>
        {secondary.map(s => (
          <Pressable key={s.label} onPress={s.onPress} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.cardSecondary}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {helpOpen && (
        <NotificationTroubleshootSheet
          onClose={() => setHelpOpen(false)}
          onRetry={() => { setHelpOpen(false); send(); }}
        />
      )}
    </View>
  );
}

// The setup card's own look (setup-cards.tsx), so this reads as the same step.
const useStyles = makeAccentStyles(b => ({
  card: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 3, borderLeftColor: b.text, borderRadius: 12, padding: 16, gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#e2e8f0' },
  cardBody: { fontSize: 13.5, color: '#8892a4', lineHeight: 20 },
  cardError: { color: '#f87171' },
  cardActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  cardButton: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: b.fill },
  cardButtonText: { fontSize: 14, fontWeight: '600', color: b.onFill },
  cardSecondary: { fontSize: 13, color: '#6b7a99' },
  pressed: { opacity: 0.7 },
}));
