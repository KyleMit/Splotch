import { css, html } from 'react-strict-dom';
import { RsdButton } from './RsdButton';
import { RsdSettingCard, RsdSettingGroup } from './RsdSettingCard';
import { colors, dimensions } from './tokens.css';
import { PARENT_CENTER_COPY } from '../parentCenter/parentCenterCopy';

const LOCK_LINE_HEIGHT = 1.5;

const styles = css.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: dimensions.space3,
  },
  copy: {
    margin: 0,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: LOCK_LINE_HEIGHT,
  },
});

// The shipping ParentCenterLock: stands in for the Parent Center controls wherever the section is
// on screen without a solved check, since reaching these controls is itself the gated operation.
export function RsdParentCenterLock({ onUnlock }: { onUnlock: () => void }) {
  return (
    <RsdSettingGroup>
      <RsdSettingCard>
        <html.div style={styles.body}>
          <html.p style={styles.copy}>{PARENT_CENTER_COPY.lock}</html.p>
          <RsdButton variant="brand" onPress={onUnlock}>
            {PARENT_CENTER_COPY.unlock}
          </RsdButton>
        </html.div>
      </RsdSettingCard>
    </RsdSettingGroup>
  );
}
