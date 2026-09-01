import { Text } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { getDomainColorFromProfile } from '@/lib/domains';
import type { SentenceHighlight } from '@/lib/pattern-findings';

interface Props {
  sentence: string;
  highlights: SentenceHighlight[];
}

// Renders a PatternFinding's plain-language sentence with its domain-name
// substrings colored in their factor's color. Ported from the web app's
// components/shared/HighlightedSentence.tsx — RN's Text supports nesting
// styled Text children the same way a fragment of spans does on the web, so
// the substring-splitting logic is unchanged. Shared between Insights and
// Prepare on the web; only Prepare's PatternReviewSection uses it so far on
// native (Insights still renders finding.sentence as plain text).
export default function HighlightedSentence({ sentence, highlights }: Props) {
  const { profile } = useAuth();

  if (highlights.length === 0) return <>{sentence}</>;

  const found = highlights
    .map(h => ({ ...h, index: sentence.indexOf(h.text) }))
    .filter(h => h.index !== -1)
    .sort((a, b) => a.index - b.index);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  found.forEach((h, i) => {
    if (h.index < cursor) return; // overlapping match — keep the earlier one
    if (h.index > cursor) nodes.push(sentence.slice(cursor, h.index));
    nodes.push(
      <Text key={i} style={{ color: getDomainColorFromProfile(h.factor, profile) }}>{h.text}</Text>
    );
    cursor = h.index + h.text.length;
  });
  if (cursor < sentence.length) nodes.push(sentence.slice(cursor));

  return <>{nodes}</>;
}
