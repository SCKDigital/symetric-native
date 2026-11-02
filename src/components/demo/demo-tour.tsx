import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '@/contexts/accent-context';

// The website demo's guided tour (IS_DEMO builds only — see _layout.tsx). One
// card per tab, floating above the tab bar. It follows the visitor rather than
// leading them: reaching a tab for the first time shows that tab's card, and
// Next just navigates to the following one.
//
// The card gets out of the way as soon as the visitor touches anything else,
// leaving a small pill to bring it back. It has to: step one asks them to
// fill in a check-in, and a card parked over the bottom of the screen would
// sit on that form's Done button. Web only, like the demo, hence the
// document listener.

const STEPS = [
  {
    path: '/',
    title: 'Check in, in seconds',
    body: 'A few times a day, Symetric asks how you’re doing. Try it: tap Log now and move a slider.',
  },
  {
    path: '/history',
    title: 'Every day at a glance',
    body: 'Check-ins, sleep, notes and life events, summed up day by day. Tap Show the day for the detail.',
  },
  {
    path: '/insights',
    title: 'Patterns you’d miss',
    body: 'After a few weeks, Symetric spots what moves together, like how a bad night shows up the next day.',
  },
  {
    path: '/prepare',
    title: 'Ready for your appointment',
    body: 'Turn what you’ve tracked into questions and a report to share with your clinician.',
  },
];

// Clears the web tab bar (see TAB_BAR_HEIGHT_WEB in app-tabs.tsx) with a gap.
const ABOVE_TAB_BAR = 76;

export function DemoTour() {
  const pathname = usePathname();
  const router = useRouter();
  const accent = useAccent();
  const [open, setOpen] = useState(true);
  const seen = useRef(new Set<string>());
  const cardRef = useRef<View>(null);

  const index = STEPS.findIndex(s => s.path === pathname);

  // A tab the visitor hasn't had the card for yet opens it again.
  useEffect(() => {
    if (index === -1 || seen.current.has(pathname)) return;
    seen.current.add(pathname);
    setOpen(true);
  }, [pathname, index]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onPointerDown = (e: PointerEvent) => {
      // On web a View's ref is its DOM node.
      const card = cardRef.current as unknown as HTMLElement | null;
      if (card && !card.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  if (index === -1) return null;

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={[styles.pill, { borderColor: accent.border }]}>
        <Text style={[styles.pillText, { color: accent.text }]}>Tour</Text>
      </Pressable>
    );
  }

  const step = STEPS[index];
  const next = STEPS[index + 1];

  return (
    <View ref={cardRef} style={[styles.card, { borderColor: accent.border, backgroundColor: accent.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.counter, { color: accent.text }]}>{index + 1} of {STEPS.length}</Text>
        <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close the tour">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>
      <Pressable
        onPress={() => (next ? router.navigate(next.path as never) : setOpen(false))}
        style={({ pressed }) => [styles.button, { backgroundColor: accent.fill }, pressed && styles.pressed]}>
        <Text style={[styles.buttonText, { color: accent.onFill }]}>{next ? 'Next' : 'Explore on your own'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: ABOVE_TAB_BAR,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  close: { fontSize: 14, color: '#8892a4' },
  title: { fontSize: 17, fontWeight: '700', color: '#e2e8f0' },
  body: { fontSize: 14, lineHeight: 20, color: '#8892a4' },
  button: { marginTop: 8, paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  pill: {
    position: 'absolute',
    right: 12,
    bottom: ABOVE_TAB_BAR,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#10131c',
  },
  pillText: { fontSize: 13, fontWeight: '700' },
});
