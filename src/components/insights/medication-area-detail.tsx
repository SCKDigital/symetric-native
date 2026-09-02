import { ScrollView, StyleSheet, Text, View } from 'react-native';

import BackRow from '@/components/insights/back-row';
import HighlightedSentence from '@/components/shared/highlighted-sentence';
import type { InterventionImpact } from '@/lib/detection/intervention-impact';
import { parseDateString } from '@/lib/date-utils';
import { interventionImpactFindings } from '@/lib/pattern-findings';
import type { InterventionMarker } from '@/types/marker';

// Ported from the web app's components/insights/MedicationAreaDetail.tsx —
// before/after effects of medication & therapy markers. No new detection
// logic; reuses detectInterventionImpacts (already ported, already feeding
// the Medication area row and "What stands out").

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface Props {
  onBack: () => void;
  markers: InterventionMarker[];
  impacts: InterventionImpact[];
}

export default function MedicationAreaDetail({ onBack, markers, impacts }: Props) {
  const findings = interventionImpactFindings(impacts);
  const impactedMarkerIds = new Set(impacts.map(i => i.marker_id));
  const eligibleMarkers = markers.filter(m => m.marker_type === 'medication' || m.marker_type === 'therapy');
  const noImpactYet = eligibleMarkers.filter(m => !impactedMarkerIds.has(m.id));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <BackRow label="Medication" onBack={onBack} />

      {findings.length === 0 ? (
        <Text style={styles.emptyText}>No standout effects yet. Effects can usually only be read once at least a week has passed on either side of a change.</Text>
      ) : (
        <View style={styles.list}>
          {impacts.map(impact => {
            const f = findings.find(x => x.id === `impact-${impact.marker_id}`);
            if (!f) return null;
            return (
              <View key={impact.marker_id} style={styles.impactCard}>
                <View style={styles.impactHeader}>
                  <Text style={styles.impactLabel}>{impact.marker_label}</Text>
                  <Text style={styles.impactDate}>{fmtDate(impact.marker_date)}</Text>
                </View>
                <Text style={styles.impactSentence}>
                  <HighlightedSentence sentence={f.sentence} highlights={f.sentenceHighlights} />
                </Text>
                <Text style={styles.impactEvidence}>{f.evidenceLine}</Text>
              </View>
            );
          })}
        </View>
      )}

      {noImpactYet.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Too early to read</Text>
          <View style={styles.tooEarlyList}>
            {noImpactYet.map(m => (
              <Text key={m.id} style={styles.tooEarlyText}>{m.label}, {fmtDate(m.marker_date)}: too early to read</Text>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.disclaimer}>These are observations from your data, not clinical conclusions. Patterns in the period after a marker don’t imply causation.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24 },
  emptyText: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  list: { gap: 10 },
  impactCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12, padding: 14, paddingHorizontal: 16 },
  impactHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  impactLabel: { fontSize: 12, color: '#a5b4fc', fontWeight: '600' },
  impactDate: { fontSize: 11, color: '#4a5568' },
  impactSentence: { fontSize: 13, color: '#c8d0e0', marginBottom: 4, lineHeight: 19 },
  impactEvidence: { fontSize: 11, color: '#4a5568' },
  section: { gap: 0 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 10 },
  tooEarlyList: { gap: 6 },
  tooEarlyText: { fontSize: 13, color: '#6b7a99', lineHeight: 19 },
  disclaimer: { fontSize: 12, color: '#4a5568', lineHeight: 18 },
});
