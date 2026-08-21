import { StyleSheet, Text, View } from 'react-native';

import Sparkline from '@/components/history/sparkline';
import { ensureUTC } from '@/lib/date-utils';
import { ALL_DOMAINS, DOMAIN_NAMES, getDomainColorFromProfile } from '@/lib/domains';
import { CheckIn, DomainType, Profile } from '@/lib/supabase';

interface MindSectionProps {
  completedCheckIns: CheckIn[];
  profile: Profile | null | undefined;
}

function timeLabel(iso: string): string {
  return ensureUTC(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Ported from the web app's MindSection.tsx — same per-domain sparkline rows.
export default function MindSection({ completedCheckIns, profile }: MindSectionProps) {
  const sorted = [...completedCheckIns].sort((a, b) => new Date(a.completed_at || a.scheduled_at).getTime() - new Date(b.completed_at || b.scheduled_at).getTime());

  const rows = ALL_DOMAINS.flatMap(domain => {
    const values = sorted.map(ci => ci[domain as keyof CheckIn] as number | null | undefined).filter((v): v is number => v !== null && v !== undefined);
    if (values.length === 0) return [];
    return [{ domain, values, min: Math.min(...values), max: Math.max(...values) }];
  });

  if (rows.length === 0) return null;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstTime = timeLabel(first.completed_at || first.scheduled_at);
  const lastTime = timeLabel(last.completed_at || last.scheduled_at);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Mind</Text>
        <Text style={styles.headerTime}>{firstTime === lastTime ? firstTime : `${firstTime} to ${lastTime}`}</Text>
      </View>
      <View style={styles.rows}>
        {rows.map(({ domain, values, min, max }) => (
          <View key={domain} style={styles.row}>
            <Text style={styles.rowLabel}>{DOMAIN_NAMES[domain as DomainType]}</Text>
            <Sparkline values={values} color={getDomainColorFromProfile(domain, profile)} />
            <Text style={styles.rowRange}>{min === max ? min : `${min} to ${max}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  headerLabel: { fontSize: 11, color: '#818cf8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.9 },
  headerTime: { fontSize: 11, color: '#4a5568' },
  rows: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 12, color: '#b0b8c8', width: 82, flexShrink: 0 },
  rowRange: { fontSize: 12, color: '#8892a4', marginLeft: 'auto', flexShrink: 0, fontVariant: ['tabular-nums'] },
});
