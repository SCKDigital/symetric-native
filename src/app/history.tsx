import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function HistoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <PlaceholderScreen
        title="History"
        note="Day-by-day log + intervention marker dots. Biggest chart surface after Insights — HistoryScreen.tsx's inline SVG charts need a react-native-svg rebuild."
      />
    </SafeAreaView>
  );
}
