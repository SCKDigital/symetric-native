import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DomainType } from '@/lib/supabase';

interface BaselineQuestionsStepProps {
  domains: DomainType[];
  baselines: Partial<Record<DomainType | 'sleep', number>>;
  onUpdate: (baselines: Partial<Record<DomainType | 'sleep', number>>) => void;
  onNext: () => void;
  onBack: () => void;
  trackSleep?: boolean;
}

const sleepQuestion = {
  domain: 'sleep' as const,
  question: 'In the last 14 days, how would you describe your typical sleep quality?',
  options: [
    { value: 1, label: 'Very poor - rarely felt rested' },
    { value: 2, label: 'Poor - often woke unrefreshed' },
    { value: 3, label: 'Okay - some nights better, some worse' },
    { value: 4, label: 'Well - usually felt rested' },
    { value: 5, label: 'Very well - consistently refreshed' },
  ],
};

const questions: {
  domain: DomainType;
  question: string;
  options: { value: number; label: string }[];
}[] = [
  {
    domain: 'mood',
    question: 'In the last 14 days, how would you describe your general emotional tone?',
    options: [
      { value: 2, label: 'Very low - my spirits have felt particularly down' },
      { value: 4, label: "Lower than I'd like - not my best stretch" },
      { value: 5, label: 'About average for me' },
      { value: 7, label: 'Generally okay - more good moments than not' },
      { value: 9, label: 'High - my spirits have felt particularly lifted' },
    ],
  },
  {
    domain: 'energy',
    question: 'In the last 14 days, how would you describe your overall energy level?',
    options: [
      { value: 2, label: "Very low - I've felt exhausted or drained most of the time" },
      { value: 4, label: "Lower than usual - less fuel than I'd like" },
      { value: 5, label: 'About average for me' },
      { value: 7, label: 'Generally good - more energised than not' },
      { value: 9, label: "Very high - I've felt unusually activated or driven" },
    ],
  },
  {
    domain: 'anxiety',
    question: 'In the last 14 days, how would you describe your general level of tension or worry?',
    options: [
      { value: 2, label: 'Very calm - little to no tension or worry' },
      { value: 4, label: 'Mostly settled - occasional unease but nothing persistent' },
      { value: 5, label: 'About average for me' },
      { value: 7, label: "More tense than I'd like - worry has been present most days" },
      { value: 9, label: 'Very high - tension or anxiety has been hard to manage' },
    ],
  },
  {
    domain: 'concentration',
    question: 'In the last 14 days, how easily have you been able to focus and follow through on things?',
    options: [
      { value: 2, label: 'Very difficult - focus has felt almost impossible' },
      { value: 4, label: "Harder than usual - I've been easily distracted or lost" },
      { value: 5, label: 'About average for me' },
      { value: 7, label: 'Generally okay - able to follow through on most things' },
      { value: 9, label: 'Very sharp - focus has felt unusually clear and sustained' },
    ],
  },
  {
    domain: 'irritability',
    question: 'In the last 14 days, how reactive or on-edge have you generally felt?',
    options: [
      { value: 2, label: 'Very settled - almost nothing has felt grating or overwhelming' },
      { value: 4, label: 'Mostly calm - occasional reactivity but nothing persistent' },
      { value: 5, label: 'About average for me' },
      { value: 7, label: "More reactive than I'd like - things have been getting to me" },
      { value: 9, label: "Very high - I've felt consistently on edge or easily triggered" },
    ],
  },
  {
    domain: 'social_battery',
    question: 'In the last 14 days, how much have you generally felt able to engage with other people?',
    options: [
      { value: 2, label: 'Very depleted - social interaction has felt almost impossible' },
      { value: 4, label: "Lower than usual - I've needed more space than normal" },
      { value: 5, label: 'About average for me' },
      { value: 7, label: 'Generally okay - social engagement has felt manageable' },
      { value: 9, label: "Very high - I've felt unusually sociable or energised by others" },
    ],
  },
  {
    domain: 'sensory_sensitivity',
    question: 'In the last 14 days, how much have sounds, lights, textures, or other sensory input been affecting you?',
    options: [
      { value: 2, label: 'Very low - sensory input has barely registered' },
      { value: 4, label: 'Lower than usual - less affected than normal' },
      { value: 5, label: 'About average for me' },
      { value: 7, label: "More sensitive than I'd like - sensory input has been noticeable" },
      { value: 9, label: 'Very high - sounds, lights, or textures have felt overwhelming' },
    ],
  },
  {
    domain: 'motivation',
    question: 'In the last 14 days, how would you describe your drive and sense of initiative?',
    options: [
      { value: 2, label: 'Very low - starting or caring about things has felt almost impossible' },
      { value: 4, label: 'Lower than usual - getting going has been harder than normal' },
      { value: 5, label: 'About average for me' },
      { value: 7, label: "Generally good - I've felt reasonably driven and purposeful" },
      { value: 9, label: "Very high - I've felt unusually motivated and directed" },
    ],
  },
];

