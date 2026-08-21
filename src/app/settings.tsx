import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <PlaceholderScreen
        title="Settings"
        note="Domain toggles, PDF report generation, push notification opt-in, PIN lock, intervention marker CRUD — the screen touching the most of the settled architecture decisions (native push, on-device PDF)."
      />
    </SafeAreaView>
  );
}
