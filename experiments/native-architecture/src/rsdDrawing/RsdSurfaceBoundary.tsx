import { Component, Fragment, type ReactNode } from 'react';
import { html } from 'react-strict-dom';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';

export const SURFACE_FAILURE_LABEL = 'Did not load';
export const SURFACE_FAILURE_MESSAGE = 'This did not load. Check your connection and try again.';

type Props = { onClose?: () => void; children: ReactNode };
type State = { failed: boolean; closed: boolean; attempt: number };

// A surface the drawing screen opens on request loads its own chunk on web (drawingSheets.web.ts),
// so it can fail where the drawing screen did not: offline before the service worker has
// installed. The failure stays inside the surface; Try again remounts it, which loads again.
export class RsdSurfaceBoundary extends Component<Props, State> {
  state: State = { failed: false, closed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('A drawing screen surface failed to load:', error);
  }

  private retry = () => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }));

  private close = () => {
    this.setState({ closed: true });
    this.props.onClose?.();
  };

  render() {
    if (this.state.closed) return null;
    if (!this.state.failed)
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <NativeDialog
        visible
        label={SURFACE_FAILURE_LABEL}
        onClose={this.close}
        footer={
          <html.div style={styles.row}>
            <RsdAction label="Try again" onClick={this.retry} />
            <RsdAction label="Keep drawing" onClick={this.close} />
          </html.div>
        }
      >
        <html.div style={styles.dialogContent}>
          <html.span aria-live="polite">{SURFACE_FAILURE_MESSAGE}</html.span>
        </html.div>
      </NativeDialog>
    );
  }
}
