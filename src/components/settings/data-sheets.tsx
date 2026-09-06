import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SheetButton, SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import { useAuth } from '@/contexts/auth-context';
import { median, round2, stddevPop } from '@/lib/baseline-stats';
import { buildCsvExport, buildJsonExport, type ExportFile } from '@/lib/data-export';
import { resolveActiveDomains } from '@/lib/domains';
import { supabase } from '@/lib/supabase';

// The "Your data" and "Account" sheets, ported from the web app's
// sheets/SettingsSheets.tsx (ExportSheet), DeleteRangeSheet.tsx,
// DeleteAllSheet.tsx and ResetBaselineSheet.tsx. The queries are unchanged;
// what differs is how a file reaches the user and how a date is picked.

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Writes to the cache directory and opens the share sheet — a phone has no
 *  downloads folder for the web version's downloadBlob() to target. Same route
 *  the PDF report already takes in prepare/generate-report-section.tsx. */
async function shareExportFile(file: ExportFile): Promise<void> {
  const target = new File(Paths.cache, file.name);
  if (target.exists) target.delete();
  target.create();
  target.write(file.content);
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, { mimeType: file.mimeType, UTI: file.mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text' });
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [fmt, setFmt] = useState<'CSV' | 'JSON'>('CSV');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setError(null);
    try {
      if (fmt === 'CSV') {
        // Four files, as on the web. The share sheet can only take one at a
        // time, so they go one after another rather than as a single archive.
        for (const file of await buildCsvExport(user.id)) await shareExportFile(file);
      } else {
        await shareExportFile(await buildJsonExport(user.id));
      }
    } catch (e) {
      console.error('[ExportSheet] export failed:', e);
      setError("Couldn't build the export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SheetShell title="Export my data" description="Your data. Take it anywhere." onClose={onClose}>
      <View style={styles.segmented}>
        {(['CSV', 'JSON'] as const).map(f => (
          <Pressable key={f} onPress={() => setFmt(f)} style={[styles.segment, fmt === f && styles.segmentActive]}>
            <Text style={[styles.segmentText, fmt === f && styles.segmentTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {fmt === 'CSV'
          ? 'Four CSV files — check-ins, sleep logs, patterns and markers. They are shared one after another.'
          : 'A single JSON file with all your data.'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <SheetButton label={exporting ? 'Exporting...' : `Export as ${fmt}`} onPress={handleExport} disabled={exporting} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Delete a date range ──────────────────────────────────────────────────────

function DateField({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date) => void }) {
  const [picking, setPicking] = useState(false);
  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setPicking(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(selected);
  };
  return (
    <View style={styles.dateField}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [styles.input, pressed && styles.pressed]}>
        <Text style={[styles.inputText, !value && styles.inputPlaceholder]}>{value ? displayDate(value) : 'Choose a date'}</Text>
      </Pressable>
      {picking && (
        <DateTimePicker value={value ?? new Date()} mode="date" maximumDate={new Date()} onChange={handleChange} />
      )}
      {picking && Platform.OS === 'ios' && (
        <Pressable onPress={() => setPicking(false)}><Text style={styles.done}>Done</Text></Pressable>
      )}
    </View>
  );
}

export function DeleteRangeSheet({ userId, onClose, onDeleted }: {
  userId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canProceed = from !== null && to !== null && from <= to;

  const handleConfirmDelete = async () => {
    if (!from || !to) return;
    setDeleting(true);
    setError(null);
    const fromStr = fmtDate(from);
    const toStr = fmtDate(to);
    const results = await Promise.all([
      supabase.from('check_ins').delete().eq('user_id', userId)
        .gte('scheduled_at', new Date(`${fromStr}T00:00:00`).toISOString())
        .lte('scheduled_at', new Date(`${toStr}T23:59:59`).toISOString()),
      supabase.from('sleep_logs').delete().eq('user_id', userId).gte('log_date', fromStr).lte('log_date', toStr),
    ]);
    setDeleting(false);
    if (results.some(r => r.error)) {
      console.error('[DeleteRangeSheet] delete failed:', results.map(r => r.error));
      setError("Couldn't delete that range. Please try again.");
      return;
    }
    onDeleted();
    onClose();
  };

  if (step === 'confirm' && from && to) {
    return (
      <SheetShell
        title="Delete this period?"
        description={`Every check-in and sleep log from ${displayDate(from)} to ${displayDate(to)} will be removed. This cannot be undone.`}
        onClose={onClose}>
        {error && <Text style={styles.error}>{error}</Text>}
        <SheetButton danger label={deleting ? 'Deleting...' : 'Delete this period'} onPress={handleConfirmDelete} disabled={deleting} />
        <SheetCancel onPress={() => setStep('pick')} label="Back" />
      </SheetShell>
    );
  }

  return (
    <SheetShell title="Delete a date range" description="Remove a specific period from your record." onClose={onClose}>
      <View style={styles.dateRow}>
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </View>
      {from && to && from > to && <Text style={styles.error}>The start date needs to come first.</Text>}
      <SheetButton label="Continue" onPress={() => setStep('confirm')} disabled={!canProceed} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Delete everything ────────────────────────────────────────────────────────

export function DeleteAllSheet({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const isConfirmed = confirmText === 'DELETE';

  const handleDeleteAll = async () => {
    if (!user || !isConfirmed) return;
    setDeleting(true);
    await Promise.all([
      supabase.from('check_ins').delete().eq('user_id', user.id),
      supabase.from('sleep_logs').delete().eq('user_id', user.id),
      supabase.from('detected_clusters').delete().eq('user_id', user.id),
      supabase.from('context_tags').delete().eq('user_id', user.id),
      supabase.from('baselines').delete().eq('user_id', user.id),
      supabase.from('check_in_settings').delete().eq('user_id', user.id),
    ]);
    await supabase.from('profiles').delete().eq('id', user.id);
    await signOut();
  };

  return (
    <SheetShell
      title="Delete all data and account"
      description="Every check-in, sleep log, pattern and baseline is removed, along with your account. This is permanent and cannot be undone."
      onClose={onClose}>
      <Text style={styles.fieldLabel}>TYPE DELETE TO CONFIRM</Text>
      <TextInput
        value={confirmText}
        onChangeText={setConfirmText}
        placeholder="DELETE"
        placeholderTextColor="#4a5568"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting}
        style={styles.textInput}
      />
      <SheetButton danger label={deleting ? 'Deleting...' : 'Delete everything'} onPress={handleDeleteAll} disabled={!isConfirmed || deleting} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Reset baselines ──────────────────────────────────────────────────────────

interface CurrentBaseline { domain: string; baseline_score: number; source: string; set_at: string }

export function ResetBaselineSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [current, setCurrent] = useState<CurrentBaseline[] | null>(null);

  useEffect(() => {
    supabase
      .from('baselines')
      .select('domain, baseline_score, source, set_at')
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('domain')
      .then(({ data }) => setCurrent((data as CurrentBaseline[]) ?? []));
  }, [userId]);

  const handleReset = async () => {
    setState('loading');

    const { data: settings } = await supabase
      .from('check_in_settings').select('active_domains, quick_checkin_domains')
      .eq('user_id', userId).maybeSingle();

    const activeDomains = resolveActiveDomains(settings);
    if (activeDomains.length === 0) { setState('done'); setTimeout(onClose, 1400); return; }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: checkIns } = await supabase
      .from('check_ins')
      .select('scheduled_date, mood, energy, anxiety, concentration, irritability, social_battery, sensory_sensitivity, motivation')
      .eq('user_id', userId).eq('status', 'completed')
      .gte('scheduled_date', fmtDate(thirtyDaysAgo));

    if (!checkIns || checkIns.length === 0) { setState('done'); setTimeout(onClose, 1400); return; }

    const now = new Date().toISOString();

    // Append-only, per domain: flip the current row, insert the new one. Never
    // an in-place update — the baseline history is what pattern evolution reads.
    for (const domain of activeDomains) {
      const vals = checkIns
        .map(ci => (ci as Record<string, unknown>)[domain] as number | null)
        .filter((v): v is number => v !== null && v !== undefined);

      await supabase.from('baselines').update({ is_current: false })
        .eq('user_id', userId).eq('domain', domain).eq('is_current', true);

      await supabase.from('baselines').insert({
        user_id: userId,
        domain,
        baseline_score: vals.length > 0 ? round2(median(vals)) : 5,
        baseline_variability: vals.length > 0 ? round2(stddevPop(vals)) : 0,
        source: 'manual_reset',
        set_at: now,
        is_current: true,
      });
    }

    setState('done');
    setTimeout(onClose, 1400);
  };

  return (
    <SheetShell
      title="Reset baselines"
      description="Recalculates what counts as normal for you from your last 30 days of check-ins. Your check-ins themselves are untouched."
      onClose={onClose}>
      {current && current.length > 0 && (
        <View style={styles.baselineList}>
          {current.map(b => (
            <View key={b.domain} style={styles.baselineRow}>
              <Text style={styles.baselineDomain}>{b.domain.replace('_', ' ')}</Text>
              <Text style={styles.baselineScore}>{b.baseline_score}</Text>
            </View>
          ))}
        </View>
      )}
      {state === 'done'
        ? <Text style={styles.hint}>Baselines updated.</Text>
        : <SheetButton label={state === 'loading' ? 'Recalculating...' : 'Recalculate baselines'} onPress={handleReset} disabled={state === 'loading'} />}
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, color: '#f87171', marginBottom: 12 },
  hint: { fontSize: 12, color: '#8b90a4', lineHeight: 18, marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: '#4a5568', letterSpacing: 0.6, marginBottom: 6 },
  done: { fontSize: 14, color: '#818cf8', textAlign: 'center', paddingVertical: 8 },

  segmented: {
    flexDirection: 'row', backgroundColor: '#0f1117', borderWidth: 1, borderColor: '#252b3b',
    borderRadius: 8, padding: 2, gap: 2, marginBottom: 16,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  segmentActive: { backgroundColor: '#1e2333' },
  segmentText: { fontSize: 14, fontWeight: '500', color: '#8b90a4' },
  segmentTextActive: { color: '#e2e4ec' },

  dateRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  dateField: { flex: 1 },
  input: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  inputText: { fontSize: 15, color: '#e2e8f0' },
  inputPlaceholder: { color: '#4a5568' },

  textInput: {
    backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: '#e2e8f0', marginBottom: 20,
  },

  baselineList: { marginBottom: 20, gap: 6 },
  baselineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  baselineDomain: { fontSize: 13, color: '#8b90a4', textTransform: 'capitalize' },
  baselineScore: { fontSize: 13, color: '#e2e4ec' },
});
