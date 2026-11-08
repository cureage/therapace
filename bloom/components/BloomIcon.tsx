import { createIcon } from '@/components/ui/icon';
import { Path } from 'react-native-svg';

const createBloomIcon = (stroke1: string, stroke2: string) =>
  createIcon({
    viewBox: '1000 500 1000 1000',
    path: (
      <>
        <Path
          fill="none"
          stroke={stroke1}
          strokeWidth="100"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M 1555 990 C 1705.651489 895.194458 1963.136475 740.588257 1885 960 C 1775.916992 1266.311768 1455 1340 1455 1340 C 1455 1340 1070.21106 1259.49939 1035 960 C 1010.707397 753.370972 1219.961914 897.843384 1352 990"
        />
        <Path
          fill="none"
          stroke={stroke2}
          strokeWidth="100"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M 1454 650 C 1454 650 1330.489258 739.559204 1354 990 C 1377.510742 1240.440796 1454 1340 1454 1340 C 1454 1340 1551.548706 1215.296997 1554 990 C 1556.451294 764.703003 1454 650 1454 650 Z"
        />
      </>
    ),
  });

const BloomIconColor = createBloomIcon('#e43d7c', '#dc6403');
const BloomIconMono = createBloomIcon('currentColor', 'currentColor');

export { BloomIconColor, BloomIconMono };
