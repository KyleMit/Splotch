import { createElement, type ComponentProps } from 'react';
import { css, html } from 'react-strict-dom';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdStepNumber as StepNumber } from './RsdStepNumberContent';
import { STEP_NUMBER_SIZE_PX } from './stepNumberSize';

const badge = createLazyExport(() =>
  import('./RsdStepNumberContent').then((module) => module.RsdStepNumber)
);
const whole = (loaded: typeof StepNumber) => loaded;
const styles = css.create({
  placeholder: (size: number) => ({ width: size, height: size, flexShrink: 0 }),
});

export function RsdStepNumber(props: ComponentProps<typeof StepNumber>) {
  const Loaded = useLazyValue(badge, whole, 'The step number');
  return Loaded ? (
    createElement(Loaded, props)
  ) : (
    <html.div aria-hidden style={styles.placeholder(STEP_NUMBER_SIZE_PX[props.size])} />
  );
}
