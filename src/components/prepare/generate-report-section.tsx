import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { parseDateString } from '@/lib/date-utils';
import { generateReport } from '@/lib/report/generate-report';
import { supabase } from '@/lib/supabase';
import type { DetectedCluster } from '@/lib/supabase';

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  clusters: DetectedCluster[];
  appointmentId?: string;
  fromDate: string;
  toDate: string;
}

// Chunk 1 of the PDF report port — see generate-report.ts's header comment
// for exactly what's in Page 1 and what's deferred. This component itself
// is also scoped down from the web app's GenerateReportSection.tsx: no
// report-name field (uses the profile name/email as-is), no mind/body/
// cycle include-toggle UI (body content is included automatically whenever
// the user has body tracking on — see generateReport's bodyTrackingEnabled
// param), no copy-as-markdown alternative. Mechanic swap: the web app's
// auto-download anchor click -> expo-print's printToFileAsync followed by
// the native share sheet (expo-sharing), since there's no browser
// downloads folder on native to drop a file into.
export default function GenerateReportSection({ clusters, appointmentId, fromDate, toDate }: Props) {
  const { user, profile } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInCount, setCheckInCount] = useState<number | null>(null);
  const [reportName, setReportName] = useState(profile?.report_display_name ?? '');
  const [includeMind, setIncludeMind] = useState(true);
  const [includeBody, setIncludeBody] = useState(profile?.body_tracking_enabled ?? false);
  const [includeCycle, setIncludeCycle] = useState(profile?.cycle_tracking_enabled ?? false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('scheduled_at', fromDate + 'T00:00:00Z')
      .lte('scheduled_at', toDate + 'T23:59:59Z')
      .then(({ count }) => setCheckInCount(count ?? 0));
  }, [user, fromDate, toDate]);

  async function handleGenerate() {
    if (!user || !profile) return;
    setGenerating(true);
    setError(null);
    setGenerated(false);
    try {
      // Remembered for next time, same as the web app — a clinician-facing
      // name is not something to retype every appointment.
      const trimmed = reportName.trim();
      if (trimmed !== (profile.report_display_name ?? '')) {
        await supabase.from('profiles').update({ report_display_name: trimmed || null }).eq('id', user.id);
      }

      const { uri } = await generateReport({
        userId: user.id,
        userName: trimmed || profile.display_name || profile.email,
        dateFrom: fromDate,
        dateTo: toDate,
        clusters,
        appointmentId,
        bodyTrackingEnabled: profile.body_tracking_enabled ?? false,
        includeMind,
        includeBody,
        includeCycle,
      });
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      }
      setGenerated(true);
    } catch (e) {
      console.error('[GenerateReportSection]', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to generate report: ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  const flaggedCount = clusters.filter(c => c.flagged_for_report).length;
  // Nothing selected means nothing to report on.
  const disabled = generating || (!includeMind && !includeBody && !includeCycle);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Generate report</Text>
      <Text style={styles.dateRange}>{fmtDate(fromDate)} - {fmtDate(toDate)}</Text>

      <Text style={styles.fieldLabel}>What should the report call you?</Text>
      <TextInput
        value={reportName}
        onChangeText={setReportName}
        placeholder="Sam"
        placeholderTextColor="#4a5568"
        style={styles.nameInput}
      />
      <Text style={styles.fieldHint}>
        First name or a nickname - whatever you&apos;d want a clinician to call you. Symetric doesn&apos;t need your full name.
      </Text>

      <View style={styles.includeList}>
        <IncludeToggle label="Include mind check-ins" checked={includeMind} onToggle={() => setIncludeMind(v => !v)} />
        <IncludeToggle label="Include body check-ins" checked={includeBody} onToggle={() => setIncludeBody(v => !v)} />
        <IncludeToggle label="Include cycle dates" checked={includeCycle} onToggle={() => setIncludeCycle(v => !v)} />
      </View>

      <Text style={styles.patternCount}>
        {flaggedCount === 0 ? 'No patterns flagged for this report' : `${flaggedCount} pattern${flaggedCount !== 1 ? 's' : ''} selected for this report`}
      </Text>

      {checkInCount !== null && checkInCount === 0 && (
        <Text style={styles.statusText}>No check-ins in this period. Select a longer range or log more check-ins first.</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {generated && <Text style={styles.successText}>✓ Report generated</Text>}

      <Pressable onPress={handleGenerate} disabled={disabled} style={[styles.generateButton, disabled && styles.generateButtonDisabled]}>
        {generating ? (
          <View style={styles.generatingRow}>
            <ActivityIndicator size="small" color="#818cf8" />
            <Text style={styles.generateButtonText}>Generating…</Text>
          </View>
        ) : (
          <Text style={styles.generateButtonText}>{generated ? 'Generate PDF again' : 'Generate PDF'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function IncludeToggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={({ pressed }) => [styles.includeRow, pressed && { opacity: 0.7 }]}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <Text style={styles.includeLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141820', borderWidth: 1, borderColor: '#1e2533', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 12 },
  dateRange: { fontSize: 12, color: '#4a5568', marginBottom: 16 },
  fieldLabel: { fontSize: 14, color: '#e2e8f0', marginBottom: 8 },
  nameInput: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#e2e8f0',
  },
  fieldHint: { fontSize: 12, color: '#4a5568', lineHeight: 18, marginTop: 8, marginBottom: 16 },
  includeList: { gap: 12, marginBottom: 16 },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#2d3748',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkboxTick: { fontSize: 13, color: '#fff', fontWeight: '700' },
  includeLabel: { fontSize: 15, color: '#e2e8f0', flex: 1 },
  patternCount: { fontSize: 13, color: '#6b7a99', marginBottom: 16 },
  statusText: { fontSize: 13, color: '#6b7a99', marginBottom: 12 },
  errorText: { fontSize: 13, color: '#f87171', marginBottom: 12 },
  successText: { fontSize: 13, color: '#818cf8', marginBottom: 12 },
  generateButton: { width: '100%', padding: 13, backgroundColor: '#4f46e5', borderRadius: 10, alignItems: 'center' },
  generateButtonDisabled: { backgroundColor: '#2d3748' },
  generateButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
