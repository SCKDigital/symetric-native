import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '@/contexts/auth-context';

// Ports of the web SettingsScreen.tsx's own layout primitives — the grouped
// card, its labelled sections, and the icon + label + subtitle + accessory row
// they contain. Native Settings had none of this: it was a marker FlatList
// with a few hand-rolled toggle rows bolted to its footer, which is why the
// two screens looked nothing alike even where they offered the same control.

export function SectionLabel({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <Text style={[styles.sectionLabel, danger && styles.sectionLabelDanger]}>{String(children).toUpperCase()}</Text>;
}

export function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

export function RowDivider() {
  return <View style={styles.divider} />;
}

export function ChevronRight({ color = '#555c72' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="M5 2l5 5-5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function InlineMessage({ type, children }: { type: 'error' | 'info'; children: React.ReactNode }) {
  return <Text style={[styles.inlineMessage, type === 'error' && styles.inlineMessageError]}>{children}</Text>;
}

type IconColor = 'indigo' | 'danger' | 'slate';

const ICON_BG: Record<IconColor, string> = {
  indigo: 'rgba(123,131,240,0.15)',
  danger: 'rgba(176,80,80,0.12)',
  slate: 'rgba(139,144,164,0.12)',
};

export function RowIcon({ color, children }: { color: IconColor; children: React.ReactNode }) {
  const { profile } = useAuth();
  const bg = profile?.simplified_colors ? ICON_BG.indigo : ICON_BG[color];
  return <View style={[styles.rowIcon, { backgroundColor: bg }]}>{children}</View>;
}

interface SettingsRowProps {
  icon: React.ReactNode;
  iconColor?: IconColor;
  label: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}

export function SettingsRow({ icon, iconColor = 'indigo', label, subtitle, right, onPress, danger }: SettingsRowProps) {
  const inner = (
    <View style={styles.row}>
      <RowIcon color={danger ? 'danger' : iconColor}>{icon}</RowIcon>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/** The "Edit ›" accessory the web rows use on the right-hand side. */
export function RowValue({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <>
      <Text style={styles.rowValue}>{children}</Text>
      <ChevronRight color={danger ? '#b05050' : undefined} />
    </>
  );
}

/** Transient confirmation/failure message. The web version is fixed above the
 *  tab bar; here it sits in the same place via absolute positioning. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

/**
 * The bottom sheet every Settings sheet sits in. The web app builds these
 * from a fixed backdrop plus a drag handle (useDragToDismiss); RN gets the
 * same shape from a transparent Modal, with tap-outside to dismiss standing
 * in for the drag — the handle is kept as an affordance so the sheets still
 * read the same way.
 */
export function SheetShell({ title, description, onClose, children }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>{title}</Text>
            {description ? <Text style={styles.sheetDescription}>{description}</Text> : null}
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The filled action button at the foot of a sheet. */
export function SheetButton({ label, onPress, disabled, danger }: {
  label: string; onPress: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.sheetButton,
        danger && styles.sheetButtonDanger,
        disabled && styles.sheetButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.sheetButtonText, disabled && styles.sheetButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function SheetCancel({ onPress, label = 'Cancel' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Text style={styles.sheetCancel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#555c72',
    letterSpacing: 0.9, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 4,
  },
  sectionLabelDanger: { color: 'rgba(176,80,80,0.6)' },

  sectionCard: {
    backgroundColor: '#181c26', borderWidth: 1, borderColor: '#252b3b',
    borderRadius: 14, overflow: 'hidden', marginBottom: 10,
  },
  divider: { height: 1, backgroundColor: '#252b3b', marginHorizontal: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#e2e4ec' },
  rowLabelDanger: { color: '#b05050' },
  rowSubtitle: { fontSize: 12, color: '#8b90a4', marginTop: 2, lineHeight: 17 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  rowValue: { fontSize: 14, color: '#8b90a4' },

  inlineMessage: { fontSize: 13, color: '#94a3b8', lineHeight: 20, marginTop: 8 },
  inlineMessageError: { color: '#f87171' },

  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: '#1e2533', borderWidth: 1, borderColor: '#2d3748',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { fontSize: 13, color: '#e2e4ec' },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#141820', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 24, paddingBottom: 48, maxHeight: '85%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2d3748', alignSelf: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#e2e4ec', marginBottom: 6 },
  sheetDescription: { fontSize: 13, color: '#8b90a4', lineHeight: 20, marginBottom: 20 },

  sheetButton: { marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center' },
  sheetButtonDanger: { backgroundColor: '#7f1d1d' },
  sheetButtonDisabled: { backgroundColor: '#1e2533' },
  sheetButtonText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  sheetButtonTextDisabled: { color: '#4a5568' },
  sheetCancel: { fontSize: 14, color: '#8b90a4', textAlign: 'center', paddingTop: 14 },
});
