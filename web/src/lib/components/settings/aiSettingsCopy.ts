export const AI_CREATE_LABEL = 'Create AI Images';
export const AI_CREATE_HELP = {
  off: 'Turns a finished drawing into an AI picture based on it.',
  on: 'A finished drawing can now be turned into an AI picture based on it.',
} as const;

export const AI_CUSTOMIZATION_LABEL = 'Customize AI Style';
export const AI_CUSTOMIZATION_HELP =
  'Offers a small set of distinct styles to pick from before the picture is generated.';

export const AI_AUTO_SAVE_LABEL = 'Auto-Save AI Images';
// The folder half is only true where Settings shows the "Save drawings to" row (File System Access
// support); every other web browser saves AI pictures as downloads.
export function aiAutoSaveHelp(canChooseFolder: boolean) {
  if (__IS_CAPACITOR__) return 'Saves each AI picture and the drawing behind it to your photos';
  return canChooseFolder
    ? 'Saves each AI picture and the drawing behind it to your downloads, or to your chosen folder'
    : 'Saves each AI picture and the drawing behind it to your downloads';
}
