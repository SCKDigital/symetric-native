import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { brandTint } from '@/constants/brand';
import { useAccent } from '@/contexts/accent-context';
import { makeAccentStyles } from '@/lib/accent-styles';
import { approxCheckInTimes, toMinutes, type TimeRange } from '@/lib/quiet-hours';
import type { TimeFormat } from '@/lib/time-format';

/**
 * The pieces every first-run setup screen is built from (2026-11-14 redesign):
 * one question per screen, a step label with a close button, a progress line,
 * and a footer that never scrolls away.
 *
 * SafeAreaView rather than a padded ScrollView is deliberate. The old body
 * sheet padded its ScrollView's content, so once it scrolled the content slid
 * up under the status bar and the clock sat on top of the symptom pills.
 */

const BG = '#0a0c12';
const CARD = '#141820';
const LINE = '#1e2533';
const TITLE = '#e2e8f0';
const BODY = '#8892a4';
const DIM = '#6b7a99';
const FAINT = '#4a5568';

export function SetupScreen({ stepLabel, progress, progressColor, title, lede, onClose, footer, children }: {
  /** e.g. "Step 1 of 3", "Body · 2 of 2", "Cycle · optional". */
  stepLabel: string;
  /** 0 to 1. Omit for a screen that isn't part of a numbered sequence. */
  progress?: number;
  /** Defaults to the accent; Body passes its amber. */
  progressColor?: string;
  title: string;
  lede?: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  const accent = useAccent();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.stepLabel}>{stepLabel.toUpperCase()}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {progress !== undefined && (
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: progressColor ?? accent.text }]} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {lede ? <Text style={styles.lede}>{lede}</Text> : null}
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

/** The footer's usual shape: a status line on the left, the primary button on
 *  the right. */
export function FooterRow({ note, label, onPress, disabled, busy, onBack }: {
  note?: string; label: string; onPress: () => void; disabled?: boolean; busy?: boolean;
  /** Second screen of a two-screen flow: a Back link before the note. */
  onBack?: () => void;
}) {
  const styles = useStyles();
  const off = disabled || busy;
  return (
    <View style={styles.footerRow}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
      )}
      <Text style={styles.footerNote}>{note ?? ''}</Text>
      <PrimaryButton label={busy ? 'Saving…' : label} onPress={onPress} disabled={off} />
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, wide }: {
  label: string; onPress: () => void; disabled?: boolean; wide?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.cta, wide && styles.ctaWide, disabled && styles.ctaDisabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.ctaText, disabled && styles.ctaTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

/** "I don't want to track my cycle", under a screen's primary button. */
export function OptOutLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={styles.optOut}>{label}</Text>
    </Pressable>
  );
}

/** "Not sure? Start with three" and a one-tap button. */
export function SuggestRow({ title, detail, onUse }: { title: string; detail: string; onUse: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.suggest}>
      <View style={styles.suggestText}>
        <Text style={styles.suggestTitle}>{title}</Text>
        <Text style={styles.suggestDetail}>{detail}</Text>
      </View>
      <Pressable onPress={onUse} accessibilityRole="button" style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
        <Text style={styles.miniText}>Use these</Text>
      </Pressable>
    </View>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.tiles}>{children}</View>;
}

/**
 * A choice tile. Its circle is outlined in the item's own colour before it is
 * picked and fills with a tick after, so the colour key is learned while
 * choosing. The circle sits inline before the label; a corner tick overlapped
 * long names like "Social depletion".
 */
