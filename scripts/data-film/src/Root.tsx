import { Composition } from 'remotion';
import { NinetyDays, NINETY_DAYS_FRAMES } from './NinetyDays';
import { Wednesdays, WEDNESDAYS_FRAMES } from './Wednesdays';
import { Notes, NOTES_FRAMES } from './Notes';
import { Pairs, PAIRS_FRAMES } from './Pairs';
import { Month, MONTH_FRAMES } from './Month';
import { BigNumber, NUMBER_FRAMES } from './Number';
import { Paper, PAPER_FRAMES } from './Paper';

// Story format: 1080 x 1920 at 30fps, with 250px kept clear top and bottom.
const story = { fps: 30, width: 1080, height: 1920 };

export const Root = () => (
  <>
    <Composition id="NinetyDays" component={NinetyDays} durationInFrames={NINETY_DAYS_FRAMES} {...story} />
    <Composition id="Wednesdays" component={Wednesdays} durationInFrames={WEDNESDAYS_FRAMES} {...story} />
    <Composition id="Notes" component={Notes} durationInFrames={NOTES_FRAMES} {...story} />
    <Composition id="Pairs" component={Pairs} durationInFrames={PAIRS_FRAMES} {...story} />
    <Composition id="Month" component={Month} durationInFrames={MONTH_FRAMES} {...story} />
    <Composition id="Number" component={BigNumber} durationInFrames={NUMBER_FRAMES} {...story} />
    <Composition id="Paper" component={Paper} durationInFrames={PAPER_FRAMES} {...story} />
  </>
);
