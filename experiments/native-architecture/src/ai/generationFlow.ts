import { JOB_TTL_MS, type AiStyle } from './contract';
import { NativeAiController } from './generationController';
import { aiJournalWaiting } from './uiState';
import type { AiState } from './sessionContract';

// The shipping AI flow on top of the generation owner: the AI Image Button, the AI Style Prompt
// and the AI Result card's own actions.
export class NativeAiFlow extends NativeAiController {
  // The AI Image Button. A run waiting in the corner claims the tap and is shown again without a
  // second check, since the grown-up already answered one to start it. Otherwise a grown-up
  // answers first, as shipping asks at the tap, before anything is read or sent: a run left
  // waiting before a reload reopens, an attempt held past its server retention is released, and
  // the AI Style Prompt opens, or, with no credential and no free picture left, `onSetup` sends
  // the grown-up to the AI Art settings instead.
  start = (onSetup: () => void) => {
    if (this.state.minimized) {
      this.restore();
      return;
    }
    if (!this.deps.parent || this.active || this.state.open) return;
    this.protect(() => {
      void this.begin(onSetup);
    });
  };
  private begin = async (onSetup: () => void) => {
    const proof = this.authorization;
    await this.load();
    const permitted = () => proof === this.authorization && this.consented() && !this.disposed;
    if (!permitted()) return;
    const journal = this.state.journal;
    if (journal && aiJournalWaiting(this.state) && Date.now() - journal.createdAt >= JOB_TTL_MS)
      await this.releaseHeld(journal);
    if (!permitted()) return;
    const waiting = this.state.journal && aiJournalWaiting(this.state) ? this.state.journal : null;
    if (waiting || this.state.recovery || this.state.retryAt > Date.now()) {
      this.update({
        open: true,
        minimized: false,
        view: 'result',
        attempt: waiting ? { kind: 'journal', id: waiting.id } : { kind: 'stopped' },
      });
      this.pollStarted = Date.now();
      this.schedule(0);
      return;
    }
    if (!aiUsable(this.state)) {
      onSetup();
      return;
    }
    this.update({ open: true, minimized: false, view: 'prompt', attempt: null });
  };
  // A style chosen on the AI Style Prompt starts the run at once, and the AI Result takes over.
  pickStyle = (style: AiStyle) => {
    if (!this.state.open || this.state.view !== 'prompt' || this.active) return;
    this.update({ style, view: 'result' });
    this.run();
  };
  // The error card's Try again: the same style, with the drawing as it is now.
  retry = () => {
    if (!this.state.open || this.state.view !== 'result' || this.active || this.unresolved())
      return;
    this.run();
  };
  private run = () => {
    // The grown-up's answer lasts until another check is dismissed; past that, the wand is the
    // way back in rather than a check the child did not ask for.
    if (!this.consented()) {
      this.close();
      return;
    }
    this.update({ attempt: { kind: 'starting', startedAt: Date.now() }, minimized: false });
    void this.generateAuthorized().then(() => {
      if (this.state.attempt?.kind === 'starting') this.update({ attempt: { kind: 'stopped' } });
    });
  };
  // Showing a waiting run again checks on it at once, which is how a poll that gave up is resumed.
  restore = () => {
    if (!this.state.open || !this.state.minimized) return;
    this.update({ minimized: false });
    if (this.state.journal?.jobId && !this.active && this.unresolved() && this.consented()) {
      this.pollStarted = Date.now();
      this.schedule(0);
    }
  };
}

// A saved key or access code, or a free allowance with pictures left.
function aiUsable(state: AiState) {
  if (state.availability !== 'ready') return false;
  if (state.credential === 'byok' || state.credential === 'managed') return true;
  return state.credential === 'free' && state.remaining !== null && state.remaining > 0;
}
