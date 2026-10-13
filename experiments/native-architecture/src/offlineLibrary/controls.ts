import type { LibraryContext } from './LibraryScope';
import type { LibrarySnapshot } from './controller';
export function librarySummary(state: LibrarySnapshot) {
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  if (state.status === 'downloading')
    return `${state.message} ${Math.floor((100 * state.completedBytes) / state.totalBytes)}%.`;
  const installedBytes = state.installed.reduce((bytes, pack) => bytes + pack.bytes, 0);
  return [
    state.message,
    `${state.installed.length} downloaded books, ${megabytes(installedBytes)} MB. ${megabytes(state.retainedBytes)} MB kept for pictures.`,
  ]
    .filter(Boolean)
    .join(' ');
}
export function libraryActions(library: LibraryContext) {
  const { state, owner, remove } = library;
  const disabled = state.status === 'loading' || state.status === 'removing';
  return [
    {
      label: state.enabled
        ? 'Pause automatic coloring downloads'
        : 'Enable automatic coloring downloads',
      disabled,
      run: () => {
        void owner.setPolicy(!state.enabled, state.allowMetered);
      },
    },
    {
      label: state.allowMetered
        ? 'Use Wi-Fi for coloring downloads'
        : 'Allow mobile data for coloring downloads',
      disabled,
      run: () => {
        void owner.setPolicy(state.enabled, !state.allowMetered);
      },
    },
    ...(state.status === 'downloading'
      ? [{ label: 'Cancel coloring download', disabled: false, run: () => owner.cancel() }]
      : [{ label: 'Retry coloring downloads', disabled, run: () => owner.retry() }]),
    {
      label: 'Remove downloaded books',
      disabled,
      run: () => {
        void remove();
      },
    },
  ];
}
