import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { trackBodySitePickerUsed } from '@/lib/analytics';
import { EVENT_SITE_LISTS } from '@/lib/body/constants';
import type { BodyEventType, BodySide } from '@/lib/supabase';

export interface EventSite {
  region: string;
  side: BodySide | null;
}

interface Props {
  eventType: BodyEventType;
  sites: EventSite[];
  onChange: (sites: EventSite[]) => void;
}

function siteKey(site: EventSite): string {
  return `${site.region}:${site.side ?? ''}`;
}

/**
 * Inline site picker for subluxation/injury. Site is optional — the event
 * saves without one; this only ever adds to the parent's sites array.
 * Ported from the web app's EventSitePicker.tsx — chip-based, no
 * dependency on the (not yet ported) interactive BodyMap diagram.
 */
export default function EventSitePicker({ eventType, sites, onChange }: Props) {
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);

  useEffect(() => {
    trackBodySitePickerUsed(eventType);
  }, [eventType]);

  const options = EVENT_SITE_LISTS[eventType] ?? [];

  const addSite = (site: EventSite) => {
    if (sites.some(s => siteKey(s) === siteKey(site))) return;
    onChange([...sites, site]);
    setPendingRegion(null);
  };

  const removeSite = (site: EventSite) => {
    onChange(sites.filter(s => siteKey(s) !== siteKey(site)));
  };

  const handleRegionTap = (region: string, midline: boolean) => {
    if (midline) {
      addSite({ region, side: null });
    } else {
      setPendingRegion(prev => (prev === region ? null : region));
    }
  };

  const pendingOption = options.find(o => o.region === pendingRegion);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>Where? (optional)</Text>

      <View style={styles.chipRow}>
        {options.map(option => {
          const active = pendingRegion === option.region;
          return (
            <Pressable key={option.region} onPress={() => handleRegionTap(option.region, option.midline)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {pendingOption && (
        <View style={styles.sideRow}>
          {(['L', 'R'] as const).map(side => (
            <Pressable key={side} onPress={() => addSite({ region: pendingOption.region, side })} style={styles.sideButton}>
              <Text style={styles.sideButtonText}>{side === 'L' ? `Left ${pendingOption.label.toLowerCase()}` : `Right ${pendingOption.label.toLowerCase()}`}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {sites.length > 0 && (
        <View style={styles.chipRow}>
          {sites.map(site => {
            const label = options.find(o => o.region === site.region)?.label ?? site.region;
            return (
              <View key={siteKey(site)} style={styles.tag}>
                <Text style={styles.tagText}>{site.side ? `${site.side} ${label}` : label}</Text>
                <Pressable onPress={() => removeSite(site)} hitSlop={6}>
                  <Text style={styles.tagRemove}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#2d3748' },
  label: { fontSize: 12, color: '#8892a4', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 11, minHeight: 32, borderRadius: 999, borderWidth: 1, borderColor: '#2d3748', backgroundColor: '#0a0c12', justifyContent: 'center' },
  chipActive: { borderWidth: 1.5, borderColor: '#a5b4fc', backgroundColor: 'rgba(165,180,252,0.15)' },
  chipText: { fontSize: 12.5, color: '#8892a4' },
  chipTextActive: { color: '#a5b4fc', fontWeight: '600' },
  sideRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  sideButton: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#a5b4fc', backgroundColor: 'rgba(165,180,252,0.1)', alignItems: 'center' },
  sideButtonText: { fontSize: 13, fontWeight: '600', color: '#a5b4fc' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 11, paddingRight: 6, borderRadius: 999, backgroundColor: 'rgba(165,180,252,0.15)' },
  tagText: { fontSize: 12, fontWeight: '500', color: '#a5b4fc' },
  tagRemove: { fontSize: 11, color: '#a5b4fc', padding: 2 },
});
