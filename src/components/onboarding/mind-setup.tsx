import { useState } from 'react';

import BaselineQuestionsStep from '@/components/onboarding/baseline-questions-step';
import CheckInPreferencesStep from '@/components/onboarding/check-in-preferences-step';
import CompletionStep from '@/components/onboarding/completion-step';
import DomainSelectionStep from '@/components/onboarding/domain-selection-step';
import { useAuth } from '@/contexts/auth-context';
import { trackOnboardingCompleted } from '@/lib/analytics';
import { DomainType, supabase } from '@/lib/supabase';
import { recordFirstCheckinsScheduledMilestone } from '@/lib/milestones';
import { ensureTodayCheckIns } from '@/lib/scheduler';

// Ported from the web app's MindSetup.tsx — runs on the Today tab once
// age/consent (Onboarding) is complete but check_in_settings hasn't been set
// up yet. Reuses the same four step components the old 5-step Onboarding
// wizard used; only the orchestration and final write changed (no more
// profiles.onboarding_complete/track_sleep here, that's already been set by
// Onboarding).

type MindSetupData = {
  activeDomains: DomainType[];
  baselines: Partial<Record<DomainType | 'sleep', number>>;
  checkInsPerDay: number;
  windowStart: string;
  windowEnd: string;
};

interface MindSetupProps {
  onSetupComplete: () => void;
}

export default function MindSetup({ onSetupComplete }: MindSetupProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<MindSetupData>({
    activeDomains: [],
    baselines: {},
    checkInsPerDay: 3,
    windowStart: '08:00',
    windowEnd: '22:00',
  });
  const { user, profile } = useAuth();

  const [startTime] = useState(() => Date.now());

  const updateData = (updates: Partial<MindSetupData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const nextStep = () => setCurrentStep(prev => prev + 1);
  // Clamped at 1 — DomainSelectionStep always renders a Back button, but there's
  // nothing to go back to (age/consent already completed and saved).
  const prevStep = () => setCurrentStep(prev => Math.max(1, prev - 1));

  const completeMindSetup = async () => {
    if (!user) throw new Error('No authenticated user found. Please sign in again.');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session has expired. Please sign in again.');

    const { error: settingsError } = await supabase.from('check_in_settings').upsert(
      {
        user_id: user.id,
        check_ins_per_day: data.checkInsPerDay,
        window_start: data.windowStart,
        window_end: data.windowEnd,
        active_domains: data.activeDomains,
      },
      { onConflict: 'user_id' },
    );
    if (settingsError) throw new Error(`Failed to save check-in settings: ${settingsError.message}`);

    const baselineInserts = (Object.entries(data.baselines) as [DomainType | 'sleep', number][])
      .filter(([domain, score]) => domain !== 'sleep' && score !== undefined && score !== null)
      .map(([domain, score]) => ({
        user_id: user.id,
        domain,
        baseline_score: score,
        source: 'onboarding' as const,
        is_current: true,
      }));

    if (baselineInserts.length > 0) {
      const { error: clearError } = await supabase.from('baselines').delete().eq('user_id', user.id).eq('source', 'onboarding');
      if (clearError) throw new Error(`Failed to save baselines: ${clearError.message}`);

      const { error: baselinesError } = await supabase.from('baselines').insert(baselineInserts);
      if (baselinesError) throw new Error(`Failed to save baselines: ${baselinesError.message}`);
    }

    const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    await ensureTodayCheckIns(user.id, timezone);
    await recordFirstCheckinsScheduledMilestone(user.id);

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    trackOnboardingCompleted(durationSeconds, data.activeDomains.length);

    onSetupComplete();
  };

  if (currentStep === 1) {
    return (
      <DomainSelectionStep
        selectedDomains={data.activeDomains}
        onUpdate={domains => updateData({ activeDomains: domains })}
        onNext={nextStep}
        onBack={prevStep}
      />
    );
  }

  if (currentStep === 2) {
    return (
      <BaselineQuestionsStep
        domains={data.activeDomains}
        baselines={data.baselines}
        onUpdate={baselines => updateData({ baselines })}
        onNext={nextStep}
        onBack={prevStep}
        trackSleep
      />
    );
  }

  if (currentStep === 3) {
    return (
      <CheckInPreferencesStep
        checkInsPerDay={data.checkInsPerDay}
        windowStart={data.windowStart}
        windowEnd={data.windowEnd}
        onUpdate={updates => updateData(updates)}
        onNext={nextStep}
        onBack={prevStep}
      />
    );
  }

  return (
    <CompletionStep
      onComplete={completeMindSetup}
      // Must match ensureTodayCheckIns' actual skip condition (now > windowEndUTC,
      // i.e. the window has fully closed).
      windowDeferred={hoursRemainingInWindow(data.windowEnd) < 0}
    />
  );
}

// ── Scheduling helpers ────────────────────────────────────────────────────────

function hoursRemainingInWindow(windowEnd: string): number {
  const [endHour, endMin] = windowEnd.split(':').map(Number);
  const windowEndMinutes = endHour * 60 + endMin;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return (windowEndMinutes - nowMinutes) / 60;
}
