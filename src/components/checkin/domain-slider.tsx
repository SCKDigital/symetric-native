import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

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
}: DomainSliderProps) {
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

      <View style={styles.trackWrap}>
        <View style={styles.trackBg}>
          {touched ? (
            <LinearGradient
              colors={['#4f46e5', '#818cf8']}
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
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="#818cf8"
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

const styles = StyleSheet.create({
  root: {},
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLabels: { flex: 1 },
  label: { fontSize: 14, color: '#cbd5e0', fontWeight: '400', textTransform: 'capitalize' },
  hint: { fontSize: 12, color: '#6b7690', marginTop: 2, lineHeight: 17 },
  value: { fontSize: 13, color: '#6366f1', fontFamily: 'DM Mono', fontWeight: '500' },
  valueUntouched: { fontSize: 11.5, color: '#6b7690', fontStyle: 'italic' },
  trackWrap: { justifyContent: 'center', paddingVertical: 8, height: 40 },
  trackBg: { position: 'absolute', left: 0, right: 0, height: TRACK_HEIGHT, borderRadius: 2, backgroundColor: '#2d3748', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  trackFillUntouched: { backgroundColor: '#3d4457' },
  baselineTick: { position: 'absolute', top: '50%', width: 2, height: 12, marginTop: -6, marginLeft: -1, backgroundColor: '#4a5568', borderRadius: 1, zIndex: 1 },
  slider: { width: '100%', height: 40 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  rangeText: { fontSize: 11, color: '#4a5568', fontFamily: 'DM Mono' },
  anchorRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  anchorText: { fontSize: 10, color: '#4a5568', opacity: 0.7, maxWidth: '45%', lineHeight: 13 },
  anchorTextRight: { textAlign: 'right' },
  note: { fontSize: 11.5, color: '#8892a4', marginTop: 8, fontStyle: 'italic' },
});
