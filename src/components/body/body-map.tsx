import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline } from 'react-native-svg';

import {
  ARM_POINTS, ARM_POINTS_STR, ARM_W, BACK_LAYOUT, CENTER_X, FOOT_R, FRONT_LAYOUT, HAND_R, HEAD_R, LEG_PATH,
  LEG_POINTS, LEG_RADII, MIRROR_TRANSFORM, NECK_Y, TORSO_PATH, TORSO_POINTS, hexPoints, lateralX,
} from '@/lib/body/body-map-geometry';
import { BODY_MAP_REGIONS, type BodySiteOption } from '@/lib/body/constants';
import { BODY_COLOR } from '@/lib/domains';
import type { BodyAspect, BodySide } from '@/lib/supabase';
import { brandTint } from '@/constants/brand';
import { makeAccentStyles } from '@/lib/accent-styles';

export interface PainSite {
  region: string;
  side: BodySide | null;
  aspect: BodyAspect;
}

interface Props {
  sites: PainSite[];
  onChange: (sites: PainSite[]) => void;
}

const SILHOUETTE = '#232838';
const SILHOUETTE_STROKE = '#323a52';

// Geometry lives in lib/body/body-map-geometry.ts, shared with the PDF
// report's printed map. Re-exported so existing imports keep working.
export { BACK_LAYOUT, CENTER_X, FRONT_LAYOUT, hexPoints, lateralX, type MarkerLayout } from '@/lib/body/body-map-geometry';

function siteKey(site: PainSite): string {
  return `${site.aspect}:${site.region}:${site.side ?? ''}`;
}

export function Silhouette({ aspect }: { aspect: BodyAspect }) {
  const [hip, knee, ankle] = LEG_POINTS;
  const hand = ARM_POINTS[ARM_POINTS.length - 1];
  const neckHalfWidth = HEAD_R * 0.7;
  const neckBottomY = TORSO_POINTS[0].y;

  return (
    <>
      {/* legs — filled taper through hip/knee/ankle, right + mirrored left */}
      <G>
        <Path d={LEG_PATH} fill={SILHOUETTE} />
        <Circle cx={hip.x} cy={hip.y} r={LEG_RADII[0]} fill={SILHOUETTE} />
        <Circle cx={knee.x} cy={knee.y} r={LEG_RADII[1]} fill={SILHOUETTE} />
        <Circle cx={ankle.x} cy={ankle.y + 14} r={FOOT_R} fill={SILHOUETTE} />
      </G>
      <G transform={MIRROR_TRANSFORM}>
        <Path d={LEG_PATH} fill={SILHOUETTE} />
        <Circle cx={hip.x} cy={hip.y} r={LEG_RADII[0]} fill={SILHOUETTE} />
        <Circle cx={knee.x} cy={knee.y} r={LEG_RADII[1]} fill={SILHOUETTE} />
        <Circle cx={ankle.x} cy={ankle.y + 14} r={FOOT_R} fill={SILHOUETTE} />
      </G>

      {/* torso — right half authored, mirrored for left */}
      <Path d={TORSO_PATH} fill={SILHOUETTE} stroke={SILHOUETTE_STROKE} strokeWidth={1} strokeLinejoin="round" />
      <G transform={MIRROR_TRANSFORM}>
        <Path d={TORSO_PATH} fill={SILHOUETTE} stroke={SILHOUETTE_STROKE} strokeWidth={1} strokeLinejoin="round" />
      </G>

      {/* arms */}
      <Polyline points={ARM_POINTS_STR} fill="none" stroke={SILHOUETTE} strokeWidth={ARM_W} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={hand.x} cy={hand.y} r={HAND_R} fill={SILHOUETTE} />
      <G transform={MIRROR_TRANSFORM}>
        <Polyline points={ARM_POINTS_STR} fill="none" stroke={SILHOUETTE} strokeWidth={ARM_W} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={hand.x} cy={hand.y} r={HAND_R} fill={SILHOUETTE} />
      </G>

      {/* neck + head (midline, unmirrored) */}
      <Path
        d={`M ${CENTER_X - neckHalfWidth} ${NECK_Y} L ${CENTER_X + neckHalfWidth} ${NECK_Y} L ${CENTER_X + neckHalfWidth - 2} ${neckBottomY} L ${CENTER_X - neckHalfWidth + 2} ${neckBottomY} Z`}
        fill={SILHOUETTE}
      />
      <Circle cx={CENTER_X} cy={NECK_Y - HEAD_R - 2} r={HEAD_R} fill={SILHOUETTE} stroke={SILHOUETTE_STROKE} strokeWidth={1} />

      {aspect === 'back' && (
        <Line x1={CENTER_X} y1={neckBottomY + 4} x2={CENTER_X} y2={TORSO_POINTS[5].y - 5} stroke={SILHOUETTE_STROKE} strokeWidth={1} opacity={0.5} />
      )}
    </>
  );
}

function SiteChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.siteChip, selected && styles.siteChipSelected]}>
      <Text style={[styles.siteChipText, selected && styles.siteChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

// Ported from the web app's BodyMap.tsx — the interactive front/back
// pain-site diagram, chunk 3 of the body-tracking port (closes the last
// gap in the evening check-in form: pain_diffuse and body_pain_sites,
// deferred since chunk 1). Silhouette geometry (Catmull-Rom curves,
// tapered-limb paths, hex tap targets) is pure math, unchanged from the
// web version — only the JSX layer swaps <svg>/<path>/... for
// react-native-svg's Svg/Path/Polygon/etc., which support onPress
// directly on shape elements the same way the web version uses onClick.
export default function BodyMap({ sites, onChange }: Props) {
  const styles = useStyles();
  const [aspect, setAspect] = useState<BodyAspect>('front');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [listSide, setListSide] = useState<BodySide>('L');
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [otherSide, setOtherSide] = useState<BodySide | null>(null);
  const [otherText, setOtherText] = useState('');

  const layout = aspect === 'front' ? FRONT_LAYOUT : BACK_LAYOUT;
  const regionOptions = BODY_MAP_REGIONS[aspect];
  const midlineOptions = regionOptions.filter(o => o.midline);
  const sideOptions = regionOptions.filter(o => !o.midline);

  const isSelected = (region: string, side: BodySide | null) =>
    sites.some(s => s.aspect === aspect && s.region === region && s.side === side);

  const toggle = (region: string, side: BodySide | null) => {
    const key = siteKey({ region, side, aspect });
    if (sites.some(s => siteKey(s) === key)) {
      onChange(sites.filter(s => siteKey(s) !== key));
    } else {
      onChange([...sites, { region, side, aspect }]);
    }
  };

  // Unlike toggle(), this removes by the site's own aspect rather than the
  // currently-viewed tab — needed for the summary list, which shows sites
  // from both front and back regardless of which tab is active.
  const removeSite = (site: PainSite) => {
    const key = siteKey(site);
    onChange(sites.filter(s => siteKey(s) !== key));
  };

  // Free-text fallback for anywhere not on the fixed region list. region is
  // plain text in the DB (no CHECK constraint) so custom values round-trip
  // through History the same way as the fixed regions — formatPainSiteLabel()
  // already falls back to the raw region string when it isn't found in
  // BODY_MAP_REGIONS.
  const addOtherSite = () => {
    const region = otherText.trim();
    if (!region) return;
    const site: PainSite = { region, side: otherSide, aspect };
    if (sites.some(s => siteKey(s) === siteKey(site))) return;
    onChange([...sites, site]);
    setOtherText('');
    setOtherSide(null);
  };

  return (
    <View>
      <View style={styles.tabRow}>
        <View style={styles.tabGroup}>
          {(['front', 'back'] as const).map(a => (
            <Pressable key={a} onPress={() => setAspect(a)} style={[styles.aspectTab, aspect === a && styles.aspectTabActive]}>
              <Text style={[styles.aspectTabText, aspect === a && styles.aspectTabTextActive]}>{a === 'front' ? 'Front' : 'Back'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.tabGroup}>
          {(['map', 'list'] as const).map(m => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeTab, mode === m && styles.modeTabActive]}>
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{m === 'map' ? 'Map' : 'List'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === 'map' ? (
        <View>
          <Svg viewBox="0 0 240 470" width="100%" height={280} style={styles.svg}>
            <Silhouette aspect={aspect} />
            {layout.map(({ region, y, offset }) => {
              if (offset === 0) {
                const selected = isSelected(region, null);
                return (
                  <Polygon
                    key={region}
                    points={hexPoints(CENTER_X, y, 15)}
                    onPress={() => toggle(region, null)}
                    fill={selected ? `${BODY_COLOR}66` : 'rgba(255,255,255,0.08)'}
                    stroke={selected ? BODY_COLOR : 'rgba(255,255,255,0.25)'}
                    strokeWidth={selected ? 2 : 1}
                  />
                );
              }
              return (
                <G key={region}>
                  {(['L', 'R'] as const).map(side => {
                    const selected = isSelected(region, side);
                    const x = lateralX(side, offset);
                    return (
                      <Polygon
                        key={side}
                        points={hexPoints(x, y, 15)}
                        onPress={() => toggle(region, side)}
                        fill={selected ? `${BODY_COLOR}66` : 'rgba(255,255,255,0.08)'}
                        stroke={selected ? BODY_COLOR : 'rgba(255,255,255,0.25)'}
                        strokeWidth={selected ? 2 : 1}
                      />
                    );
                  })}
                </G>
              );
            })}
          </Svg>
          <View style={styles.sideLabelRow}>
            <Text style={styles.sideLabelText}>YOUR LEFT</Text>
            <Text style={styles.sideLabelText}>YOUR RIGHT</Text>
          </View>
        </View>
      ) : (
        <View>
          {midlineOptions.length > 0 && (
            <View style={[styles.chipRow, sideOptions.length > 0 && styles.chipRowSpaced]}>
              {midlineOptions.map((option: BodySiteOption) => (
                <SiteChip key={option.region} label={option.label} selected={isSelected(option.region, null)} onPress={() => toggle(option.region, null)} />
              ))}
            </View>
          )}

          {sideOptions.length > 0 && (
            <>
              <View style={styles.sideSelectRow}>
                {(['L', 'R'] as const).map(side => (
                  <Pressable key={side} onPress={() => setListSide(side)} style={[styles.sideSelectTab, listSide === side && styles.sideSelectTabActive]}>
                    <Text style={[styles.sideSelectText, listSide === side && styles.sideSelectTextActive]}>{side === 'L' ? 'Left' : 'Right'}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chipRow}>
                {sideOptions.map((option: BodySiteOption) => (
                  <SiteChip key={option.region} label={option.label} selected={isSelected(option.region, listSide)} onPress={() => toggle(option.region, listSide)} />
                ))}
              </View>
            </>
          )}
        </View>
      )}

      <View style={styles.otherBlock}>
        {otherExpanded ? (
          <View style={styles.otherRow}>
            <View style={styles.otherSideGroup}>
              {(['L', 'R'] as const).map(side => (
                <Pressable key={side} onPress={() => setOtherSide(prev => (prev === side ? null : side))} style={[styles.otherSideButton, otherSide === side && styles.otherSideButtonActive]}>
                  <Text style={[styles.otherSideButtonText, otherSide === side && styles.otherSideButtonTextActive]}>{side}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={otherText}
              onChangeText={setOtherText}
              onSubmitEditing={addOtherSite}
              placeholder="Describe where"
              placeholderTextColor="#4a5568"
              maxLength={60}
              style={styles.otherInput}
            />
            <Pressable onPress={addOtherSite} disabled={!otherText.trim()} style={[styles.otherAddButton, !otherText.trim() && styles.otherAddButtonDisabled]}>
              <Text style={[styles.otherAddButtonText, !otherText.trim() && styles.otherAddButtonTextDisabled]}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setOtherExpanded(true)}>
            <Text style={styles.otherToggleText}>+ Somewhere else</Text>
          </Pressable>
        )}
      </View>

      {sites.length > 0 && (
        <View style={styles.selectedBlock}>
          <Text style={styles.selectedLabel}>Selected</Text>
          <View style={styles.chipRow}>
            {sites.map(site => {
              const optLabel = BODY_MAP_REGIONS[site.aspect].find(r => r.region === site.region)?.label ?? site.region;
              const label = site.side ? `${site.side} ${optLabel}` : optLabel;
              return (
                <View key={`${site.aspect}-${site.region}-${site.side ?? ''}`} style={styles.selectedTag}>
                  <Text style={styles.selectedTagText}>{label}</Text>
                  <Text style={styles.selectedTagAspect}>{site.aspect}</Text>
                  <Pressable onPress={() => removeSite(site)} hitSlop={6}>
                    <Text style={styles.selectedTagRemove}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeAccentStyles(b => ({
  tabRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tabGroup: { flexDirection: 'row', gap: 6 },
  aspectTab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748' },
  aspectTabActive: { borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  aspectTabText: { fontSize: 12.5, color: '#8892a4' },
  aspectTabTextActive: { color: BODY_COLOR, fontWeight: '600' },
  modeTab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748' },
  modeTabActive: { borderColor: b.textSoft, backgroundColor: brandTint(b.textSoft, 0.15) },
  modeTabText: { fontSize: 12, color: '#8892a4' },
  modeTabTextActive: { color: b.textSoft, fontWeight: '600' },
  svg: { alignSelf: 'center', maxWidth: 260 },
  sideLabelRow: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 260, alignSelf: 'center', width: '100%', marginTop: 6, paddingHorizontal: 4 },
  sideLabelText: { fontSize: 10, color: '#4a5568', letterSpacing: 0.6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipRowSpaced: { marginBottom: 14 },
  siteChip: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12', justifyContent: 'center' },
  siteChipSelected: { borderWidth: 1.5, borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  siteChipText: { fontSize: 12.5, color: '#8892a4' },
  siteChipTextSelected: { color: BODY_COLOR, fontWeight: '600' },
  sideSelectRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  sideSelectTab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748' },
  sideSelectTabActive: { borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  sideSelectText: { fontSize: 12.5, color: '#8892a4' },
  sideSelectTextActive: { color: BODY_COLOR, fontWeight: '600' },
  otherBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e2533' },
  otherRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  otherSideGroup: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  otherSideButton: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12', alignItems: 'center', justifyContent: 'center' },
  otherSideButtonActive: { borderWidth: 1.5, borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22` },
  otherSideButtonText: { fontSize: 12.5, fontWeight: '600', color: '#8892a4' },
  otherSideButtonTextActive: { color: BODY_COLOR },
  otherInput: { flex: 1, minWidth: 0, backgroundColor: '#0a0c12', borderWidth: 1, borderColor: '#2d3748', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, color: '#e2e8f0', fontSize: 13 },
  otherAddButton: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BODY_COLOR, backgroundColor: `${BODY_COLOR}22`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  otherAddButtonDisabled: { borderColor: '#2d3748', backgroundColor: 'transparent' },
  otherAddButtonText: { fontSize: 18, fontWeight: '600', color: BODY_COLOR, lineHeight: 20 },
  otherAddButtonTextDisabled: { color: '#4a5568' },
  otherToggleText: { fontSize: 13, color: '#718096' },
  selectedBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e2533' },
  selectedLabel: { fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  selectedTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 11, paddingRight: 6, borderRadius: 8, backgroundColor: `${BODY_COLOR}22` },
  selectedTagText: { fontSize: 12, fontWeight: '500', color: BODY_COLOR },
  selectedTagAspect: { fontSize: 12, color: BODY_COLOR, opacity: 0.6 },
  selectedTagRemove: { fontSize: 11, color: BODY_COLOR, padding: 2 },
}));
