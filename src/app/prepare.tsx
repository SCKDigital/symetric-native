import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function PrepareScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <PlaceholderScreen
        title="Prepare"
        note="Appointment questions + pattern review, including the priority-question reorder list — swaps @dnd-kit for react-native-draggable-flatlist."
      />
    </SafeAreaView>
  );
}
