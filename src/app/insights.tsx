import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function InsightsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <PlaceholderScreen
        title="Insights"
        note="Pattern detection + trend charts. Largest single port: InsightsScreen.tsx is ~2,000 lines of hand-rolled inline SVG on the web side."
      />
    </SafeAreaView>
  );
}
