import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Tab bar icons matching the mobile web UI (MobileTabs.tsx). */
export const TAB_ICON_PATHS = {
  events: 'M4 4h16v16H4z M4 9h16 M9 9v11',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
  settings: 'M4 6h16 M4 12h16 M4 18h16',
} as const;

export default function TabIcon({
  d,
  color,
  size,
}: {
  d: string;
  color: string;
  size: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
    >
      <Path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
