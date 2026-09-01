import { StyleSheet, Text, View } from 'react-native';

import { BODY_DOMAIN_ORDER, BODY_DOMAINS, MORNING_BODY_DOMAIN_ORDER } from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import type { BodyColumnMode } from '@/lib/history/day-card-helpers';
import type { BodyCheckIn as BodyCheckInRow, BodyDomainType } from '@/lib/supabase';

interface Props {
  bodyEntry?: BodyCheckInRow;
  columnMode: Exclude<BodyColumnMode, 'off'>;
  /** Formatted pain/injury site list, or "diffuse" — undefined when none. */
  sitesLabel?: string;
  /** Body event labels logged that day, e.g. "A joint went out". */
  eventLabels: string[];
}

const morningCapable = new Set(MORNING_BODY_DOMAIN_ORDER);

// Ported from the web app's BodySection.tsx — an HTML <table> there,
// View/Text rows here since RN has no table primitive.
export default function BodySection({ bodyEntry, columnMode, sitesLabel, eventLabels }: Props) {
  const rows = BODY_DOMAIN_ORDER.flatMap(domain => {
    const pm = bodyEntry?.[domain] ?? null;
    const am = columnMode === 'twice' && morningCapable.has(domain)
      ? (bodyEntry?.[`morning_${domain}` as keyof BodyCheckInRow] as number | null | undefined) ?? null
      : null;
    if (pm === null && am === null) return [];
    return [{ domain, am, pm }];
  });

  // Sites, event labels, and any free-text note all fold into one muted line
  // beneath the rows — e.g. "Neck · painful flush around 3pm" — rather than
  // each getting their own row or paragraph.
  const muted = [sitesLabel, ...eventLabels, bodyEntry?.note].filter(Boolean).join(' · ');

  if (rows.length === 0 && !muted) return null;

  return (
    <View>
      <Text style={styles.heading}>Body</Text>

      {rows.length > 0 && (
        <View>
          <View style={styles.headerRow}>
            <View style={styles.labelCol} />
            {columnMode === 'twice' ? (
              <>
                <Text style={styles.headerCell}>am</Text>
                <Text style={styles.headerCell}>pm</Text>
              </>
            ) : (
              <Text style={styles.headerCell}>value</Text>
            )}
          </View>
          {rows.map(({ domain, am, pm }) => (
            <View key={domain} style={styles.row}>
              <Text style={styles.rowLabel}>{BODY_DOMAINS[domain as BodyDomainType].label}</Text>
              {columnMode === 'twice' && <Text style={styles.cell}>{am === null ? '-' : am}</Text>}
              <Text style={styles.cell}>{pm === null ? '-' : pm}</Text>
            </View>
          ))}
        </View>
      )}

      {muted && <Text style={[styles.mutedText, rows.length > 0 && styles.mutedTextSpaced]}>{muted}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 11, fontWeight: '600', color: BODY_COLOR, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  labelCol: { flex: 1 },
  headerCell: { fontSize: 10, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', textAlign: 'right', width: 44, paddingVertical: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 12, color: '#b0b8c8', paddingVertical: 5 },
  cell: { fontSize: 12, color: '#8892a4', textAlign: 'right', width: 44, paddingVertical: 5 },
  mutedText: { fontSize: 12, color: '#6b7a99', lineHeight: 18 },
  mutedTextSpaced: { marginTop: 8 },
});
