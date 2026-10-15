import { lazySurface } from './lazySurface';

export const RsdStepNumber = lazySurface(() =>
  import('./RsdStepNumberContent').then((module) => module.RsdStepNumber)
);
