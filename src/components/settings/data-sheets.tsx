import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { SheetButton, SheetCancel, SheetShell } from '@/components/settings/settings-primitives';
import { PlatformPicker } from '@/components/shared/platform-picker';
import { useAuth } from '@/contexts/auth-context';
import { median, round2, stddevPop } from '@/lib/baseline-stats';
import { buildCsvExport, buildJsonExport, type ExportFile } from '@/lib/data-export';
import { dateToString } from '@/lib/date-utils';
import { resolveActiveDomains } from '@/lib/domains';
import { clearCache } from '@/lib/offline/cache';
import { useIsOnline } from '@/lib/offline/connectivity';
import { clearOutbox, syncBeforeServerAction } from '@/lib/offline/outbox';
import { clearShareFiles, writeShareFile } from '@/lib/share-files';
import { OFFLINE_TITLE } from '@/components/shared/offline-gate';
import { supabase } from '@/lib/supabase';
import { makeAccentStyles } from '@/lib/accent-styles';

// The "Your data" and "Account" sheets, ported from the web app's
// sheets/SettingsSheets.tsx (ExportSheet), DeleteRangeSheet.tsx,
// DeleteAllSheet.tsx and ResetBaselineSheet.tsx. The queries are unchanged;
// what differs is how a file reaches the user and how a date is picked.

// The range a delete covers: built from local date fields, not Intl's en-CA
// pattern, so what gets deleted can't depend on the device's locale data.
const fmtDate = dateToString;

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Writes to the cache directory and opens the share sheet — a phone has no
 *  downloads folder for the web version's downloadBlob() to target. Same route
 *  the PDF report already takes in prepare/generate-report-section.tsx. */
async function shareExportFile(file: ExportFile): Promise<void> {
  const uri = writeShareFile(file.name, file.content);
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: file.mimeType, UTI: file.mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text' });
  }
}

/** Between two share sheets. shareAsync can't say whether the last one was
 *  cancelled, so without asking, cancelling the first of six files still
 *  opened the other five. */
function confirmNextFile(next: number, total: number): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      `File ${next} of ${total}`,
      'Share the next file of your export?',
      [
        { text: 'Stop', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Share next', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { user } = useAuth();
  const online = useIsOnline();
  const [fmt, setFmt] = useState<'CSV' | 'JSON'>('CSV');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setError(null);
    try {
      // The export reads the server's copy; unsent entries would be missing.
      if (!(await syncBeforeServerAction())) {
        setError('Some entries are still syncing. Try again in a moment.');
        return;
      }
      // Last export's files are not needed once a new one is on its way.
      clearShareFiles();
      if (fmt === 'CSV') {
        // Four files as on the web, plus body files when there is body data.
        // The share sheet can only take one at a time, so they go one after
        // another rather than as a single archive.
        const files = await buildCsvExport(user.id);
        for (let i = 0; i < files.length; i++) {
          if (i > 0 && !(await confirmNextFile(i + 1, files.length))) break;
          await shareExportFile(files[i]);
        }
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
          ? 'CSV files for check-ins, sleep logs, patterns and markers, plus body check-ins and events if you track them. They are shared one after another.'
          : 'A single JSON file with everything you have recorded, including body tracking and appointments.'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <SheetButton
        label={!online ? OFFLINE_TITLE : exporting ? 'Exporting...' : `Export as ${fmt}`}
        onPress={handleExport} disabled={!online || exporting} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Delete a date range ──────────────────────────────────────────────────────

function DateField({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date) => void }) {
  const styles = useStyles();
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.dateField}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [styles.input, pressed && styles.pressed]}>
        <Text style={[styles.inputText, !value && styles.inputPlaceholder]}>{value ? displayDate(value) : 'Choose a date'}</Text>
      </Pressable>
      {picking && (
        <PlatformPicker
          variant="plain"
          mode="date"
          value={value ?? new Date()}
          maximumDate={new Date()}
          onPick={onChange}
          onClose={() => setPicking(false)}
        />
      )}
    </View>
  );
}

