import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { motion } from './tokens.css';
import {
  THUMB_TRAVEL_MS,
  thumbStyles,
  type Cell,
  type SegmentThumbProps,
} from './segmentThumbFace';

const styles = css.create({
  frame: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    pointerEvents: 'none',
  },
  stackedFrame: { bottom: 'auto', right: 0 },
  // A dynamic style: StyleX evaluates only this module's own constants statically.
  place: (x: number, width: number) => ({ width, transform: `translateX(${x}px)` }),
  placeStacked: (y: number, height: number) => ({ height, transform: `translateY(${y}px)` }),
  travels: (duration: string) => ({
    transitionProperty: 'transform, width, height',
    transitionDuration: duration,
    transitionTimingFunction: motion.easeGlide,
  }),
});

type Placement = { index: number; cell: Cell; stacked: boolean; travels: boolean };

// The shipping SegmentedPicker.svelte thumb on the web: placed by a transform, and slid between
// cells by a CSS transition (`.thumb-travels`) only when the selection moves, so it snaps on first
// placement, when a resize moves the cells, and under reduced motion. Reanimated stays out of the
// web export (ADR-0179).
export function SegmentThumb({ cell, index, stacked }: SegmentThumbProps) {
  const reduced = useReduceMotion();
  const [placed, setPlaced] = useState<Placement>({ index, cell, stacked, travels: false });
  if (placed.index !== index || placed.cell !== cell || placed.stacked !== stacked)
    setPlaced({
      index,
      cell,
      stacked,
      travels: placed.index !== index && placed.stacked === stacked,
    });
  return (
    <html.div
      aria-hidden
      data-testid="segment-thumb"
      style={[
        styles.frame,
        stacked ? styles.stackedFrame : null,
        stacked ? styles.placeStacked(cell.y, cell.height) : styles.place(cell.x, cell.width),
        // Read live: reduced motion switched on mid-glide stops the glide it is in.
        placed.travels && !reduced && styles.travels(`${THUMB_TRAVEL_MS}ms`),
      ]}
    >
      <html.div style={[thumbStyles.face, stacked && thumbStyles.stackedFace]} />
    </html.div>
  );
}
