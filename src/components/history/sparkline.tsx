import Svg, { Circle, Polyline } from 'react-native-svg';

interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

// Ported from the web app's Sparkline.tsx — same fixed 0–10 y-axis (so rows
// are comparable to each other, not each auto-scaling to its own range).
export default function Sparkline({ values, color, width = 96, height = 24 }: SparklineProps) {
  const pad = 3;
  const usableHeight = height - pad * 2;

  const y = (v: number) => pad + usableHeight * (1 - v / 10);
  const x = (i: number) => (values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {values.length < 2 ? (
        <Circle cx={x(0)} cy={y(values[0] ?? 0)} r={2.5} fill={color} />
      ) : (
        <Polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}
