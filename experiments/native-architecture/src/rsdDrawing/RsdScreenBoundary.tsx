import { Component, type ReactNode } from 'react';
import { ERROR_LOG_PREFIX } from '../../../../web/src/lib/errorLog';
import { RsdCrashScreen } from './drawingSheets';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';

type State = { failed: boolean };

// Shipping's root render boundary (+layout.svelte's <svelte:boundary>): a render error anywhere in
// the drawing screen is logged under shipping's prefix and swaps the screen for the Error Screen,
// whose Start over renders the screen again. The boundary sits under the drawing session, so the
// picture and its Undo come back with the screen, as shipping's engine keeps its drawing across
// that remount. The Error Screen loads from its own chunk on the web, inside a boundary of its own.
export class RsdScreenBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(ERROR_LOG_PREFIX.render, error);
  }

  private restart = async () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <RsdSurfaceBoundary>
        <RsdCrashScreen onRestart={this.restart} />
      </RsdSurfaceBoundary>
    );
  }
}
