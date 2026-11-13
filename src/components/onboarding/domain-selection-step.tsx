import { FooterRow, SelectTile, SetupScreen, SuggestRow, TileGrid, Note } from '@/components/setup/setup-kit';
import { DOMAIN_ORDER, getDomainColor } from '@/lib/domains';
import { DomainType } from '@/lib/supabase';

interface DomainSelectionStepProps {
  selectedDomains: DomainType[];
  onUpdate: (domains: DomainType[]) => void;
  onNext: () => void;
  onClose: () => void;
  /** e.g. "Step 1 of 3". */
  stepLabel: string;
  progress: number;
  /** A save failure from the caller. */
  error?: string | null;
  saving?: boolean;
}

const MIN_DOMAINS = 2;

/** The three the old copy recommended in a sentence; now a button. */
const SUGGESTED: DomainType[] = ['mood', 'energy', 'anxiety'];

/**
 * Short enough for a half-width tile. The full sentences in DOMAIN_COPY stay
 * for Settings and the check-in form.
 */
const TILE_COPY: Record<DomainType, { label: string; description: string }> = {
  anxiety: { label: 'Anxiety', description: 'Tension, worry or unease' },
  concentration: { label: 'Concentration', description: 'How easy it is to focus' },
  energy: { label: 'Energy', description: 'How much fuel you have' },
  irritability: { label: 'Irritability', description: 'How on-edge you feel' },
  mood: { label: 'Mood', description: 'Your overall emotional tone' },
  motivation: { label: 'Motivation', description: 'Drive to do things' },
  sensory_sensitivity: { label: 'Sensory overwhelm', description: 'How much input is affecting you' },
  social_battery: { label: 'Social depletion', description: 'How drained by people' },
};

/**
 * What to track, redesigned 2026-11-14 to be less intimidating.
 *
 * It used to open with about 80 words of explanation above eight full-width
 * cards, with Continue under the last one, and told people "this is the only
 * time you'll need to do this" one sentence before saying they could add more
 * in Settings. Now: one true line, all eight as two columns of tiles that fit
 * without scrolling, a one-tap suggestion, and Continue always in view.
 *
 * Each tile's circle is the domain's own chart colour, so the key that History
 * and Insights use is learned here.
 */
export default function DomainSelectionStep({ selectedDomains, onUpdate, onNext, onClose, stepLabel, progress, error, saving }: DomainSelectionStepProps) {
  const toggle = (domain: DomainType) => {
    onUpdate(selectedDomains.includes(domain)
      ? selectedDomains.filter(d => d !== domain)
      : [...selectedDomains, domain]);
  };

  const n = selectedDomains.length;
  const note = n === 0 ? 'Pick 2 or more' : n === 1 ? '1 picked, 1 more to go' : `${n} picked`;

  return (
    <SetupScreen
      stepLabel={stepLabel}
      progress={progress}
      title="What do you want to keep an eye on?"
      lede="Pick at least 2. You can change these any time."
      onClose={onClose}
      footer={<FooterRow note={note} label="Continue" onPress={onNext} disabled={n < MIN_DOMAINS} busy={saving} />}>
      <SuggestRow title="Not sure? Start with three" detail="Mood, Energy and Anxiety" onUse={() => onUpdate(SUGGESTED)} />
      <TileGrid>
        {DOMAIN_ORDER.map(d => (
          <SelectTile
            key={d}
            label={TILE_COPY[d].label}
            description={TILE_COPY[d].description}
            color={getDomainColor(d)}
            selected={selectedDomains.includes(d)}
            onPress={() => toggle(d)}
          />
        ))}
      </TileGrid>
      {error ? <Note tone="error">{error}</Note> : null}
    </SetupScreen>
  );
}
