import { BRAND } from '@/constants/brand';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { useComfort } from '@/hooks/use-comfort';
import { COMFORT_TOKENS, NORMAL_TOKENS, type ComfortTokens } from '@/lib/comfort-theme';
import { SLIDER_LABELS } from '@/lib/domains';
import { DomainType } from '@/lib/supabase';

interface DomainSliderProps {
  /** Unique id/key for this slider — a DomainType for mind, a BodyDomainType for body (once ported). */
  domain: string;
  label: string;
  value: number;
  baseline?: number;
  onChange: (value: number) => void;
  /** Domain accent color shown as a left border. */
  color?: string;
  /** Subtitle shown under the label — body domains use this, mind domains don't. */
  hint?: string;
  /** Override the low/high anchor copy. Omit to fall back to SLIDER_LABELS (every mind caller today). */
  lowLabel?: string | null;
  highLabel?: string;
  /** Optional note shown below the anchors — body's early-log editability hint. */
  note?: string;
  /** False before the user has interacted — shows the value as an unset resting position. */
  touched?: boolean;
  /** Fired on touch down/up over the track, NOT on slide start. Parents that
   *  put sliders inside a ScrollView use these to lock scrolling for the
   *  duration. It has to be touch-based: onSlidingStart only fires once the
   *  slider has already won the gesture, so hooking that did nothing to stop
   *  the ScrollView claiming it first — which made the sliders harder to use,
   *  not easier. */
  onSlidingStart?: () => void;
  onSlidingComplete?: () => void;
}

// Ported from the web app's DomainSlider.tsx. The web version layers a
// custom-drawn track + fill + baseline tick underneath a native
// <input type="range"> (transparent track, visible thumb only) for the
// interaction surface. Same structure here: @react-native-community/slider
// with both track tints set transparent, custom Views underneath for the
// gradient fill and baseline tick.
export default function DomainSlider({
  domain,
  label,
  value,
  baseline,
  onChange,
  color,
  hint,
  lowLabel,
  highLabel,
  note,
  touched = true,
  onSlidingStart,
  onSlidingComplete,
}: DomainSliderProps) {
  const { active } = useComfort();
  const styles = active ? STYLES.comfort : STYLES.normal;
  const fillPercent = ((value - 1) / 9) * 100;

  const builtIn = SLIDER_LABELS[domain as DomainType];
  const low = lowLabel !== undefined ? lowLabel : builtIn?.low;
  const high = highLabel !== undefined ? highLabel : builtIn?.high;

  return (
    <View style={[styles.root, color ? { borderLeftColor: color, borderLeftWidth: 3, paddingLeft: 12 } : null]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLabels}>
          <Text style={styles.label}>{label}</Text>
          {hint && <Text style={styles.hint}>{hint}</Text>}
        </View>
        <Text style={[styles.value, !touched && styles.valueUntouched]}>{touched ? value : 'Not yet rated'}</Text>
      </View>

      <View
        style={styles.trackWrap}
        onTouchStart={onSlidingStart}
        onTouchEnd={onSlidingComplete}
        onTouchCancel={onSlidingComplete}>
        <View style={styles.trackBg} pointerEvents="none">
          {touched ? (
            <LinearGradient
              colors={active ? [COMFORT_TOKENS.accent, COMFORT_TOKENS.accentText] : [BRAND.fill, BRAND.text]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.trackFill, { width: `${fillPercent}%` }]}
            />
          ) : (
            <View style={[styles.trackFill, styles.trackFillUntouched, { width: `${fillPercent}%` }]} />
          )}
        </View>

        {baseline !== undefined && (
          <View style={[styles.baselineTick, { left: `${((baseline - 1) / 9) * 100}%` }]} pointerEvents="none" />
        )}

        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={value}
          onValueChange={onChange}
          tapToSeek
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor={active ? COMFORT_TOKENS.accentText : BRAND.text}
        />
      </View>

      <View style={styles.rangeRow}>
        <Text style={styles.rangeText}>1</Text>
        <Text style={styles.rangeText}>10</Text>
      </View>

      {(low || high) && (
        <View style={styles.anchorRow}>
          <Text style={styles.anchorText}>{low ?? ''}</Text>
          <Text style={[styles.anchorText, styles.anchorTextRight]}>{high ?? ''}</Text>
        </View>
      )}

      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const TRACK_HEIGHT = 4;

const STYLES = { normal: makeStyles(NORMAL_TOKENS), comfort: makeStyles(COMFORT_TOKENS) };

// The anchor copy is the tightest box in the daily-use flow — fontSize 10 in a
// 45%-wide column. Comfort mode scales it like everything else, so the width
// cap lifts to 48% and the line height is derived rather than fixed, letting a
// scaled anchor wrap to a second line instead of clipping.
function makeStyles(t: ComfortTokens) {
  return StyleSheet.create({
  root: {},
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLabels: { flex: 1 },
  // No textTransform: the labels are authored with their own capitalisation
  // ('End of day exhaustion', 'Joint & muscle pain'), and 'capitalize' turned
  // those into 'End Of Day Exhaustion'.
  label: { fontSize: t.fs(14), color: '#cbd5e0', fontWeight: '400' },
  hint: { fontSize: t.fs(12), color: '#6b7690', marginTop: 2, lineHeight: t.fs(17) },
  value: { fontSize: t.fs(13), color: BRAND.fillAlt, fontFamily: 'DM Mono', fontWeight: '500' },
  valueUntouched: { fontSize: t.fs(11.5), color: '#6b7690', fontStyle: 'italic' },
  trackWrap: { justifyContent: 'center', paddingVertical: 8, height: 40 },
  trackBg: { position: 'absolute', left: 0, right: 0, height: TRACK_HEIGHT, borderRadius: 2, backgroundColor: '#2d3748', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  trackFillUntouched: { backgroundColor: '#3d4457' },
  baselineTick: { position: 'absolute', top: '50%', width: 2, height: 12, marginTop: -6, marginLeft: -1, backgroundColor: '#4a5568', borderRadius: 1, zIndex: 1 },
  // The gradient fill and baseline tick sit under this and are decorative
  // only; both are pointerEvents="none" so nothing competes with the thumb.
  // The thumb still has to win against the enclosing ScrollView, which is what
  // onSlidingStart/Complete are for — without that, a drag with any vertical
  // component gets claimed by the scroll and the slider feels sticky.
  slider: { width: '100%', height: 40 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  rangeText: { fontSize: t.fs(11), color: '#4a5568', fontFamily: 'DM Mono' },
  anchorRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  anchorText: { fontSize: t.fs(10), color: '#4a5568', opacity: 0.7, maxWidth: t.scale > 1 ? '48%' : '45%', lineHeight: t.fs(13) },
  anchorTextRight: { textAlign: 'right' },
  note: { fontSize: t.fs(11.5), color: '#8892a4', marginTop: 8, fontStyle: 'italic' },
  });
}
