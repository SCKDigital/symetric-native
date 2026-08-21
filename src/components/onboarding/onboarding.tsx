import { useEffect, useRef, useState } from 'react';

import AgeVerificationStep from '@/components/onboarding/age-verification-step';
import BodyCycleConsentStep from '@/components/onboarding/body-cycle-consent-step';
import MindConsentStep from '@/components/onboarding/mind-consent-step';
import { useAuth } from '@/contexts/auth-context';
import { trackOnboardingAbandoned, trackOnboardingStarted, trackOnboardingStepCompleted } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export type OnboardingData = {
  dateOfBirth: string;
  ageConfirmed: boolean;
  mindNotHealthServiceAck: boolean;
  mindDataConsent: boolean;
  bodyInterested: boolean;
  bodyConsent: boolean;
  cycleInterested: boolean;
  cycleConsent: boolean;
};

// Ported from the web app's Onboarding.tsx — same 3-step gate, same
// record-consent edge function call to finalize (unchanged: it's a plain
// fetch under the hood, no browser API involved). Domain selection, baseline
// questions, and check-in scheduling are a separate flow (MindSetup, deferred
// to the Today tab after this completes) — not part of this gate, same as
// the web app.
//
// Step map:
// 1 AgeVerification — DOB + 18+ confirmation, hard-blocks under 18
// 2 MindConsent — disclosure + data-collection consent, both required
// 3 BodyCycleConsent — independent yes/no + conditional consent for Body and Cycle;
//   also performs the final save (sets profiles.onboarding_complete=true).

const STEP_NAMES: Record<number, string> = {
  1: 'age_verification',
  2: 'mind_consent',
  3: 'body_cycle_consent',
};

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    dateOfBirth: '',
    ageConfirmed: false,
    mindNotHealthServiceAck: false,
    mindDataConsent: false,
    bodyInterested: false,
    bodyConsent: false,
    cycleInterested: false,
    cycleConsent: false,
  });
  const { user, refreshProfile } = useAuth();

  const completedRef = useRef(false);
  const currentStepRef = useRef(currentStep);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    trackOnboardingStarted();
    return () => {
      if (!completedRef.current) {
        const step = currentStepRef.current;
        trackOnboardingAbandoned(step, STEP_NAMES[step] ?? `step_${step}`);
      }
    };
  }, []);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    const step = currentStepRef.current;
    trackOnboardingStepCompleted(step, STEP_NAMES[step] ?? `step_${step}`);
    setCurrentStep(prev => prev + 1);
  };
  const prevStep = () => setCurrentStep(prev => prev - 1);

  const completeOnboarding = async () => {
    if (!user) throw new Error('No authenticated user found. Please sign in again.');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session has expired. Please sign in again.');

    // Routed through an edge function (rather than a direct profiles.update)
    // so the server can stamp consent_ip_address/consent_user_agent from the
    // request itself — a client-supplied IP can't be trusted, and this is the
    // only way to record it without adding a UI step.
    const { error: consentError } = await supabase.functions.invoke('record-consent', {
      body: {
        date_of_birth: data.dateOfBirth,
        age_confirmed_18: data.ageConfirmed,
        mind_not_health_service_ack: data.mindNotHealthServiceAck,
        mind_data_consent: data.mindDataConsent,
        body_tracking_enabled: data.bodyInterested,
        cycle_tracking_enabled: data.cycleInterested,
      },
    });

    if (consentError) {
      let message = consentError.message;
      try {
        const body = await (consentError as { context: Response }).context.json();
        message = body?.error ?? message;
      } catch {
        // fall back to consentError.message
      }
      throw new Error(`Failed to save your answers: ${message}`);
    }

    completedRef.current = true;
    trackOnboardingStepCompleted(3, STEP_NAMES[3]);

    await refreshProfile();
  };

  if (currentStep === 1) {
    return (
      <AgeVerificationStep
        dateOfBirth={data.dateOfBirth}
        ageConfirmed={data.ageConfirmed}
        onUpdate={updates => updateData(updates)}
        onNext={nextStep}
      />
    );
  }

  if (currentStep === 2) {
    return (
      <MindConsentStep
        mindNotHealthServiceAck={data.mindNotHealthServiceAck}
        mindDataConsent={data.mindDataConsent}
        onUpdate={updates => updateData(updates)}
        onNext={nextStep}
        onBack={prevStep}
      />
    );
  }

  return (
    <BodyCycleConsentStep
      bodyInterested={data.bodyInterested}
      bodyConsent={data.bodyConsent}
      cycleInterested={data.cycleInterested}
      cycleConsent={data.cycleConsent}
      onUpdate={updates => updateData(updates)}
      onNext={completeOnboarding}
      onBack={prevStep}
    />
  );
}
