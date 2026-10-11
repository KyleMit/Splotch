import { html } from 'react-strict-dom';
import { RsdAction, styles as rsdStyles } from '../rsdDrawing/controls';
import { useLibraryControls } from './LibraryScope';
import { librarySummary, libraryActions } from './controls';
export function RsdLibraryControls() {
  const library = useLibraryControls();
  if (!library) return null;
  return (
    <html.div style={rsdStyles.stack}>
      <html.span>Offline coloring library</html.span>
      <html.span aria-live="polite">{librarySummary(library.state)}</html.span>
      <html.span>
        Downloads pause while drawing or when the app is in the background. Saved pictures keep
        their artwork.
      </html.span>
      {libraryActions(library).map((action) => (
        <RsdAction
          key={action.label}
          label={action.label}
          disabled={action.disabled}
          onClick={action.run}
        />
      ))}
    </html.div>
  );
}
