import { StyleSheet, Text, View } from 'react-native';

import HighlightedSentence from '@/components/shared/highlighted-sentence';
import { BODY_COLOR } from '@/lib/domains';
import { CONFIDENCE_COPY, type Grade, type PatternFinding } from '@/lib/pattern-findings';

// One card shape for every PatternFinding, on both drill-downs.
//
// Mind and Body used to write the same fact two different ways: Body rendered
// "Your Concentration and End of day exhaustion tend to move together · 16 days
// compared · Firm" in a card with a coloured rail, while Mind's relationship
// cards used a different sentence grammar, a different evidence format, no rail
// and no confidence grade at all. Moving between the two screens read like
// moving between two apps. This is the single card both now use.
//
// Confidence is carried twice on purpose: as the word, and as the card's
// opacity via CONFIDENCE_COPY.barFraction. The dimming is what makes the
// hierarchy legible at a glance; the word is what makes it legible to someone
// who cannot perceive the dimming, and the grade is clinical information in a
// health app, so it does not get encoded in appearance alone.

interface Props {
  finding: PatternFinding;
  /** The section's top-ranked finding: larger type, heavier rail, no dimming. */
  lead?: boolean;
  /** Rail colour. Defaults to the body accent. */
  accent?: string;
}

function opacityFor(grade: Grade, lead: boolean): number {
  return lead ? 1 : CONFIDENCE_COPY[grade].barFraction;
}

export default function FindingCard({ finding, lead = false, accent = BODY_COLOR }: Props) {
  return (
    <View
      style={[
        styles.card,
        lead && styles.cardLead,
        { borderLeftColor: accent, opacity: opacityFor(finding.grade, lead) },
      ]}>
      <Text style={[styles.sentence, lead && styles.sentenceLead]}>
        <HighlightedSentence sentence={finding.sentence} highlights={finding.sentenceHighlights} />
      </Text>
      <Text style={styles.evidence}>
        {finding.evidenceLine} · {CONFIDENCE_COPY[finding.grade].short}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141820',
    borderWidth: 1,
    borderColor: '#1e2533',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  cardLead: { borderLeftWidth: 5, padding: 16, paddingHorizontal: 18, gap: 8 },
  sentence: { fontSize: 14, color: '#e2e8f0', lineHeight: 21 },
  sentenceLead: { fontSize: 15.5, lineHeight: 23, fontWeight: '600' },
  evidence: { fontSize: 12, color: '#4a5568' },
});
