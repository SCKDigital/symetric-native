import { ScrollView, StyleSheet, Text, View } from 'react-native';

import BackRow from '@/components/insights/back-row';
import HighlightedSentence from '@/components/shared/highlighted-sentence';
import { BODY_COLOR } from '@/lib/domains';
import { CONFIDENCE_COPY, PatternFinding } from '@/lib/pattern-findings';
import type { BodyDomainSummary, BodyEventSummary } from '@/lib/report/types';

// Ported from the web app's components/insights/BodyAreaDetail.tsx — the
// "Body" area's Insights drill-down: patterns (reusing the same
// PatternFinding shape/CONFIDENCE_COPY every other area's findings use),
// current per-domain levels (the same aggregation the PDF report uses, via
// body-summary.ts), and event counts. Mechanic swap only: div/p → View/Text,
// inline style objects → StyleSheet.
//
// Not wired to a caller yet — the Insights "Body" area row isn't tappable on
// native (no per-area detail screens exist for ANY area yet, mind included;
// see insights.tsx's own header comment). That tap-through wiring is chunk 6
// of the body-detector sub-series, done last since it also has to wire in
// chunks 1-4's detectors as this screen's data source.

interface Props {
  onBack: () => void;
  domains: BodyDomainSummary[];
  events: BodyEventSummary[];
  daysLogged: number;
  findings: PatternFinding[];
}

export default function BodyAreaDetail({ onBack, domains, events, daysLogged, findings }: Props) {
  const shown = findings.filter(f => f.grade !== 'limited');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <BackRow label="Body" onBack={onBack} />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Patterns</Text>
        {shown.length === 0 ? (
          <Text style={styles.emptyText}>Nothing standing out yet. This usually needs a few weeks of body check-ins.</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Current levels</Text>
        <Text style={styles.daysLoggedText}>{daysLogged} day{daysLogged !== 1 ? 's' : ''} logged in this window</Text>

        {domains.length === 0 ? (
          <Text style={styles.emptyText}>No body check-ins logged in this window yet.</Text>
        ) : (
          <View style={styles.list}>
            {domains.map(d => (
              <View key={d.domain} style={styles.domainCard}>
                <Text style={styles.domainLabel}>{d.label}</Text>
                <Text style={styles.domainStats}>
                  avg {d.avg} · range {d.min === d.max ? d.min : `${d.min} to ${d.max}`} · {d.count} reading{d.count !== 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Events</Text>
          <View style={styles.list}>
            {events.map(e => (
              <View key={e.eventType} style={styles.eventCard}>
                <Text style={styles.eventLabel}>{e.label}</Text>
                <Text style={styles.eventCount}>{e.count}×</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 24 },
  section: { gap: 0 },
  sectionLabel: { fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '600', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  list: { gap: 10 },
  findingCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, borderLeftColor: BODY_COLOR, borderRadius: 12, padding: 14, paddingHorizontal: 16 },
  findingSentence: { fontSize: 14, color: '#e2e8f0', marginBottom: 6, lineHeight: 21 },
  findingEvidence: { fontSize: 12, color: '#4a5568' },
  daysLoggedText: { fontSize: 12, color: '#4a5568', marginBottom: 10 },
  domainCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, borderLeftColor: BODY_COLOR, borderRadius: 12, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  domainLabel: { fontSize: 13, fontWeight: '500', color: '#c8d0e0' },
  domainStats: { fontSize: 12, color: '#8892a4', textAlign: 'right' },
  eventCard: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventLabel: { fontSize: 13, color: '#c8d0e0' },
  eventCount: { fontSize: 12, color: '#8892a4' },
});
