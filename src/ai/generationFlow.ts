import { JOB_TTL_MS, type AiStyle } from './contract';
import { NativeAiController } from './generationController';
import { aiJournalWaiting } from './uiState';
import type { AiJournal } from './journal';
import type { AiSessionDependencies, AiState } from './sessionContract';
import { createAiProblemReport, problemReportRows } from './problemReport';

function expired(journal: AiJournal) {
  return Date.now() - journal.createdAt >= JOB_TTL_MS;
}

// The shipping AI flow on top of the generation owner: the AI Image Button, the AI Style Prompt
// and the AI Result card's own actions.
export class NativeAiFlow extends NativeAiController {
  private onSetup: (() => void) | null = null;
  private problemPlatform = '';
  constructor(deps: AiSessionDependencies) {
    super(deps);
    if (deps.problems) {
      this.problemPlatform = deps.problems.platform;
      this.problems = createAiProblemReport({
        ...deps.problems,
        parent: deps.parent,
        publish: (problem) => this.update({ problem }),
      });
      this.state = { ...this.state, problem: { phase: 'idle' } };
    }
  }
  // A run still being sent tucks into the corner too, not only one the server has taken.
  override minimize = () => {
    if (
      !this.state.open ||
      !(aiJournalWaiting(this.state) || this.state.attempt?.kind === 'starting')
    )
      return;
    this.reports.cancel();
    this.update({ minimized: true });
  };
  // The run whose result card was closed on purpose, so its picture is not offered again. Only the
  // latest run is ever offered, so one id is enough.
  private dismissedId: number | null = null;
  private dismissalRead = false;
  protected needsSetup = () => {
    const setup = this.onSetup;
    this.close();
    setup?.();
  };
  // The AI Image Button. A run waiting in the corner claims the tap and is shown again without a
  // second check, since the grown-up already answered one to start it. Otherwise a grown-up
  // answers first, as shipping asks at the tap, before anything is read or sent: an attempt held
  // past its server retention is released, and the AI Style Prompt opens, or, with no credential
  // and no free picture left, `onSetup` sends
  // the grown-up to the AI Art settings instead.
  // With style choice off (`customize`), the run starts with no style instead, as shipping's does.
  start = ({ onSetup, customize }: { onSetup: () => void; customize: boolean }) => {
    this.onSetup = onSetup;
    if (this.state.minimized) {
      this.restore();
      return;
    }
    if (!this.deps.parent || this.active || this.state.open) return;
    this.protect(() => {
      void this.begin(onSetup, customize);
    });
  };
  private begin = async (onSetup: () => void, customize: boolean) => {
    const proof = this.authorization;
    await this.load();
    await this.readDismissal();
    const permitted = () => proof === this.authorization && this.consented() && !this.disposed;
    if (!permitted()) return;
    const journal = this.state.journal;
    if (journal && aiJournalWaiting(this.state) && expired(journal))
      await this.releaseHeld(journal);
    if (!permitted()) return;
    const waiting = this.state.journal && aiJournalWaiting(this.state) ? this.state.journal : null;
    const shown = waiting ?? this.undismissedResult();
    if (shown || this.state.recovery || this.state.retryAt > Date.now()) {
      this.update({
        open: true,
        minimized: false,
        view: 'result',
        attempt: shown ? { kind: 'journal', id: shown.id } : { kind: 'stopped' },
      });
      this.pollStarted = Date.now();
      this.schedule(0);
      return;
    }
    if (!aiUsable(this.state)) {
      onSetup();
      return;
    }
    if (customize) {
      this.update({ open: true, minimized: false, view: 'prompt', attempt: null });
      return;
    }
    this.styled = false;
    this.update({ open: true, minimized: false, view: 'result', attempt: null });
    this.run();
  };
  // A finished picture nobody dismissed (it landed while the app was in the background)
  // comes back on the next wand tap however long ago it was made: the server's retention bounds
  // collecting it, not the copy already kept here, as shipping keeps a collected picture until its
  // card is closed.
  private undismissedResult = () => {
    const journal = this.state.journal;
    const picture = this.state.heldResult ?? journal?.result;
    if (!journal || !picture || journal.id === this.dismissedId) return null;
    return journal;
  };
  // An unreadable record offers the picture again rather than hiding one nobody closed.
  private readDismissal = async () => {
    if (this.dismissalRead || !this.deps.dismissal) return;
    const raw = await this.deps.dismissal.read().catch(() => undefined);
    if (raw === undefined) return;
    this.dismissalRead = true;
    const id = Number(raw);
    if (this.dismissedId === null && Number.isSafeInteger(id) && id > 0) this.dismissedId = id;
  };
  // The result card's own close, Keep drawing and send-off: the run is done with, so its picture
  // is not brought back by the next wand tap.
  dismiss = () => {
    const journal = this.state.journal;
    if (journal && this.state.attempt?.kind === 'journal') {
      this.dismissedId = journal.id;
      void this.deps.dismissal?.write(String(journal.id)).catch(() => {});
    }
    this.close();
  };
  // Report a problem: the last failure's bounded details go to a grown-up's confirmation.
  reportProblem = () => {
    if (!this.state.open || this.state.view !== 'result') return;
    this.problems?.request(
      problemReportRows(
        this.state.failure,
        this.state.failures,
        this.styled ? this.state.style : null,
        this.problemPlatform
      )
    );
  };
  setProblemDevice = (includeDevice: boolean) => this.problems?.setIncludeDevice(includeDevice);
  sendProblemReport = () => this.problems?.send();
  cancelProblemReport = () => this.problems?.cancel();
  retryProblemReport = () => this.problems?.retry();
  // A style chosen on the AI Style Prompt starts the run at once, and the AI Result takes over.
  pickStyle = (style: AiStyle) => {
    if (!this.state.open || this.state.view !== 'prompt' || this.active) return;
    this.styled = true;
    this.update({ style, view: 'result' });
    this.run();
  };
  // The error card's Try again: the same style and the same drawing the failed run sent.
  retry = () => {
    if (!this.state.open || this.state.view !== 'result' || this.active || this.unresolved())
      return;
    this.run(true);
  };
  private run = (again = false) => {
    const go = () => {
      this.problems?.reset();
      this.update({ attempt: { kind: 'starting', startedAt: Date.now() }, minimized: false });
      void this.loadThenGenerate(again).then(() => {
        if (this.state.attempt?.kind === 'starting') this.update({ attempt: { kind: 'stopped' } });
      });
    };
    // The grown-up's answer lasts until another check is dismissed; past that, a new run asks
    // again before anything is sent, as the wand would.
    if (this.consented()) go();
    else this.protect(go);
  };
  // Showing a waiting run again checks on it at once; its wait still ends at the poll deadline
  // counted from its ticket. A run held past its server window is released first, so the card
  // offers a new run rather than a dial that can never finish.
  restore = () => {
    if (!this.state.open || !this.state.minimized) return;
    this.update({ minimized: false });
    const journal = this.state.journal;
    if (journal && aiJournalWaiting(this.state) && expired(journal) && !this.active) {
      void this.releaseHeld(journal);
      return;
    }
    if (this.state.journal?.jobId && !this.active && this.unresolved() && this.consented())
      this.schedule(0);
  };
}

// A saved key or access code, or a free allowance with pictures left.
function aiUsable(state: AiState) {
  if (state.availability !== 'ready') return false;
  if (state.credential === 'byok' || state.credential === 'managed') return true;
  return state.credential === 'free' && state.remaining !== null && state.remaining > 0;
}
