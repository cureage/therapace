import Svg, { Circle, Path } from 'react-native-svg';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

type HeartRatePoint = { seconds: number; bpm: number };

export const HeartRateChart = ({ points }: { points?: HeartRatePoint[] | null }) => {
  const chartPoints = Array.isArray(points) ? points : [];
  if (chartPoints.length === 0) return null;

  const width = 320;
  const height = 120;
  const padding = 12;
  const values = chartPoints.map((point) => point.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const lastSecond = Math.max(chartPoints[chartPoints.length - 1].seconds, 1);
  const coordinates = chartPoints.map((point) => ({
    x: padding + (Math.max(point.seconds, 0) / lastSecond) * (width - padding * 2),
    y: height - padding - ((point.bpm - min) / range) * (height - padding * 2),
  }));
  const line = coordinates
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ');

  return (
    <View>
      <Text className="mb-2 text-sm text-neutral-600">Heart rate during exposure</Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={line} fill="none" stroke="#e43d7c" strokeWidth={3} strokeLinejoin="round" />
        {coordinates.length === 1 ? (
          <Circle cx={coordinates[0].x} cy={coordinates[0].y} r={4} fill="#e43d7c" />
        ) : null}
      </Svg>
      <View className="mt-1 flex-row justify-between">
        <Text className="text-xs text-neutral-500">Start</Text>
        <Text className="text-xs text-neutral-500">End</Text>
      </View>
    </View>
  );
};
