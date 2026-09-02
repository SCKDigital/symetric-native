import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import PinEntry from '@/components/lock/pin-entry';
import { PIN_LENGTH, verifyPin } from '@/lib/app-lock';

// Ported from the web app's components/settings/AppLockPinSheet.tsx — the
// enable/disable/change-PIN flow. Mechanic swap: web's useDragToDismiss
// hook (a custom pointer-drag gesture) -> a plain Modal, conditionally
// mounted by its parent (settings.tsx), matching this app's established
// bottom-sheet convention (see BodyTrackingSheet) rather than porting a
// drag gesture with no other precedent in this app.

type Mode = 'enable' | 'disable' | 'change';
type Step = 'verify' | 'new' | 'confirm';

interface Props {
  mode: Mode;
  currentPinHash?: string | null;
  currentPinSalt?: string | null;
  onClose: () => void;
  onSetPin: (pin: string) => Promise<void>;
  onDisable: () => Promise<void>;
}

const STEP_COPY: Record<Step, { title: string; subtitle?: string }> = {
  verify: { title: 'Enter your current PIN' },
  new: { title: 'Choose a PIN', subtitle: `${PIN_LENGTH} digits` },
  confirm: { title: 'Confirm your PIN' },
};

export default function AppLockPinSheet({ mode, currentPinHash, currentPinSalt, onClose, onSetPin, onDisable }: Props) {
  const [step, setStep] = useState<Step>(mode === 'enable' ? 'new' : 'verify');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleComplete = async (enteredPin: string) => {
    setBusy(true);
    setError(null);

    if (step === 'verify') {
      const ok = !!currentPinHash && !!currentPinSalt && await verifyPin(enteredPin, currentPinSalt, currentPinHash);
      if (!ok) { setError('Incorrect PIN.'); setPin(''); setBusy(false); return; }
      if (mode === 'disable') { await onDisable(); onClose(); return; }
      setPin(''); setStep('new'); setBusy(false);
      return;
    }

    if (step === 'new') {
      setFirstPin(enteredPin); setPin(''); setStep('confirm'); setBusy(false);
      return;
    }

    // step === 'confirm'
    if (enteredPin !== firstPin) {
      setError("PINs didn't match. Try again.");
      setFirstPin(''); setPin(''); setStep('new'); setBusy(false);
      return;
    }
    await onSetPin(enteredPin);
    onClose();
  };

  const handleChange = (value: string) => {
    setError(null);
    setPin(value);
    if (value.length === PIN_LENGTH && !busy) handleComplete(value);
  };

  const { title, subtitle } = STEP_COPY[step];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <Text style={styles.errorText}>{error ?? ''}</Text>
          <View style={styles.pinEntryWrap}>
            <PinEntry length={PIN_LENGTH} value={pin} onChange={handleChange} shake={!!error} />
          </View>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { width: '100%', backgroundColor: '#141820', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2d3748', marginBottom: 24 },
  title: { fontSize: 16, fontWeight: '600', color: '#e2e8f0' },
  subtitle: { fontSize: 13, color: '#718096', marginTop: 4 },
  errorText: { fontSize: 13, color: '#f87171', marginTop: 8, minHeight: 16 },
  pinEntryWrap: { marginTop: 16, marginBottom: 8 },
  cancelButton: { paddingTop: 16 },
  cancelButtonText: { fontSize: 14, color: '#8b90a4' },
});
