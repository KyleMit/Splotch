import { describe, expect, it } from 'vitest';
import { createImageReportFlow, type ImageReportFlow } from './imageReportFlow.svelte';

const REPORT_BUTTON = { x: 120, y: 480 };

function snapshot(report: ImageReportFlow) {
  return { status: report.status, origin: report.origin, settled: report.settled };
}

function confirming() {
  const report = createImageReportFlow();
  report.request(REPORT_BUTTON);
  return report;
}

describe('createImageReportFlow', () => {
  it('starts idle, with nothing to fly in from and no outcome', () => {
    expect(snapshot(createImageReportFlow())).toEqual({
      status: 'idle',
      origin: null,
      settled: false,
    });
  });

  it('opens the confirmation from the Report control that requested it', () => {
    expect(snapshot(confirming())).toEqual({
      status: 'confirm',
      origin: REPORT_BUTTON,
      settled: false,
    });
  });

  it('closes the confirmation on cancel', () => {
    const report = confirming();

    report.cancel();

    expect(report.status).toBe('idle');
  });

  it('ignores cancel while the send is on the wire', () => {
    const report = confirming();
    report.begin();

    report.cancel();

    expect(snapshot(report)).toEqual({ status: 'busy', origin: REPORT_BUTTON, settled: false });
  });

  it('settles on success', () => {
    const report = confirming();
    report.begin();

    report.succeed();

    expect(snapshot(report)).toEqual({ status: 'success', origin: REPORT_BUTTON, settled: true });
  });

  it('settles on failure, and a retry reopens the confirmation from the same control', () => {
    const report = confirming();
    report.begin();

    report.fail();
    expect(snapshot(report)).toEqual({ status: 'error', origin: REPORT_BUTTON, settled: true });

    report.retry();
    expect(snapshot(report)).toEqual({
      status: 'confirm',
      origin: REPORT_BUTTON,
      settled: false,
    });
  });

  it.each<[string, (report: ImageReportFlow) => void]>([
    ['confirming', () => {}],
    ['sending', (report) => report.begin()],
    [
      'sent',
      (report) => {
        report.begin();
        report.succeed();
      },
    ],
    [
      'failed',
      (report) => {
        report.begin();
        report.fail();
      },
    ],
  ])('resets to a fresh report from %s', (_, reach) => {
    const report = confirming();
    reach(report);

    report.reset();

    expect(snapshot(report)).toEqual(snapshot(createImageReportFlow()));
  });
});
