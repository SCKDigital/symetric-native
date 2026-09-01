import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BodyCheckIn from '@/components/body/body-check-in';
import MarkerModal from '@/components/marker-modal';
import { CalendarIcon, PillIcon, PinIcon } from '@/components/marker-icons';
import { PulseLoadingScreen } from '@/components/pulse-loading-screen';
import { useAuth } from '@/contexts/auth-context';
import { parseDateString } from '@/lib/date-utils';
import { markerColors, markerTypeLabels, MarkerType } from '@/lib/marker-colors';
import { createMarker, deleteMarker, fetchMarkers, updateMarker } from '@/lib/queries/markers';
import { supabase } from '@/lib/supabase';
import type { InterventionMarker } from '@/types/marker';

const MARKER_ICON: Record<MarkerType, typeof PillIcon> = {
  medication: PillIcon,
  therapy: CalendarIcon,
  life_event: PinIcon,
  cycle_phase: PinIcon,
};

function formatMarkerDate(dateStr: string): string {
  return parseDateString(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Settings' real features so far: intervention marker CRUD (ported from
// the web app's Settings marker section + MarkerModal.tsx) and a body
// check-in entry point — a deliberately minimal, temporary wiring point
// for chunk 1 of the body-tracking port (see body-check-in.tsx's own
// header comment), standing in for the real per-domain toggle sheet
// (BodyTrackingSheet.tsx) that isn't ported yet. Everything else the web
// Settings screen has (domain toggles, push opt-in, PDF report
// generation, PIN lock) is still a placeholder note below.
export default function SettingsScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState<InterventionMarker[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMarker, setEditingMarker] = useState<InterventionMarker | undefined>(undefined);
  const [showBodyCheckIn, setShowBodyCheckIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMarkers(await fetchMarkers());
    } catch (e) {
      console.error('[Settings] fetch markers error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // See use-today-check-ins.ts for why this needs the disable comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleSave = async (input: Parameters<typeof createMarker>[0]) => {
    if (editingMarker) {
      const updated = await updateMarker({ id: editingMarker.id, ...input });
      setMarkers(prev => prev.map(m => (m.id === updated.id ? updated : m)).sort((a, b) => b.marker_date.localeCompare(a.marker_date)));
    } else {
      const created = await createMarker(input);
      setMarkers(prev => [created, ...prev].sort((a, b) => b.marker_date.localeCompare(a.marker_date)));
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMarker(id);
    setMarkers(prev => prev.filter(m => m.id !== id));
  };

  // No Settings toggle exists yet to turn body_tracking_enabled on (that's
  // BodyTrackingSheet, not ported) — flip it here instead, the first time
  // someone opens the check-in form, so History's body section (gated on
  // this same flag, matching the web app) isn't a dead end for data this
  // screen lets you log.
  const handleOpenBodyCheckIn = async () => {
    if (user && !profile?.body_tracking_enabled) {
      await supabase.from('profiles').update({ body_tracking_enabled: true }).eq('id', user.id);
      await refreshProfile();
    }
    setShowBodyCheckIn(true);
  };

  if (loading) return <PulseLoadingScreen />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={markers}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Settings</Text>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Markers</Text>
              <Pressable
                onPress={() => {
                  setEditingMarker(undefined);
                  setShowModal(true);
                }}
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                <Text style={styles.addButtonText}>+ Add marker</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>Medication changes, appointments, and life events show as dots on History and feed pattern detection on Insights.</Text>
          </>
        }
        renderItem={({ item }) => {
          const Icon = MARKER_ICON[item.marker_type];
          const color = markerColors[item.marker_type];
          return (
            <Pressable
              onPress={() => {
                setEditingMarker(item);
                setShowModal(true);
              }}
              style={({ pressed }) => [styles.markerRow, pressed && styles.pressed]}>
              <View style={[styles.markerIcon, { backgroundColor: `${color}22` }]}>
                <Icon size={16} color={color} />
              </View>
              <View style={styles.markerText}>
                <Text style={styles.markerLabel}>{item.label}</Text>
                <Text style={styles.markerMeta}>
                  {markerTypeLabels[item.marker_type]} · {formatMarkerDate(item.marker_date)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No markers yet</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.bodySection}>
              <Text style={styles.sectionLabel}>Body tracking</Text>
              <Text style={styles.sectionHint}>
                Alpha — physical symptoms tracked separately from mind check-ins. Opening this the first time turns body tracking on; there’s no way to turn it back off yet.
              </Text>
              <Pressable onPress={handleOpenBodyCheckIn} style={({ pressed }) => [styles.bodyCheckInButton, pressed && styles.pressed]}>
                <Text style={styles.bodyCheckInButtonText}>Log body check-in</Text>
              </Pressable>
            </View>

            <Text style={styles.footerNote}>Domain toggles, push notifications, PDF report generation, and PIN lock aren’t built yet — this screen only covers markers and a body check-in entry point so far.</Text>
            <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        }
      />

      {showModal && (
        <MarkerModal
          marker={editingMarker}
          onSave={handleSave}
          onDelete={editingMarker ? handleDelete : undefined}
          onClose={() => setShowModal(false)}
          cycleTrackingEnabled={profile?.cycle_tracking_enabled ?? false}
        />
      )}

      <BodyCheckIn visible={showBodyCheckIn} onClose={() => setShowBodyCheckIn(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c12' },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 26, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.6, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionLabel: { fontSize: 11, color: '#818cf8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.9 },
  sectionHint: { fontSize: 12.5, color: '#4a5568', lineHeight: 18, marginBottom: 16 },
  addButton: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(99,102,241,0.15)' },
  addButtonText: { fontSize: 12.5, fontWeight: '600', color: '#818cf8' },
  pressed: { opacity: 0.7 },
  markerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 14, padding: 12, paddingHorizontal: 14, marginBottom: 8 },
  markerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  markerText: { flex: 1 },
  markerLabel: { fontSize: 14, fontWeight: '500', color: '#e2e8f0', marginBottom: 2 },
  markerMeta: { fontSize: 12, color: '#8892a4' },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#4a5568' },
  footer: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#1e2533', gap: 16 },
  bodySection: {},
  bodyCheckInButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(188,129,47,0.15)', alignSelf: 'flex-start' },
  bodyCheckInButtonText: { fontSize: 13, fontWeight: '600', color: '#BC812F' },
  footerNote: { fontSize: 12, color: '#4a5568', lineHeight: 18 },
  signOutButton: { alignItems: 'center', padding: 12 },
  signOutText: { fontSize: 14, color: '#f87171' },
});
