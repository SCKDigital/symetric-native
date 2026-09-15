import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';

import {
  BACK_LAYOUT, CENTER_X, FRONT_LAYOUT, Silhouette, hexPoints, lateralX,
} from '@/components/body/body-map';
import { BODY_COLOR } from '@/lib/domains';
import type { BodySiteFrequency } from '@/lib/report/types';
import type { BodyAspect, BodySide } from '@/lib/supabase';

/**
 * Read-only companion to BodyMap: the same silhouette and the same marker
 * positions, but showing how often each site was logged over the selected
 * range rather than letting you pick them.
 *
 * Shares BodyMap's geometry rather than copying it. Those marker coordinates
 * are hand-tuned against the silhouette's paths — a second copy would drift
 * the first time either moved, and the map would quietly start pointing at the
 * wrong joints.
 *
 * The frequency data is computeBodySiteFrequency's, unchanged. It already
 * counted distinct days per site for the PDF report's ranked list; this draws
 * the same numbers on the body instead of listing them, which is the form the
 * question "where does this keep happening" is actually asked in.
 */

/** Brightest marker at the most-logged site; everything else relative to it. */
function intensityFor(dayCount: number, max: number): number {
  if (max <= 0) return 0;
  // Floored well above zero so a site logged once is still visibly marked —
  // "this happened here at all" is the information, and a 1-of-30 site fading
  // to invisible would hide it.
  return 0.25 + 0.75 * (dayCount / max);
}

function toHexAlpha(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
}

export default function BodySiteHeatmap({ sites }: { sites: BodySiteFrequency[] }) {
  const [aspect, setAspect] = useState<BodyAspect>('front');

  // Keyed the way the layout addresses markers. computeBodySiteFrequency
  // groups by (region, side) without splitting by aspect, so a region that
  // exists on both views shows its total on whichever view is open — which is
  // right: "left knee, 6 days" is one fact, not a front fact and a back fact.
  const countByKey = new Map<string, number>();
  for (const s of sites) countByKey.set(`${s.region}|${s.side ?? ''}`, s.dayCount);
  const max = sites.reduce((m, s) => Math.max(m, s.dayCount), 0);

  const layout = aspect === 'front' ? FRONT_LAYOUT : BACK_LAYOUT;
  const countFor = (region: string, side: BodySide | null) => countByKey.get(`${region}|${side ?? ''}`) ?? 0;

  // Anything logged that the silhouette has no marker for — free-text "other"
  // sites, and regions that only exist on the opposite view.
  const placed = new Set<string>();
  for (const { region, offset } of layout) {
    if (offset === 0) placed.add(`${region}|`);
    else { placed.add(`${region}|L`); placed.add(`${region}|R`); }
  }
  const unplaced = sites.filter(s => !placed.has(`${s.region}|${s.side ?? ''}`));

  if (sites.length === 0) {
    return <Text style={styles.empty}>No pain or event sites logged in this window.</Text>;
  }

  const marker = (region: string, side: BodySide | null, x: number, y: number) => {
    const count = countFor(region, side);
    const lit = count > 0;
    return (
      <Polygon
        key={`${region}-${side ?? 'mid'}`}
        points={hexPoints(x, y, 15)}
        fill={lit ? `${BODY_COLOR}${toHexAlpha(intensityFor(count, max))}` : 'rgba(255,255,255,0.04)'}
        stroke={lit ? BODY_COLOR : 'rgba(255,255,255,0.12)'}
        strokeWidth={lit ? 1.5 : 1}
      />
    );
  };

  return (
    <View>
      <View style={styles.tabGroup}>
        {(['front', 'back'] as const).map(a => (
          <Pressable
            key={a}
            onPress={() => setAspect(a)}
            accessibilityRole="button"
            accessibilityState={{ selected: aspect === a }}
            style={[styles.aspectTab, aspect === a && styles.aspectTabActive]}>
            <Text style={[styles.aspectTabText, aspect === a && styles.aspectTabTextActive]}>
              {a === 'front' ? 'Front' : 'Back'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Svg viewBox="0 0 240 470" width="100%" height={280} style={styles.svg}>
        <Silhouette aspect={aspect} />
        {layout.map(({ region, y, offset }) =>
          offset === 0
            ? marker(region, null, CENTER_X, y)
            : (
              <G key={region}>
                {(['L', 'R'] as const).map(side => marker(region, side, lateralX(side, offset), y))}
              </G>
            ),
        )}
      </Svg>

      <View style={styles.sideLabelRow}>
        <Text style={styles.sideLabelText}>YOUR LEFT</Text>
        <Text style={styles.sideLabelText}>YOUR RIGHT</Text>
      </View>

      {/* The map answers "where"; the list answers "how often", which a shade
          of purple cannot. Both, rather than one or the other. */}
      <View style={styles.legend}>
        {[...sites].sort((a, b) => b.dayCount - a.dayCount).slice(0, 6).map(s => (
          <View key={`${s.region}|${s.side ?? ''}`} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: `${BODY_COLOR}${toHexAlpha(intensityFor(s.dayCount, max))}` }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={styles.legendCount}>{s.dayCount} day{s.dayCount !== 1 ? 's' : ''}</Text>
          </View>
        ))}
      </View>

      {unplaced.length > 0 && (
        <Text style={styles.unplaced}>
          Not on the map: {unplaced.map(s => `${s.label} (${s.dayCount})`).join(', ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, color: '#8892a4', lineHeight: 20 },
  tabGroup: { flexDirection: 'row', gap: 4, alignSelf: 'flex-start', backgroundColor: '#141820', borderRadius: 8, padding: 3, marginBottom: 8 },
  aspectTab: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6 },
  aspectTabActive: { backgroundColor: '#232838' },
  aspectTabText: { fontSize: 12, color: '#6b7a99' },
  aspectTabTextActive: { color: '#c8d0e0' },
  svg: { alignSelf: 'center', maxWidth: 260 },
  sideLabelRow: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 260, alignSelf: 'center', width: '100%', marginTop: 6, paddingHorizontal: 4 },
  sideLabelText: { fontSize: 10, color: '#4a5568', letterSpacing: 0.6 },
  legend: { marginTop: 14, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 13, color: '#c8d0e0', flex: 1 },
  legendCount: { fontSize: 12, color: '#8892a4' },
  unplaced: { marginTop: 10, fontSize: 12, color: '#6b7a99', lineHeight: 17 },
});
