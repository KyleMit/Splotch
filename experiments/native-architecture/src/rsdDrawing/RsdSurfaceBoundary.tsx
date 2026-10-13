import { Component, Fragment, type ReactNode } from 'react';
import { html } from 'react-strict-dom';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdAction, styles } from './controls';

export const SURFACE_FAILURE_LABEL = 'Did not load';
export const SURFACE_FAILURE_MESSAGE = 'This did not load. Check your connection and try again.';

type Props = { onClose?: () => void; children: ReactNode };
type State = { failed: boolean; closing: boolean; closed: boolean; attempt: number };

// A surface the drawing screen opens on request loads its own chunk on web (drawingSheets.web.ts),
// so it can fail where the drawing screen did not: offline before the service worker has
// installed. The failure stays inside the surface; Try again remounts it, which loads again.
// Shipping has no load-failure dialog of its own, so the frame's Close is the only way out besides
// Try again.
export class RsdSurfaceBoundary extends Component<Props, State> {
  state: State = { failed: false, closing: false, closed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('A drawing screen surface failed to load:', error);
  }

  private retry = () => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }));

  private close = () => {
    if (this.state.closing) return;
    this.setState({ closing: true });
    this.props.onClose?.();
  };

  private dismissed = () => this.setState({ closed: true });

  render() {
    if (this.state.closed) return null;
    if (!this.state.failed)
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <ModalShell
        visible={!this.state.closing}
        label={SURFACE_FAILURE_LABEL}
        size="confirm"
        onClose={this.close}
        onDismiss={this.dismissed}
        header={<DialogHeader title={SURFACE_FAILURE_LABEL} titleSize="xl" onClose={this.close} />}
      >
        <html.div style={styles.dialogContent}>
          <html.span aria-live="polite">{SURFACE_FAILURE_MESSAGE}</html.span>
          <RsdAction label="Try again" onClick={this.retry} />
        </html.div>
      </ModalShell>
    );
  }
}