export function DeleteRangeSheet({ userId, onClose, onDeleted }: {
  userId: string; onClose: () => void; onDeleted: () => void;
}) {
  const styles = useStyles();
  const online = useIsOnline();
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
    // An entry still waiting to sync would arrive after the delete and put
    // back part of the period the person just removed. Send it first.
    if (!(await syncBeforeServerAction())) {
      setDeleting(false);
      setError('Some entries are still syncing. Try again in a moment.');
      return;
    }
    const fromStr = fmtDate(from);
    const toStr = fmtDate(to);
    const results = await Promise.all([
      supabase.from('check_ins').delete().eq('user_id', userId)
        .gte('scheduled_at', new Date(`${fromStr}T00:00:00`).toISOString())
        .lte('scheduled_at', new Date(`${toStr}T23:59:59`).toISOString()),
      supabase.from('sleep_logs').delete().eq('user_id', userId).gte('log_date', fromStr).lte('log_date', toStr),
      // Pain and event sites cascade from these.
      supabase.from('body_checkins').delete().eq('user_id', userId).gte('entry_date', fromStr).lte('entry_date', toStr),
      supabase.from('body_events').delete().eq('user_id', userId).gte('event_date', fromStr).lte('event_date', toStr),
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
        description={`Every check-in, body check-in, body event and sleep log from ${displayDate(from)} to ${displayDate(to)} will be removed. This cannot be undone.`}
        onClose={onClose}>
        {error && <Text style={styles.error}>{error}</Text>}
        <SheetButton danger
          label={!online ? OFFLINE_TITLE : deleting ? 'Deleting...' : 'Delete this period'}
          onPress={handleConfirmDelete} disabled={!online || deleting} />
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
  const styles = useStyles();
  const { user, signOut } = useAuth();
  const online = useIsOnline();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isConfirmed = confirmText === 'DELETE';

  // One server-side call that deletes the login itself, and every table
  // cascades from it. Deleting row by row from here, as before, could only
  // reach tables keyed to profiles: body tracking, push tokens and the login
  // (with the email address) survived an account the user was told had gone.
  // The user is only signed out once the server confirms the delete.
  const handleDeleteAll = async () => {
    if (!user || !isConfirmed) return;
    setDeleting(true);
    setDeleteError(null);

    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      console.error('[DeleteAllSheet] delete-account failed:', error);
      setDeleteError('Your account could not be deleted, so nothing has been removed and you have not been signed out. Try again, or contact support.');
      setDeleting(false);
      return;
    }

    // Nothing left on the server for queued entries to reach, and nothing on
    // this phone should outlive the account.
    await Promise.all([clearOutbox(user.id), clearCache(user.id)]);
    await signOut();
  };

  return (
    <SheetShell
      title="Delete all data and account"
      description="Everything you have recorded, mind, body, cycle, markers and appointments, is removed along with your account and sign-in. This is permanent and cannot be undone."
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
      {deleteError && <Text style={styles.error}>{deleteError}</Text>}
      <SheetButton danger
        label={!online ? OFFLINE_TITLE : deleting ? 'Deleting...' : 'Delete everything'}
        onPress={handleDeleteAll} disabled={!online || !isConfirmed || deleting} />
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

// ── Reset baselines ──────────────────────────────────────────────────────────

interface CurrentBaseline { domain: string; baseline_score: number; source: string; set_at: string }

export function ResetBaselineSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const styles = useStyles();
  const online = useIsOnline();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
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

    // Append-only, per domain: insert the new row, then retire the old ones.
    // Never an in-place update — the baseline history is what pattern evolution
    // reads. Insert first: retiring first meant a rejected insert left the
    // domain with no current baseline at all, while the sheet said "updated".
    let failed = false;
    for (const domain of activeDomains) {
      const vals = checkIns
        .map(ci => (ci as Record<string, unknown>)[domain] as number | null)
        .filter((v): v is number => v !== null && v !== undefined);

      const { data: inserted, error: insertError } = await supabase.from('baselines').insert({
        user_id: userId,
        domain,
        baseline_score: vals.length > 0 ? round2(median(vals)) : 5,
        baseline_variability: vals.length > 0 ? round2(stddevPop(vals)) : 0,
        source: 'manual_reset',
        set_at: now,
        is_current: true,
      }).select('id').single();
      if (insertError || !inserted) { failed = true; continue; }

      const { error: retireError } = await supabase.from('baselines').update({ is_current: false })
        .eq('user_id', userId).eq('domain', domain).eq('is_current', true).neq('id', inserted.id);
      if (retireError) failed = true;
    }

    if (failed) { setState('error'); return; }
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
      {state === 'error' && (
        <Text style={styles.error}>Some baselines could not be updated. Your previous ones are still in use. Try again.</Text>
      )}
      {state === 'done'
        ? <Text style={styles.hint}>Baselines updated.</Text>
        : <SheetButton
            label={!online ? OFFLINE_TITLE : state === 'loading' ? 'Recalculating...' : 'Recalculate baselines'}
            onPress={handleReset} disabled={!online || state === 'loading'} />}
      <SheetCancel onPress={onClose} />
    </SheetShell>
  );
}

const useStyles = makeAccentStyles(b => ({
  pressed: { opacity: 0.7 },
  error: { fontSize: 12, color: '#f87171', marginBottom: 12, lineHeight: 18 },
  hint: { fontSize: 12, color: '#8b90a4', lineHeight: 18, marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: '#4a5568', letterSpacing: 0.6, marginBottom: 6 },

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
}));
