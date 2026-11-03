import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DayCard from '@/components/history/day-card';
import AppLogoHeader from '@/components/shared/app-logo-header';
import MarkerModal from '@/components/marker-modal';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { DayData, useHistory } from '@/hooks/use-history';
import { resolveBodyColumnMode } from '@/lib/history/day-card-helpers';
import { addDays, parseDateString, todayDateString } from '@/lib/date-utils';
import { deleteMarker, updateMarker } from '@/lib/queries/markers';
import type { InterventionMarker } from '@/types/marker';

function formatDayLabel(dateStr: string): string {
  // Read per call, not once at module load: a module-level "today" went stale
  // the first midnight the app stayed open, and every label shifted by a day.
  // Yesterday by calendar, not 24 hours back, which misses on DST changeovers.
  const today = todayDateString();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  return parseDateString(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr: string): string {
  return parseDateString(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Scoped port of the web app's HistoryScreen.tsx — the Timeline (list) view
// only. Intervention markers and body tracking (chunk 2 of the body-tracking
// port) ARE now included. Still not ported: the Calendar view
// (MonthViewCalendar), cluster/pattern highlighting, edit/delete check-in
// actions, the info sheet. See use-history.ts and day-card.tsx for the
// specific scoping notes.
export default function HistoryScreen() {
  const { profile } = useAuth();
  const { loading, days, timeFormat, refresh } = useHistory();
  const [editingMarker, setEditingMarker] = useState<InterventionMarker | null>(null);

  if (loading) return <PulseLoadingScreen />;

  const bodyColumnMode = resolveBodyColumnMode(profile?.body_tracking_enabled ?? false, profile?.body_morning_enabled ?? false);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={days}
        keyExtractor={d => d.date}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <AppLogoHeader />
            <Text style={styles.heading}>History</Text>
          </>
        }
        renderItem={({ item }: { item: DayData }) => (
          <DayCard
            date={item.date}
            dayLabel={formatDayLabel(item.date)}
            fullDateLabel={formatFullDate(item.date)}
            completedCheckIns={item.checkIns.filter(ci => ci.status === 'completed')}
            profile={profile}
            sleepLog={item.sleepLog}
            dayMarkers={item.markers}
            bodyColumnMode={bodyColumnMode}
            bodyEntry={item.bodyEntry}
            bodyPainSites={item.bodyPainSites}
            bodyEvents={item.bodyEvents}
            cycleDay={item.cycleDay}
            timeFormat={timeFormat}
            onEditMarker={setEditingMarker}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No check-ins yet</Text>
          </View>
        }
      />

      {editingMarker && (
        <MarkerModal
          marker={editingMarker}
          onSave={async input => {
            await updateMarker({ id: editingMarker.id, ...input });
            await refresh();
          }}
          onDelete={async id => {
            await deleteMarker(id);
            await refresh();
          }}
          onClose={() => setEditingMarker(null)}
          cycleTrackingEnabled={profile?.cycle_tracking_enabled ?? false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 8 },
  heading: { fontSize: 32, fontWeight: '500', color: '#e2e8f0', letterSpacing: -0.6, marginBottom: 12 },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#4a5568' },
});
