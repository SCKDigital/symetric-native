import { StyleSheet, View } from 'react-native';

import { SymetricLogo } from '@/components/symetric-logo';

/** Matches the web app's App.tsx loading screen (same markup used for both
 * the initial auth-loading gate and the profile-refetch gate). */
export function PulseLoadingScreen() {
  return (
    <View style={styles.root}>
      <SymetricLogo size={96} pulse />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12', alignItems: 'center', justifyContent: 'center' },
});
