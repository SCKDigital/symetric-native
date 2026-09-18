import { useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { useComfort } from '@/hooks/use-comfort';
import { COMFORT_TOKENS } from '@/lib/comfort-theme';

// The tracked-symptom row and its inline chart, shared by both drill-downs.
//
// This lived inside mind-area-detail.tsx, and Body had something else
// entirely: a collapsible list of dates and numbers, no chart, no baseline, no
// trend word. Two screens describing the same kind of thing — a symptom, its
// level, how it has moved — in two visual languages, which is the same
// complaint FindingCard was extracted to fix.
//
// Generic over the value series rather than over a domain type, because body
// domains are not DomainType and their readings come from a different table.
// Callers hand over plain numbers in chronological order.

export interface SparkPoint { x: number; y: number; }

/** Authored size of the axis labels, in points, before any scaling. The old
 *  9/8.5 sat under the ~11pt floor where small UI text stays readable. */
const CHART_LABEL_PT = 11;
/** Past roughly this the labels take more of the chart than the chart does. */
const CHART_LABEL_MAX_SCALE = 1.6;
/** Reproduces the original 9pt/+4 optical centring at any size: SVG `y` is the
 *  baseline, so the label has to be nudged down to sit on its gridline. */
const LABEL_BASELINE_SHIFT = 4 / 9;

/** Below this a line says more about the gaps than the readings. */
export const MIN_POINTS_FOR_CHART = 5;

// ── Inline sparkline ────────────────────────────────────────────────────────
//
// Geometry ported from the web source, with the coordinate space changed from
// a fixed 320-unit viewBox to the measured width in points. The old form was
// `<Svg width="100%" viewBox="0 0 320 80">`, which with the default
// preserveAspectRatio scales everything by min(renderedWidth / 320, 1) — so the
// tick labels rendered at ~8.4pt on a small phone, ~8.9pt on a large one, and
// could never exceed the authored 9 no matter what. Label size was effectively
// a function of device width.
export function InlineDomainChart({ points, baseline, color, yMin = 1 }: {
  points: SparkPoint[];
  baseline: number;
  color: string;
  /** 1 for mind domains, 0 for body ones — their scales genuinely differ, and
   *  a floor of 1 would draw a body reading of 0 below the axis. */
  yMin?: number;
}) {
  const { active: comfortActive } = useComfort();
  // Seeded at the old fixed 320 so the first frame matches what shipped before,
  // then corrected on layout.
  const [W, setW] = useState(320);
  const yMax = 10, H = 80;

  // react-native-svg does not implement allowFontScaling on <Text> (checked
  // against 15.15.4 — the prop does not exist, and the package's only PixelRatio
  // use is asset resolution). So the OS text-size setting and comfort mode both
  // slide straight off vector text unless applied by hand, which is what this
  // does. Clamped, because Dynamic Type goes to 200%+ and this is a sparkline.
  const labelSize = Math.min(
    CHART_LABEL_PT * PixelRatio.getFontScale() * (comfortActive ? COMFORT_TOKENS.scale : 1),
    CHART_LABEL_PT * CHART_LABEL_MAX_SCALE,
  );

  // Both gutters are derived from the text they have to hold — "10" on the
  // left, "base" on the right — rather than fixed. The right one was 12 units
  // against a label needing ~17, so "base" was clipped by the viewport on every
  // device; it still is in the web app this was ported from.
  const PAD = {
    top: 10,
    bottom: 24,
    left: Math.ceil(labelSize * 1.4) + 6,
    right: Math.ceil(labelSize * 2.0) + 6,
  };
  const chartW = Math.max(1, W - PAD.left - PAD.right);
  const chartH = H - PAD.top - PAD.bottom;
  const toSvgY = (v: number) => PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const baselineY = toSvgY(baseline);
  const xStep = points.length > 1 ? chartW / (points.length - 1) : chartW / 2;
  const toSvgX = (i: number) => PAD.left + (points.length > 1 ? i * xStep : chartW / 2);
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toSvgX(i).toFixed(1)},${toSvgY(p.y).toFixed(1)}`).join(' ');
  const yTicks = yMin === 0 ? [0, 3, 5, 7, 10] : [1, 3, 5, 7, 10];
  const labelShift = labelSize * LABEL_BASELINE_SHIFT;

  return (
    <View
      onLayout={e => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next > 0 && next !== W) setW(next);
      }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {yTicks.map(v => (
          <Line key={v} x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + chartW} y2={toSvgY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {yTicks.map(v => (
          <SvgText key={v} x={PAD.left - 4} y={toSvgY(v) + labelShift} fontSize={labelSize} fill="#3d4b60" textAnchor="end">{v}</SvgText>
        ))}
        <Line x1={PAD.left} y1={baselineY} x2={PAD.left + chartW} y2={baselineY} stroke="#4a5e8a" strokeWidth={1.5} strokeDasharray="4 3" />
        <SvgText x={PAD.left + chartW + 3} y={baselineY + labelShift} fontSize={labelSize} fill="#4a5e8a">base</SvgText>
        {points.length > 1 && <Path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />}
        {points.map((p, i) => (
          <Circle key={i} cx={toSvgX(i)} cy={toSvgY(p.y)} r={points.length > 20 ? 1.5 : 2.5} fill={color} opacity={0.9} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * "stable" / "mixed" / "elevated" / "below", against the domain's own baseline.
 *
 * Deliberately a word rather than a number: the underlying figure is a rolling
 * median deviation, and this app does not hand people statistics it would then
 * have to defend as clinical.
 */
export function trendLabel(values: number[], baseline: number): string {
  if (values.length < 3) return 'stable';
  const threshold = 1.5;
  const above = values.filter(v => v > baseline + threshold).length;
  const below = values.filter(v => v < baseline - threshold).length;
  if (above > 0 && below > 0) return 'mixed';
  if (above > 0) return 'elevated';
  if (below > 0) return 'below';
  return 'stable';
}

/**
 * One tracked symptom: its average as a bar against its baseline, a trend word,
 * and the series itself one tap away.
 *
 * `children` renders under the chart — Body uses it for the dates that carry a
 * note or a character tag, which are the only thing a line cannot show.
 */
export function DomainSparklineRow({
  label, color, values, baseline, scaleMin = 1, isExpanded, onToggle, children,
}: {
  label: string;
  color: string;
  /** Chronological, oldest first. */
  values: number[];
  baseline: number;
  scaleMin?: number;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : baseline;
  const fillPct = Math.min(100, Math.max(0, (avg / 10) * 100));
  const baselinePct = Math.min(100, Math.max(0, (baseline / 10) * 100));
  const points: SparkPoint[] = values.map((y, x) => ({ x, y }));

  return (
    <View style={[styles.compactRow, { borderLeftColor: color }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        style={styles.compactRowHeader}>
        <Text style={[styles.compactRowLabel, { color }]}>{label}</Text>
        <View style={styles.compactRowBar}>
          <View style={[styles.compactRowFill, { width: `${fillPct}%`, backgroundColor: color }]} />
          <View style={[styles.compactRowBaselineTick, { left: `${baselinePct}%` }]} />
        </View>
        <View style={styles.compactRowRight}>
          <Text style={styles.compactRowTrend}>{trendLabel(values, baseline)}</Text>
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={isExpanded ? styles.chevronExpanded : undefined}>
            <Polyline points="6 9 12 15 18 9" />
          </Svg>
        </View>
      </Pressable>
      {isExpanded && (
        <View style={styles.compactRowExpanded}>
          {points.length >= MIN_POINTS_FOR_CHART ? (
            <InlineDomainChart points={points} baseline={baseline} color={color} yMin={scaleMin} />
          ) : (
            <Text style={styles.compactRowNoData}>Not enough data in this period to show a chart.</Text>
          )}
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  compactRow: { borderRadius: 12, borderWidth: 1, borderColor: '#1e2533', borderLeftWidth: 4, backgroundColor: '#141820', overflow: 'hidden', marginBottom: 8 },
  compactRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 16 },
  compactRowLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, minWidth: 100 },
  compactRowBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, position: 'relative' },
  compactRowFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, opacity: 0.7 },
  compactRowBaselineTick: { position: 'absolute', top: -3, bottom: -3, width: 2, backgroundColor: '#4a5e8a', borderRadius: 1 },
  compactRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  compactRowTrend: { fontSize: 12, color: '#6b7a99' },
  compactRowExpanded: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  compactRowNoData: { fontSize: 12, color: '#4a5568', marginTop: 10, lineHeight: 18 },
});
