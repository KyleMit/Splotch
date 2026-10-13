import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { styles as controlStyles } from './controls';
import {
  AiStylePreview,
  AI_STYLE_TILE_WIDTH_PX,
  AI_STYLE_TILE_BORDER_PX,
} from '../ai/AiStylePreview';
import { AI_STYLES, type AiStyle } from '../ai/contract';

export function RsdAiStyleChoices({
  selected,
  disabled,
  onChoose,
}: {
  selected: AiStyle;
  disabled: boolean;
  onChoose: (style: AiStyle) => void;
}) {
  return (
    <html.div role="radiogroup" aria-label="AI art style" style={controlStyles.row}>
      {AI_STYLES.map((style) => (
        <html.button
          key={style}
          role="radio"
          aria-label={`${style} AI style`}
          aria-checked={selected === style}
          disabled={disabled}
          aria-disabled={disabled}
          onClick={() => onChoose(style)}
          style={[
            styles.tile,
            styles.tileSize(AI_STYLE_TILE_WIDTH_PX, AI_STYLE_TILE_BORDER_PX),
            selected === style && styles.selected,
            disabled && controlStyles.disabled,
          ]}
        >
          <AiStylePreview style={style} />
          <html.span>{style}</html.span>
          <html.span>{selected === style ? 'Selected' : 'Choose'}</html.span>
        </html.button>
      ))}
    </html.div>
  );
}

const styles = css.create({
  tile: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: dimensions.touchTarget,
    padding: dimensions.space3,
    gap: dimensions.space3,
    borderRadius: dimensions.radiusMd,
    borderStyle: 'solid',
    borderColor: colors.paper,
    backgroundColor: colors.paper,
    color: colors.text,
    fontSize: dimensions.fontSizeMd,
  },
  tileSize: (width: number, borderWidth: number) => ({ width, borderWidth }),
  selected: { borderColor: colors.brandSolid },
});