export function SelectTile({ label, description, color, selected, onPress }: {
  label: string; description?: string; color: string; selected: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={({ pressed }) => [
        styles.tile,
        selected && { borderColor: color, backgroundColor: brandTint(color, 0.1) },
        pressed && styles.pressed,
      ]}>
      <View style={styles.tileHead}>
        <View style={[styles.tick, { borderColor: color }, selected && { backgroundColor: color }]}>
          {selected && (
            <Svg width={10} height={10} viewBox="0 0 12 12" fill="none">
              <Path d="M2 6l2.5 2.5L10 3.5" stroke={BG} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      {description ? <Text style={styles.tileDesc}>{description}</Text> : null}
    </Pressable>
  );
}

/** A row of equal buttons, one of which is chosen. */
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.seg}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.segBtn, on && styles.segBtnOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Day bar ─────────────────────────────────────────────────────────────────

const BAR_START = 6 * 60;
const BAR_END = 24 * 60;
const pct = (t: string | number) => {
  const m = typeof t === 'number' ? t : toMinutes(t);
  const clamped = Math.max(BAR_START, Math.min(BAR_END, m));
  return `${((clamped - BAR_START) / (BAR_END - BAR_START)) * 100}%` as const;
};
const span = (a: string, b: string) => {
  const s = Math.max(BAR_START, toMinutes(a));
  const e = Math.min(BAR_END, toMinutes(b));
  return `${(Math.max(0, e - s) / (BAR_END - BAR_START)) * 100}%` as const;
};

/**
 * One picture of the day, 06:00 to midnight. The mind times screen lights the
 * waking window and marks check-ins; quiet hours are drawn on the same bar, so
 * the rule that they live inside waking hours needs no explaining. Body setup
 * draws the same bar with the mind window faint and its own check-ins amber.
 */
export function DayBar({ window, checkIns, quiet, body, timeFormat, children }: {
  window: TimeRange;
  checkIns: number;
  quiet?: TimeRange | null;
  /** Body mode: the mind window is drawn faint behind these. */
  body?: { eveningFrom: string; reminder: string; morning: string | null; color: string };
  timeFormat: TimeFormat;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const accent = useAccent();
  const dots = approxCheckInTimes(window, checkIns);
  const inQuiet = (m: number) => !!quiet && m >= toMinutes(quiet.start) && m < toMinutes(quiet.end);
  const ticks = timeFormat === '24hr' ? ['06', '12', '18', '24'] : ['6am', '12pm', '6pm', '12am'];

  return (
    <View style={styles.dayCard}>
      <View style={styles.track}>
        <View style={styles.rail} />
        <View style={[styles.win, { left: pct(window.start), width: span(window.start, window.end), backgroundColor: body ? '#262f3d' : accent.fillAlt }, body && styles.winFaint]} />
        {quiet && <View style={[styles.quiet, { left: pct(quiet.start), width: span(quiet.start, quiet.end) }]} />}
        {body && (
          <View style={[styles.eve, { left: pct(body.eveningFrom), width: span(body.eveningFrom, '23:59'), backgroundColor: brandTint(body.color, 0.55) }]} />
        )}
        {!body && (
          <>
            <View style={[styles.handle, { left: pct(window.start) }]} />
            <View style={[styles.handle, { left: pct(window.end) }]} />
          </>
        )}
        {dots.map((m, i) => (
          <View
            key={i}
            style={[
              body ? styles.dotFaint : styles.dot,
              { left: pct(m) },
              !body && inQuiet(m) && styles.dotMuted,
            ]}
          />
        ))}
        {body && <View style={[styles.pin, { left: pct(body.reminder), backgroundColor: body.color }]} />}
        {body?.morning && <View style={[styles.morning, { left: pct(body.morning), backgroundColor: body.color }]} />}
      </View>
      {/* Four labels at 06, 12, 18 and 24: evenly spaced, so space-between
          puts each under its own point on the bar. */}
      <View style={styles.ticks}>
        {ticks.map(t => <Text key={t} style={styles.tickText}>{t}</Text>)}
      </View>
      {children}
    </View>
  );
}

// ── Opt-out confirmation ─────────────────────────────────────────────────────

/**
 * Confirms that something was turned off. Not an "are you sure?": the change
 * is one switch away from being undone in Settings, and saying so is the point.
 */
export function ConfirmDialog({ visible, title, body, onDone }: {
  visible: boolean; title: string; body: string; onDone: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDone}>
      <View style={styles.dim}>
        <View style={styles.dialog} accessibilityRole="alert">
          <View style={styles.dialogIcon}>
            <Svg width={16} height={16} viewBox="0 0 12 12" fill="none">
              <Path d="M2 6l2.5 2.5L10 3.5" stroke={TITLE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <PrimaryButton label="OK" onPress={onDone} wide />
        </View>
      </View>
    </Modal>
  );
}

/** Small uppercase label above a group of controls. */
export function FieldLabel({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function Note({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'error' }) {
  const styles = useStyles();
  return <Text style={[styles.note, tone === 'error' && styles.noteError]}>{children}</Text>;
}

const useStyles = makeAccentStyles(b => ({
  root: { flex: 1, backgroundColor: BG },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8 },
  stepLabel: { fontSize: 12, color: BODY, fontWeight: '600', letterSpacing: 0.8 },
  close: { fontSize: 26, color: DIM, lineHeight: 28 },
  bar: { height: 3, marginHorizontal: 22, marginTop: 10, backgroundColor: LINE, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2 },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 14 },
  title: { fontSize: 25, fontWeight: '600', color: TITLE, lineHeight: 31, letterSpacing: -0.3 },
  lede: { fontSize: 15, color: BODY, lineHeight: 22, marginTop: -6 },

  footer: { borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, gap: 6 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  footerNote: { flex: 1, fontSize: 13, color: BODY },
  back: { fontSize: 15, color: BODY, paddingVertical: 8 },
  cta: { backgroundColor: b.fill, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, alignItems: 'center' },
  ctaWide: { alignSelf: 'stretch' },
  ctaDisabled: { backgroundColor: LINE },
  ctaText: { fontSize: 15, fontWeight: '600', color: b.onFill },
  ctaTextDisabled: { color: FAINT },
  optOut: { fontSize: 14, color: DIM, textAlign: 'center', paddingVertical: 8 },
  pressed: { opacity: 0.7 },

  suggest: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 12 },
  suggestText: { flex: 1, gap: 2 },
  suggestTitle: { fontSize: 14, fontWeight: '600', color: TITLE },
  suggestDetail: { fontSize: 13, color: BODY },
  mini: { borderWidth: 1, borderColor: b.fillAlt, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
  miniText: { fontSize: 13, fontWeight: '600', color: TITLE },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 11, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tick: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: TITLE, lineHeight: 19 },
  tileDesc: { fontSize: 12.5, color: DIM, lineHeight: 17, paddingLeft: 26 },

  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, borderWidth: 1, borderColor: LINE, backgroundColor: CARD, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  segBtnOn: { backgroundColor: b.fill, borderColor: b.fillAlt },
  segText: { fontSize: 15, color: BODY },
  segTextOn: { color: b.onFill, fontWeight: '600' },

  dayCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 14, gap: 10 },
  track: { height: 34 },
  rail: { position: 'absolute', left: 0, right: 0, top: 14, height: 6, borderRadius: 3, backgroundColor: LINE },
  win: { position: 'absolute', top: 12, height: 10, borderRadius: 5 },
  winFaint: { top: 14, height: 6, borderRadius: 3 },
  quiet: { position: 'absolute', top: 12, height: 10, backgroundColor: BG, borderWidth: 1, borderStyle: 'dashed', borderColor: '#64748b', borderRadius: 3 },
  eve: { position: 'absolute', top: 11, height: 12, borderRadius: 6 },
  handle: { position: 'absolute', top: 5, width: 4, height: 24, marginLeft: -2, borderRadius: 2, backgroundColor: b.onFill },
  dot: { position: 'absolute', top: 9, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: TITLE, borderWidth: 3, borderColor: CARD },
  dotMuted: { backgroundColor: DIM },
  dotFaint: { position: 'absolute', top: 13, width: 8, height: 8, marginLeft: -4, borderRadius: 4, backgroundColor: FAINT },
  pin: { position: 'absolute', top: 2, width: 2, height: 30, marginLeft: -1 },
  morning: { position: 'absolute', top: 10, width: 14, height: 14, marginLeft: -7, borderRadius: 7, borderWidth: 2, borderColor: CARD },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tickText: { fontSize: 11, color: FAINT },

  dim: { flex: 1, backgroundColor: 'rgba(5,6,10,0.72)', justifyContent: 'center', paddingHorizontal: 28 },
  dialog: { backgroundColor: '#12151d', borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 22, gap: 10, alignItems: 'center' },
  dialogIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: LINE, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  dialogTitle: { fontSize: 17, fontWeight: '600', color: TITLE, textAlign: 'center', lineHeight: 23 },
  dialogBody: { fontSize: 14, color: BODY, textAlign: 'center', lineHeight: 20, marginBottom: 6 },

  fieldLabel: { fontSize: 15, fontWeight: '600', color: TITLE, marginTop: 4 },
  note: { fontSize: 13, color: BODY, lineHeight: 19 },
  noteError: { color: '#f87171' },
}));
