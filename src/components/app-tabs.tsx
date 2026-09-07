import { Tabs } from 'expo-router';

import { HistoryIcon, InsightsIcon, PrepareIcon, SettingsIcon, TodayIcon } from '@/components/nav-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Nav chrome is matched to the web app's <nav> in App.tsx rather than to the
// theme: indigo active, slate inactive, 10px labels that bold when selected.
// The app tint stays the body-domain accent for everything else.
const NAV_ACTIVE = '#818cf8';
const NAV_INACTIVE = '#4a5568';

// Standard expo-router Tabs rather than the (still-unstable) NativeTabs API —
// five screens matching the web app's Screen union in App.tsx (today / history
// / insights / prepare / settings). Cycle tracking lives inside History and the
// report, not as its own tab — see BODY_TRACKING_AS_TAB / cycle feature notes
// on the web side.
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: NAV_ACTIVE,
        tabBarInactiveTintColor: NAV_INACTIVE,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.2 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TodayIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <HistoryIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <InsightsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="prepare"
        options={{
          title: 'Prepare',
          tabBarIcon: ({ color }) => <PrepareIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon color={color} />,
        }}
      />

      {/*
        The magic-link deep-link target (src/app/auth/callback.tsx). It lands in
        this navigator like any other route file, so it needs declaring — with
        href: null, or expo-router would give it a sixth tab button.
      */}
      <Tabs.Screen name="auth/callback" options={{ href: null }} />

      {/*
        The catch-all in src/app/+not-found.tsx, declared for the same reason:
        it lands in this navigator and would otherwise take a tab button.
      */}
      <Tabs.Screen name="+not-found" options={{ href: null }} />
    </Tabs>
  );
}
