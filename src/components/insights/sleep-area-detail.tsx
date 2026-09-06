import { ScrollView, StyleSheet, Text, View } from 'react-native';

import BackRow from '@/components/insights/back-row';
import HighlightedSentence from '@/components/shared/highlighted-sentence';
import { DOMAIN_COLORS } from '@/lib/domains';
import { CONFIDENCE_COPY, PatternFinding } from '@/lib/pattern-findings';

// Ported from the web app's components/insights/SleepAreaDetail.tsx, with one
// deliberate data-shape difference: the web version takes raw
// SleepSymptomConnection[] and turns them into sentences itself, while this
// screen takes PatternFinding[] already shaped by pattern-findings.ts.
//
// The substance is the same either way now. detection/sleep-connections.ts is
// ported and scheduled, so insights.tsx's sleepFindings carries real
// sleepConnectionFindings alongside the sleep-tagged lag relationships —
// where it used to carry only the latter, because the detector didn't exist
// here at all.

interface Props {
  onBack: () => void;
  findings: PatternFinding[];
  avgSleepScore: number | null;
  nightsLogged: number;
}

export default function SleepAreaDetail({ onBack, findings, avgSleepScore, nightsLogged }: Props) {
  const shown = findings.filter(f => f.grade !== 'limited');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <BackRow label="Sleep" onBack={onBack} />

      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Average sleep score</Text>
        <Text style={styles.statValue}>{avgSleepScore != null ? `${avgSleepScore.toFixed(1)} / 5` : '-'}</Text>
        <Text style={styles.statMeta}>{nightsLogged} night{nightsLogged !== 1 ? 's' : ''} logged in this window</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Connections</Text>
        {shown.length === 0 ? (
          <Text style={styles.emptyText}>No clear sleep connections yet. This usually needs a few weeks of both sleep and check-in data.</Text>
        ) : (
          <View style={styles.list}>
            {shown.map(f => {
              const conf = CONFIDENCE_COPY[f.grade];
              return (
                <View key={`${f.patternSource ?? 'x'}-${f.id}`} style={styles.findingCard}>
                  <Text style={styles.findingSentence}>
                    <HighlightedSentence sentence={f.sentence} highlights={f.sentenceHighlights} />
                  </Text>
                  <Text style={styles.findingEvidence}>{f.evidenceLine} · {conf.short}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24 },
  statCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, borderLeftColor: DOMAIN_COLORS.sleep, borderRadius: 14, padding: 18 },
  statLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: '600', color: '#e2e8f0', marginBottom: 4, fontVariant: ['tabular-nums'] },
  statMeta: { fontSize: 12, color: '#4a5568' },
  section: { gap: 0 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  list: { gap: 10 },
  findingCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 3, borderLeftColor: DOMAIN_COLORS.sleep, borderRadius: 12, padding: 14, paddingHorizontal: 16 },
  findingSentence: { fontSize: 14, color: '#c8d0e0', marginBottom: 6, lineHeight: 21 },
  findingEvidence: { fontSize: 12, color: '#4a5568' },
});
