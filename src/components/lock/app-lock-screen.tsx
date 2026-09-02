import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PinEntry from '@/components/lock/pin-entry';
import { SymetricLogo } from '@/components/symetric-logo';
import { PIN_LENGTH, verifyPin } from '@/lib/app-lock';

// Ported from the web app's components/lock/AppLockScreen.tsx — the
// full-screen PIN prompt shown when the app is locked. No SafeAreaView:
// this fills the whole screen behind the status bar like the web version's
// 100vh fixed overlay, matching PulseLoadingScreen's own root treatment.

interface Props {
  pinHash: string;
  pinSalt: string;
  onUnlock: () => void;
}

export default function AppLockScreen({ pinHash, pinSalt, onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking) return;
    let cancelled = false;
    // See use-today-check-ins.ts for why this async-verify-on-full-entry
    // pattern needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecking(true);

    verifyPin(pin, pinSalt, pinHash).then(ok => {
      if (cancelled) return;
      if (ok) { onUnlock(); return; }
      setError(true);
      setPin('');
      setChecking(false);
    });

    return () => { cancelled = true; };
  }, [pin, checking, pinHash, pinSalt, onUnlock]);

  return (
    <View style={styles.root}>
      <SymetricLogo size={64} />
      <View style={styles.messageBlock}>
        <Text style={styles.title}>Enter your PIN</Text>
        {error && <Text style={styles.errorText}>Incorrect PIN. Try again.</Text>}
      </View>
      <PinEntry length={PIN_LENGTH} value={pin} onChange={v => { setError(false); setPin(v); }} shake={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12', alignItems: 'center', justifyContent: 'center', gap: 32, padding: 24 },
  messageBlock: { alignItems: 'center', minHeight: 40 },
  title: { fontSize: 16, fontWeight: '600', color: '#e2e4ec' },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 6 },
});
