import { useEffect, useState } from 'react';
import { css, html } from 'react-strict-dom';
import { folderSaveSupported } from './folderSaveSupport.web';
import { browserFolderSave } from './browserFolderSaveLoader';
import { RsdSettingCard } from '../rsdDrawing/RsdSettingCard';
import { RsdButton } from '../rsdDrawing/RsdButton';
import { RsdIcon } from '../rsdDrawing/RsdIcon';
import { RsdPressable } from '../rsdDrawing/RsdPressable';
import { colors, dimensions, fonts } from '../rsdDrawing/tokens.css';
import { SETTING_ICON_PX } from '../rsdDrawing/RsdToggleRow';

const FORGET_ICON_PX = 13;
const FORGET_PADDING_PX = 11;
const styles = css.create({
  row: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space3,
  },
  label: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.settingIconGap,
    minWidth: 0,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    minWidth: 0,
    maxWidth: '100%',
  },
  forget: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: dimensions.touchTargetMin,
    height: dimensions.touchTargetMin,
    margin: -FORGET_PADDING_PX,
    padding: FORGET_PADDING_PX,
    backgroundClip: 'content-box',
    borderWidth: 0,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.surface,
    color: colors.textSoft,
    cursor: 'pointer',
  },
});

export function SaveFolderSetting() {
  const supported = folderSaveSupported();
  const [folder, setFolder] = useState<
    Awaited<ReturnType<typeof browserFolderSave.load>>['folderSave'] | null
  >(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!supported) return;
    let disposed = false;
    let stop = () => {};
    void browserFolderSave
      .load()
      .then(({ folderSave }) => {
        if (disposed) return;
        setFolder(folderSave);
        folderSave.setSaveFolderClearedListener(() => setName(null));
        stop = () => folderSave.setSaveFolderClearedListener(() => {});
        return folderSave.getSaveFolderName().then((value) => {
          if (!disposed) setName(value);
        });
      })
      .catch((error: unknown) => console.warn('Folder saving is unavailable.', error));
    return () => {
      disposed = true;
      stop();
    };
  }, [supported]);
  if (!supported) return null;
  const choose = () =>
    void folder?.chooseSaveFolder().then((value) => {
      if (value) setName(value);
    });
  const clear = () => void folder?.clearSaveFolder().then(() => setName(null));
  return (
    <RsdSettingCard>
      <html.div data-testid="save-folder-setting" style={styles.row}>
        <html.div style={styles.label}>
          <RsdIcon name="folder" size={SETTING_ICON_PX} ink={undefined} muted={false} />
          <html.span>Save drawings to</html.span>
        </html.div>
        <html.div style={styles.actions}>
          <RsdButton
            variant={name ? 'wash' : 'brand'}
            size="sm"
            pill
            disabled={!folder}
            onPress={choose}
          >
            {name ?? 'Choose folder'}
          </RsdButton>
          {name ? (
            <RsdPressable
              type="button"
              role="button"
              aria-label="Forget folder"
              style={styles.forget}
              onClick={clear}
            >
              <RsdIcon name="close" size={FORGET_ICON_PX} ink={undefined} muted={false} />
            </RsdPressable>
          ) : null}
        </html.div>
      </html.div>
    </RsdSettingCard>
  );
}
