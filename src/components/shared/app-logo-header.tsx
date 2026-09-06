import { StyleSheet, Text, View } from 'react-native';

import { SymetricLogo } from '@/components/symetric-logo';

// The wordmark that sits above the page title on Today, History, Insights and
// Settings — a direct port of the web app's components/shared/Logo.tsx, which
// those same four screens render and Prepare deliberately doesn't. Native had
// the mark itself (auth, lock, loading) but never this header, so every tab
// opened without any branding at all.
//
// The web wordmark is set in DM Sans; no custom font is loaded here yet, so
// this falls back to the platform sans. Weight, size and tracking match.
export default function AppLogoHeader() {
  return (
    <View style={styles.row}>
      <SymetricLogo size={28} />
      <Text style={styles.wordmark}>symetric</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  wordmark: { fontSize: 18, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.36 },
});
