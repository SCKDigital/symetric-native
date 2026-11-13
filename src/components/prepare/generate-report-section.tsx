import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { trackReportGenerated } from '@/lib/analytics';
import { localDayEndISO, localDayStartISO, parseDateString } from '@/lib/date-utils';
import { useIsOnline } from '@/lib/offline/connectivity';
import { syncBeforeServerAction } from '@/lib/offline/outbox';
import { OFFLINE_TITLE } from '@/components/shared/offline-gate';
import { generateReport } from '@/lib/report/generate-report';
import { adoptShareFile, clearShareFiles } from '@/lib/share-files';
import { supabase } from '@/lib/supabase';
import type { DetectedCluster } from '@/lib/supabase';
import { makeAccentStyles } from '@/lib/accent-styles';
import { useAccent } from '@/contexts/accent-context';

function fmtDate(d: string): string {
  return parseDateString(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  clusters: DetectedCluster[];
  appointmentId?: string;
  fromDate: string;
  toDate: string;
  /** The range as the patient picked it, for the top of the report. */
  rangeLabel?: string;
}

// Chunk 1 of the PDF report port — see generate-report.ts's header comment
// for exactly what's in Page 1 and what's deferred. This component itself
// is also scoped down from the web app's GenerateReportSection.tsx: no
// copy-as-markdown alternative. The patient picks a basic report (a summary
// of whatever they track, at most five sheets) or a comprehensive one, which
// carries the mind/body/cycle include options. Mechanic swap: the web app's
// auto-download anchor click -> expo-print's printToFileAsync followed by
// the native share sheet (expo-sharing), since there's no browser
// downloads folder on native to drop a file into.
export default function GenerateReportSection({ clusters, appointmentId, fromDate, toDate, rangeLabel }: Props) {
  const styles = useStyles();
  const accent = useAccent();
  const { user, profile } = useAuth();
  const online = useIsOnline();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInCount, setCheckInCount] = useState<number | null>(null);
  const [reportName, setReportName] = useState(profile?.report_display_name ?? '');
  const [includeMind, setIncludeMind] = useState(true);
  const [includeBody, setIncludeBody] = useState(profile?.body_tracking_enabled ?? false);
  const [includeCycle, setIncludeCycle] = useState(profile?.cycle_tracking_enabled ?? false);
  const [includeBodyDetail, setIncludeBodyDetail] = useState(false);
  // Basic is the default: a summary on at most five sheets. Comprehensive
  // lists every entry and offers the include options.
  const [reportVariant, setReportVariant] = useState<'basic' | 'comprehensive'>('basic');
  const comprehensive = reportVariant === 'comprehensive';

  useEffect(() => {
    if (!user) return;
    supabase
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('scheduled_at', localDayStartISO(fromDate))
      .lte('scheduled_at', localDayEndISO(toDate))
      // A failed count (offline) leaves it unknown rather than 0, which
      // would claim there are no check-ins in the period.
      .then(({ count, error }) => { if (!error) setCheckInCount(count ?? 0); });
  }, [user, fromDate, toDate]);

  async function handleGenerate() {
    if (!user || !profile) return;
    setGenerating(true);
    setError(null);
    setGenerated(false);
    try {
      // The report is built from the server's copy, so anything still
      // waiting to sync would be missing from it. Send it first.
      if (!(await syncBeforeServerAction())) {
        setError('Some entries are still syncing. Try again in a moment.');
        return;
      }
      // Remembered for next time, same as the web app — a clinician-facing
      // name is not something to retype every appointment.
      const trimmed = reportName.trim();
      if (trimmed !== (profile.report_display_name ?? '')) {
        await supabase.from('profiles').update({ report_display_name: trimmed || null }).eq('id', user.id);
      }

      const startedAt = Date.now();
      // The last report's PDF is not needed once a new one is on its way.
      clearShareFiles();
      const { uri: printedUri } = await generateReport({
        userId: user.id,
        userName: trimmed || profile.display_name || profile.email,
        dateFrom: fromDate,
        dateTo: toDate,
        rangeLabel,
        clusters,
        appointmentId,
        bodyTrackingEnabled: profile.body_tracking_enabled ?? false,
        reportVariant,
        // The basic report covers whatever is tracked; the include options
        // belong to the comprehensive one.
        ...(comprehensive
          ? { includeMind, includeBody, includeCycle, includeBodyDetail: includeBody && includeBodyDetail }
          : {
            includeMind: true,
            includeBody: profile.body_tracking_enabled ?? false,
            includeCycle: profile.cycle_tracking_enabled ?? false,
            includeBodyDetail: false,
          }),
      });
      // Counts and timing only, per analytics.ts's rule.
      trackReportGenerated(
        Math.round((parseDateString(toDate).getTime() - parseDateString(fromDate).getTime()) / 86_400_000) + 1,
        clusters.length,
        clusters.filter(c => c.flagged_for_report).length,
        { generationTimeMs: Date.now() - startedAt },
      );
      // Into the folder sign-out clears; expo-print leaves it in the cache.
      const uri = adoptShareFile(printedUri, `symetric_report_${toDate}.pdf`);
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
  const disabled = !online || generating || (comprehensive && !includeMind && !includeBody && !includeCycle);

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
        <IncludeToggle
          label="Basic report"
          hint="A summary: your main patterns, mind and body, on up to 5 pages."
          radio
          checked={!comprehensive}
          onToggle={() => setReportVariant('basic')}
        />
        <IncludeToggle
          label="Comprehensive report"
          hint="Every entry in full. Usually 15 to 20 pages."
          radio
          checked={comprehensive}
          onToggle={() => setReportVariant('comprehensive')}
        />
        {comprehensive && (
          <>
            <IncludeToggle label="Include mind check-ins" nested checked={includeMind} onToggle={() => setIncludeMind(v => !v)} />
            <IncludeToggle label="Include body check-ins" nested checked={includeBody} onToggle={() => setIncludeBody(v => !v)} />
            {/* Only meaningful with body included, so only offered then. */}
            {includeBody && (
              <IncludeToggle
                label="Include full detail"
                hint="Adds every pain and breathing description, in your own terms. Can add several pages."
                nested={2}
                checked={includeBodyDetail}
                onToggle={() => setIncludeBodyDetail(v => !v)}
              />
            )}
            <IncludeToggle label="Include cycle dates" nested checked={includeCycle} onToggle={() => setIncludeCycle(v => !v)} />
          </>
        )}
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
            <ActivityIndicator size="small" color={accent.text} />
            <Text style={styles.generateButtonText}>Generating…</Text>
          </View>
        ) : (
          <Text style={styles.generateButtonText}>{!online ? OFFLINE_TITLE : generated ? 'Generate PDF again' : 'Generate PDF'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function IncludeToggle({ label, hint, nested, radio, checked, onToggle }: {
  label: string;
  hint?: string;
  /** Indent: true or 1 for one level, 2 for two. */
  nested?: boolean | 1 | 2;
  /** One of a pair where exactly one is chosen (Basic / Comprehensive). */
  radio?: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        styles.includeRow,
        nested && styles.includeRowNested,
        nested === 2 && styles.includeRowNested2,
        pressed && { opacity: 0.7 },
      ]}>
      <View style={[styles.checkbox, radio && styles.radio, checked && styles.checkboxOn]}>
        {checked && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <View style={styles.includeText}>
        <Text style={styles.includeLabel}>{label}</Text>
        {hint && <Text style={styles.includeHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const useStyles = makeAccentStyles(b => ({
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
  checkboxOn: { backgroundColor: b.fill, borderColor: b.fill },
  checkboxTick: { fontSize: 13, color: b.onFill, fontWeight: '700' },
  radio: { borderRadius: 11 },
  includeRowNested: { marginLeft: 34, alignItems: 'flex-start' },
  includeRowNested2: { marginLeft: 68 },
  includeText: { flex: 1, gap: 2 },
  includeLabel: { fontSize: 15, color: '#e2e8f0' },
  includeHint: { fontSize: 12, color: '#6b7a99', lineHeight: 17 },
  patternCount: { fontSize: 13, color: '#6b7a99', marginBottom: 16 },
  statusText: { fontSize: 13, color: '#6b7a99', marginBottom: 12 },
  errorText: { fontSize: 13, color: '#f87171', marginBottom: 12 },
  successText: { fontSize: 13, color: b.text, marginBottom: 12 },
  generateButton: { width: '100%', padding: 13, backgroundColor: b.fill, borderRadius: 10, alignItems: 'center' },
  generateButtonDisabled: { backgroundColor: '#2d3748' },
  generateButtonText: { fontSize: 15, fontWeight: '600', color: b.onFill },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
