import { Composition } from 'remotion';
import { NinetyDays, NINETY_DAYS_FRAMES } from './NinetyDays';

export const Root = () => (
  <Composition id="NinetyDays" component={NinetyDays} durationInFrames={NINETY_DAYS_FRAMES} fps={30} width={1080} height={1920} />
);
