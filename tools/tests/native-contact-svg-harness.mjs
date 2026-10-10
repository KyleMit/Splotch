import { createElement, forwardRef } from 'react';

const group = ({ children }) => createElement('div', null, children);
export {
  group as G,
  group as Defs,
  group as Mask,
  group as Pattern,
  group as Filter,
  group as LinearGradient,
};
export const Image = () => null;
export const Rect = () => null;
export const Stop = () => null;
export const Use = () => null;
export const FeBlend = () => null;
export const FeComposite = () => null;
export const Circle = ({ cx, cy }) => createElement('span', { 'data-ink': `${cx},${cy}` });
export const Path = ({ d }) => createElement('span', { 'data-ink': d });
export default forwardRef(({ children }, ref) => createElement('div', { ref }, children));
