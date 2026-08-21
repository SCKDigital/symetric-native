import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

interface SymetricLogoProps {
  /** width and height in px, default 120 */
  size?: number;
  /** play a one-time settle-in, cold start only (see below) */
  animate?: boolean;
  /** loop a gentle breathing animation for as long as this is mounted — use on loading screens */
  pulse?: boolean;
}

// Module-level, not component state: a screen can remount within the same
// app session (e.g. a profile refetch briefly re-entering a loading branch)
// without that counting as a fresh cold start. Reloading the JS bundle
// re-evaluates the module and resets this, which is exactly the "cold start"
// boundary we want — so the intro only ever plays once per real app launch.
let hasPlayedIntroAnimation = false;

const MARK_PATH =
  'M0.0 153.6022253129346H55.6884561891516Q56.912378303198885 165.53546592489568 63.94993045897078 171.80806675938803Q70.98748261474269 178.08066759388038 82.3087621696801 178.08066759388038Q93.93602225312934 178.08066759388038 100.66759388038942 172.72600834492349Q107.3991655076495 167.3713490959666 107.3991655076495 157.8859527121001Q107.3991655076495 149.93045897079276 102.04450625869262 144.72878998609178Q96.68984700973573 139.5271210013908 88.88734353268427 136.16133518776076Q81.08484005563281 132.7955493741307 66.70375521557717 128.5118219749652Q45.89707927677329 122.08623087621694 32.739916550764946 115.66063977746867Q19.582753824756608 109.23504867872042 10.097357440890125 96.68984700973573Q0.6119610570236436 84.14464534075103 0.6119610570236436 63.94993045897078Q0.6119610570236436 33.963838664812215 22.336578581363003 16.981919332406108Q44.061196105702365 0.0 78.94297635605005 0.0Q114.4367176634214 0.0 136.16133518776076 16.981919332406108Q157.88595271210013 33.963838664812215 159.41585535465924 64.2559109874826H102.80945757997218Q102.19749652294853 53.85257301808065 95.15994436717662 47.88595271210012Q88.12239221140472 41.919332406119594 77.10709318497912 41.919332406119594Q67.62169680111265 41.919332406119594 61.808066759388026 46.96801112656466Q55.99443671766341 52.01668984700973 55.99443671766341 61.50208623087619Q55.99443671766341 71.90542420027813 65.78581363004172 77.71905424200276Q75.57719054242001 83.53268428372738 96.3838664812239 90.26425591098746Q117.1905424200278 97.30180806675936 130.19471488178024 103.72739916550762Q143.19888734353268 110.15299026425589 152.68428372739916 122.39221140472877Q162.16968011126565 134.63143254520165 162.16968011126565 153.90820584144643Q162.16968011126565 172.26703755215573 152.83727399165508 187.26008344923503Q143.5048678720445 202.2531293463143 125.75799721835884 211.12656467315713Q108.01112656467315 219.99999999999997 83.8386648122392 219.99999999999997Q60.278164116828926 219.99999999999997 41.61335187760778 212.35048678720443Q22.94853963838665 204.70097357440886 11.780250347705145 189.7079276773296Q0.6119610570236436 174.71488178025032 0.0 153.6022253129346Z';

export function SymetricLogo({ size = 120, animate = false, pulse = false }: SymetricLogoProps) {
  const [playIntro] = useState(() => {
    const shouldPlay = animate && !hasPlayedIntroAnimation;
    if (shouldPlay) hasPlayedIntroAnimation = true;
    return shouldPlay;
  });
  const [markOpacity] = useState(() => new Animated.Value(playIntro ? 0 : 1));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled || reduced) {
        markOpacity.setValue(1);
        return;
      }
      if (playIntro) {
        Animated.timing(markOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      } else if (pulse) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(markOpacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
            Animated.timing(markOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          ]),
        ).start();
      }
    });
    return () => {
      cancelled = true;
    };
    // Deliberately once per mount, matching the CSS-animation original —
    // playIntro/pulse are read from state/props set at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="symetricMarkGradient" gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="162.17" y2="0">
          <Stop offset="0%" stopColor="#22D3EE" />
          <Stop offset="17%" stopColor="#34D399" />
          <Stop offset="34%" stopColor="#60A5FA" />
          <Stop offset="50%" stopColor="#A78BFA" />
          <Stop offset="67%" stopColor="#F472B6" />
          <Stop offset="84%" stopColor="#FB923C" />
          <Stop offset="100%" stopColor="#FBBF24" />
        </LinearGradient>
      </Defs>
      <Rect width="1024" height="1024" rx="225.28" fill="#1E1B4B" />
      <AnimatedG transform="translate(300.65,225.28) scale(2.60655)" opacity={markOpacity}>
        <Path d={MARK_PATH} fill="url(#symetricMarkGradient)" />
      </AnimatedG>
    </Svg>
  );
}
