import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CollapsibleRow } from '@/components/insights/pattern-sections';
import HighlightedSentence from '@/components/shared/highlighted-sentence';
import { useAuth } from '@/contexts/auth-context';
import {
  type ConnectionRow, type CorrelationGroup, type CorrelationPair,
  groupClaimLine, groupConnections, groupEvidenceLine, groupHeadline, pairSentence,
} from '@/lib/correlation-groups';
import { getDomainColorFromProfile } from '@/lib/domains';
import { CONFIDENCE_COPY, factorLabel } from '@/lib/pattern-findings';

// "What goes with what" — the same-day correlations, stated as blocks rather
// than as one card per edge.
//
// See correlation-groups.ts for why. The short version: five correlated
// factors produced ten near-identical cards, four of which named the same
// domain, and the actual finding — that they all rise and fall together — was
// never written down anywhere on the screen.
//
// The pairs are not thrown away. They are one tap inside the block, with their
// own day counts, for anyone who wants to check the working.

function DomainChip({ factor }: { factor: string }) {
  const { profile } = useAuth();
  const color = getDomainColorFromProfile(factor, profile);
  return <Text style={[styles.chip, { color, borderColor: color }]}>{factorLabel(factor)}</Text>;
}

function GroupCard({ group }: { group: CorrelationGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{groupHeadline(group)}</Text>
      <View style={styles.chips}>
        {group.members.map(m => <DomainChip key={m} factor={m} />)}
      </View>
      <Text style={styles.sub}>{groupClaimLine(group)}</Text>
      <Text style={styles.evidence}>
        {groupEvidenceLine(group)} · {CONFIDENCE_COPY[group.grade].short}
      </Text>

      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={styles.toggleText}>
          {open
            ? 'Hide the pairs behind this'
            : `Show the ${group.pairs.length} pair${group.pairs.length === 1 ? '' : 's'} behind this`}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {group.pairs.map(p => (
            <View key={`${p.a}-${p.b}`} style={styles.detailRow}>
              <Text style={styles.detailText}>
                <DomainChipInline factor={p.a} /> and <DomainChipInline factor={p.b} />
              </Text>
              <Text style={styles.detailMeta}>
                {p.sampleSize} days · {CONFIDENCE_COPY[p.grade].short}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DomainChipInline({ factor }: { factor: string }) {
  const { profile } = useAuth();
  return <Text style={{ color: getDomainColorFromProfile(factor, profile) }}>{factorLabel(factor)}</Text>;
}

// Not dimmed by confidence, unlike FindingCard.
//
// That card dims everything below the section's lead so the ranking is legible
// at a glance. There is no lead here — a block and a pair are two shapes of the
// same finding, ranked against nothing — so dimming only said "this one is
// Partial" next to an equally Partial block card at full strength, which read
// as the pair being the weaker of the two when it isn't. The grade is still on
// the card, in the word, next to the day count.
function PairCard({ pair }: { pair: CorrelationPair }) {
  const highlights = [
    { text: factorLabel(pair.a), factor: pair.a },
    { text: factorLabel(pair.b), factor: pair.b },
  ];
  return (
    <View style={styles.pairCard}>
      <Text style={styles.pairSentence}>
        <HighlightedSentence sentence={pairSentence(pair)} highlights={highlights} />
      </Text>
      <Text style={styles.evidence}>
        {pair.sampleSize} days compared · {CONFIDENCE_COPY[pair.grade].short}
      </Text>
    </View>
  );
}

export default function WhatGoesWithWhatSection({ rows, defaultOpen = false }: {
  rows: ConnectionRow[];
  defaultOpen?: boolean;
}) {
  const { groups, pairs, cardCount } = useMemo(() => groupConnections(rows), [rows]);
  if (cardCount === 0) return null;

  const meta = [
    groups.length > 0 && `${groups.length} group${groups.length === 1 ? '' : 's'}`,
    pairs.length > 0 && `${pairs.length} pair${pairs.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  return (
    <CollapsibleRow label="What goes with what" meta={meta} defaultOpen={defaultOpen}>
      <Text style={styles.intro}>Things that rise and fall on the same days. Moving together is not the same as one causing the other.</Text>
      {groups.map(g => <GroupCard key={g.id} group={g} />)}
      {pairs.map(p => <PairCard key={`${p.a}-${p.b}`} pair={p} />)}
    </CollapsibleRow>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12, color: '#4a5568', marginBottom: 4, lineHeight: 18 },
  card: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 5, borderLeftColor: '#818cf8', borderRadius: 12,
    padding: 16, paddingHorizontal: 18, gap: 8, marginBottom: 8,
  },
  heading: { fontSize: 15.5, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.2, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 12, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden', lineHeight: 16,
  },
  sub: { fontSize: 13, color: '#8892a4', lineHeight: 19 },
  evidence: { fontSize: 12, color: '#4a5568' },
  toggle: { paddingTop: 2 },
  toggleText: { fontSize: 12, color: '#818cf8' },
  pressed: { opacity: 0.7 },
  detail: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e2533', gap: 8 },
  detailRow: { gap: 2 },
  detailText: { fontSize: 13, color: '#c8d0e0', lineHeight: 19 },
  detailMeta: { fontSize: 11, color: '#6b7a99' },
  pairCard: {
    backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533',
    borderLeftWidth: 4, borderLeftColor: '#818cf8', borderRadius: 12,
    padding: 14, paddingHorizontal: 16, gap: 6, marginBottom: 8,
  },
  pairSentence: { fontSize: 14, color: '#e2e8f0', lineHeight: 21 },
});
