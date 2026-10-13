import { css, html } from 'react-strict-dom';
import { CLEAR_DOCK_OVERHANG_PX, type ClearDock } from '../clear/clearDock';
import { RsdIcon } from './RsdIcon';
import { fixedColors } from './tokens.css';
import { styles } from './controls';

// The face's shape and finish, from ClearButton.svelte's .clear-button: a half-disc tab docked to
// the screen edge, a full disc once lifted, and the alarm gradient and glow past the accept ring.
// The coachmark ghost is ClearCoachmark.svelte's .coachmark-button. native-clear-projection.test.mjs
// holds every shadow and gradient here to those stylesheets.
export type ClearFaceState = 'docked' | 'lifted' | 'deleteReady' | 'ghost';

const faceStyles = css.create({
  face: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The tab's square edge runs off screen; only the left corners round.
  docked: (size: number) => ({
    width: size,
    height: size,
    borderTopLeftRadius: size / 2,
    borderBottomLeftRadius: size / 2,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  }),
  round: (size: number) => ({
    width: size,
    height: size,
    borderTopLeftRadius: size / 2,
    borderBottomLeftRadius: size / 2,
    borderTopRightRadius: size / 2,
    borderBottomRightRadius: size / 2,
  }),
  // A finish per state, each naming its own background. On native RSD files a literal gradient
  // and a variable one under different keys and resolves the variable last, so a later literal
  // gradient cannot override an earlier token one.
  dockedFinish: {
    backgroundImage: fixedColors.clearGradientRest,
    boxShadow: '-4px 4px 20px rgba(0, 0, 0, 0.3)',
  },
  liftedFinish: {
    backgroundImage: fixedColors.clearGradientRest,
    boxShadow: '-6px 6px 30px rgba(0, 0, 0, 0.4)',
  },
  deleteReadyFinish: {
    backgroundImage: 'linear-gradient(135deg, rgb(255, 56, 56), #d63031)',
    boxShadow: '0 6px 40px rgba(255, 56, 56, 0.6)',
  },
  ghostFinish: {
    backgroundImage: fixedColors.clearGradientRest,
    boxShadow: '-6px 6px 24px rgba(0, 0, 0, 0.35)',
  },
  // A flex-centred item moves by half its margin, so the whole overhang centres the lid on the
  // visible half-disc rather than on the full box.
  lid: (marginRight: number) => ({ display: 'flex', marginRight }),
});

const FINISH = {
  docked: faceStyles.dockedFinish,
  lifted: faceStyles.liftedFinish,
  deleteReady: faceStyles.deleteReadyFinish,
  ghost: faceStyles.ghostFinish,
} satisfies Record<ClearFaceState, unknown>;

export function RsdClearFace({
  dock,
  state,
  disabled,
}: {
  dock: ClearDock;
  state: ClearFaceState;
  disabled: boolean;
}) {
  const docked = state === 'docked';
  return (
    <html.div
      data-testid={state === 'ghost' ? 'rsd-clear-ghost-face' : 'rsd-clear-face'}
      style={[
        faceStyles.face,
        docked ? faceStyles.docked(dock.size) : faceStyles.round(dock.size),
        FINISH[state],
        disabled && styles.disabled,
      ]}
    >
      <html.div
        data-testid="rsd-clear-lid"
        style={faceStyles.lid(docked ? CLEAR_DOCK_OVERHANG_PX : 0)}
      >
        <RsdIcon
          name={docked ? 'trash-closed' : 'trash-open'}
          size={dock.iconSize}
          ink={undefined}
          muted={false}
        />
      </html.div>
    </html.div>
  );
}
