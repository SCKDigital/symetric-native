import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

// Ported from the web app's components/lock/PinEntry.tsx — a dot-progress
// row + numeric keypad, shared by AppLockScreen and AppLockPinSheet.
// Mechanic swap: the web version's CSS @keyframes shake -> a small
// Animated.sequence of translateX steps, triggered on `shake` flipping true.

interface Props {
  length: number;
  value: string;
  onChange: (value: string) => void;
  shake?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinEntry({ length, value, onChange, shake }: Props) {
  const [shakeAnim] = useState(() => new Animated.Value(0));
  const prevShake = useRef(false);

  useEffect(() => {
    if (shake && !prevShake.current) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
      ]).start();
    }
    prevShake.current = !!shake;
  }, [shake, shakeAnim]);

  const press = (key: string) => {
    if (key === '') return;
    if (key === 'del') { onChange(value.slice(0, -1)); return; }
    if (value.length >= length) return;
    onChange(value + key);
  };

  const translateX = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX }] }]}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </Animated.View>
      <View style={styles.keypad}>
        {KEYS.map((key, i) => (
          <Pressable key={i} onPress={() => press(key)} disabled={key === ''} style={[styles.key, key === '' && styles.keyHidden]}>
            <Text style={[styles.keyText, key === 'del' && styles.keyTextDel]}>{key === 'del' ? 'Del' : key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 32 },
  dotsRow: { flexDirection: 'row', gap: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#3a4258', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#818cf8', borderColor: '#818cf8' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 64 + 2 * 14, gap: 14 },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#181c26', borderWidth: 1, borderColor: '#252b3b', alignItems: 'center', justifyContent: 'center' },
  keyHidden: { backgroundColor: 'transparent', borderWidth: 0 },
  keyText: { fontSize: 22, fontWeight: '500', color: '#e2e4ec' },
  keyTextDel: { fontSize: 13 },
});
