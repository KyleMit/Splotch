import { Component, Fragment, type ReactNode } from 'react';
import { RsdSurfaceFailure } from './RsdSurfaceFailure';

export const SURFACE_FAILURE_LABEL = 'Did not load';
export const SURFACE_FAILURE_MESSAGE = 'This did not load. Check your connection and try again.';

type Props = { onClose?: () => void; onDismiss?: () => void; children: ReactNode };
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

  private dismissed = () => {
    this.setState({ closed: true });
    this.props.onDismiss?.();
  };

  render() {
    if (this.state.closed) return null;
    if (!this.state.failed)
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <RsdSurfaceFailure
        visible={!this.state.closing}
        label={SURFACE_FAILURE_LABEL}
        message={SURFACE_FAILURE_MESSAGE}
        onClose={this.close}
        onDismiss={this.dismissed}
        onRetry={this.retry}
      />
    );
  }
}