// Nearest labelled anchor for a raw 2–9 slider value
function nearestLabel(value: number, options: { value: number; label: string }[]): string {
  const closest = options.reduce((prev, curr) => (Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev));
  return closest.label;
}

// Ported from the web app's BaselineQuestionsStep.tsx. Same question copy,
// same per-question flow (one at a time, no back-tracking within a question
// other than the Back button). Mechanic swap: <input type="range"> has no RN
// equivalent, so this uses @react-native-community/slider.
export default function BaselineQuestionsStep({
  domains,
  baselines,
  onUpdate,
  onNext,
  onBack,
  trackSleep = false,
}: BaselineQuestionsStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const domainQuestions = questions.filter(q => domains.includes(q.domain));
  const activeQuestions: { domain: DomainType | 'sleep'; question: string; options: { value: number; label: string }[] }[] = [
    ...domainQuestions,
    ...(trackSleep ? [sleepQuestion] : []),
  ];
  const currentQuestion = activeQuestions[currentIndex];

  const isSleep = currentQuestion.domain === 'sleep';
  const sliderMin = isSleep ? 1 : 2;
  const sliderMax = isSleep ? 5 : 9;
  const defaultValue = isSleep ? 3 : 5;

  // Default slider to the middle option if not yet answered
  const currentValue = baselines[currentQuestion.domain] ?? defaultValue;

  // Sync default into baselines state so Next is enabled on first render
  useEffect(() => {
    if (baselines[currentQuestion.domain] === undefined) {
      onUpdate({ ...baselines, [currentQuestion.domain]: defaultValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const handleSliderChange = (value: number) => {
    onUpdate({ ...baselines, [currentQuestion.domain]: value });
  };

  const handleNext = () => {
    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onNext();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      onBack();
    }
  };

  const currentAnswered = baselines[currentQuestion.domain] !== undefined;
  const isLast = currentIndex === activeQuestions.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {currentIndex === 0 && (
          <View style={styles.intro}>
            <Text style={styles.heading}>Baseline questions</Text>
            <Text style={styles.introBody}>
              Before you start, we’d like a rough sense of how things have been lately. Think about the last 14
              days - not your best or worst moments, just the general shape of things. This gives Symetric a
              starting reference point. It will refine itself as you go.
            </Text>
          </View>
        )}

        <View style={styles.questionBlock}>
          <Text style={styles.progress}>
            {currentIndex + 1} of {activeQuestions.length}
          </Text>
          <Text style={styles.question}>{currentQuestion.question}</Text>

          <Slider
            style={styles.slider}
            minimumValue={sliderMin}
            maximumValue={sliderMax}
            step={1}
            value={currentValue}
            onValueChange={handleSliderChange}
            minimumTrackTintColor="#818cf8"
            maximumTrackTintColor="#2d3748"
            thumbTintColor="#818cf8"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>{sliderMin}</Text>
            <Text style={styles.sliderLabelText}>{sliderMax}</Text>
          </View>

          <View style={styles.answerBox}>
            <Text style={styles.answerText}>
              <Text style={styles.answerValue}>{currentValue}  </Text>
              {nearestLabel(currentValue, currentQuestion.options)}
            </Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Pressable onPress={handleBack} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={handleNext}
            disabled={!currentAnswered}
            style={({ pressed }) => [styles.nextButtonFlex, pressed && currentAnswered && styles.pressed]}>
            <Text style={[styles.nextButton, !currentAnswered && styles.nextButtonDisabled]}>{isLast ? 'Continue' : 'Next'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117' },
  content: { maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
  intro: { marginBottom: 32 },
  heading: { fontSize: 24, fontWeight: '300', color: '#e2e8f0', marginBottom: 16 },
  introBody: { fontSize: 15, color: '#cbd5e1', lineHeight: 24 },
  questionBlock: { marginBottom: 32 },
  progress: { fontSize: 13, color: '#94a3b8', marginBottom: 16 },
  question: { fontSize: 17, color: '#e2e8f0', marginBottom: 28, lineHeight: 24 },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, marginBottom: 20 },
  sliderLabelText: { fontSize: 12, color: '#64748b' },
  answerBox: { padding: 16, backgroundColor: '#1a1d28', borderWidth: 1, borderColor: '#334155', borderRadius: 10 },
  answerText: { fontSize: 14, color: '#cbd5e1', lineHeight: 21 },
  answerValue: { color: '#818cf8', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  backText: { fontSize: 15, color: '#94a3b8', paddingVertical: 12 },
  nextButtonFlex: { flex: 1 },
  nextButton: { textAlign: 'center', paddingVertical: 12, backgroundColor: '#334155', color: '#e2e8f0', borderRadius: 10, fontSize: 15, fontWeight: '600', overflow: 'hidden' },
  nextButtonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
