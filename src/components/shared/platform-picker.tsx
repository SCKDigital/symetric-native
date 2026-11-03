import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

import { makeAccentStyles } from '@/lib/accent-styles';

/**
 * The platform date/time picker, with each platform's dismissal handled in
 * one place rather than in every screen that needs a picker.
 *
 * Android shows a dialog that fires onChange once and dismisses itself, so
 * the caller's "open" state is cleared on every change, cancel included.
 * iOS renders an inline spinner that fires on every turn of the wheel and
 * stays mounted, so it gets a Done button that closes it.
 *
 * Render it only while open; `onClose` is where the caller clears that.
 */
export function PlatformPicker({
  value, mode, onPick, onClose, minimumDate, maximumDate, is24Hour,
  variant = 'framed', style, dividerColor,
}: {
  value: Date;
  mode: 'date' | 'time';
  /** A value was chosen. Never called for a cancelled Android dialog. */
  onPick: (selected: Date) => void;
  /** The picker should unmount. */
  onClose: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Android's clock dialog. Left unset, it follows the device setting. */
  is24Hour?: boolean;
  /** 'framed' boxes the spinner with a divided Done row; 'plain' sets a
   *  centred Done link under it. */
  variant?: 'framed' | 'plain';
  /** The framed box: its margins and background differ per sheet. */
  style?: StyleProp<ViewStyle>;
  /** The framed Done row's top border, where the sheet behind needs another. */
  dividerColor?: string;
}) {
  const styles = useStyles();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') onClose();
    if (event.type === 'dismissed' || !selected) return;
    onPick(selected);
  };

  const picker = (
    <DateTimePicker
      value={value}
      mode={mode}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      themeVariant="dark"
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      is24Hour={is24Hour}
      onChange={handleChange}
    />
  );

  if (variant === 'plain') {
    return (
      <>
        {picker}
        {Platform.OS === 'ios' && (
          <Pressable onPress={onClose}>
            <Text style={styles.plainDone}>Done</Text>
          </Pressable>
        )}
      </>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      {picker}
      {Platform.OS === 'ios' && (
        <Pressable onPress={onClose} style={[styles.done, dividerColor !== undefined && { borderTopColor: dividerColor }]}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  wrap: { backgroundColor: '#0a0c12', borderRadius: 10, overflow: 'hidden' },
  done: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#1e2533' },
  doneText: { color: b.text, fontSize: 14, fontWeight: '600' },
  plainDone: { fontSize: 14, color: b.text, textAlign: 'center', paddingVertical: 8 },
}));
