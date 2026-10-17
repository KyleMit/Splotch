import type { ComponentProps } from 'react';
import { html } from 'react-strict-dom';

export type HubTitleProps = {
  children: string;
  style: ComponentProps<typeof html.span>['style'];
};

export const HubTitle = html.span;
