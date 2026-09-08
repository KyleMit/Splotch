import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '$lib/appVersion';
import { failureReportRows } from './failureReport';

describe('failureReportRows', () => {
  it('previews the exact diagnostic fields used in the report message', () => {
    expect(
      failureReportRows(
        { status: 503, endpoint: '/api/generate-image', message: 'Unavailable' },
        2,
        'Magical'
      )
    ).toEqual([
      { label: 'Error', value: '503 · /api/generate-image' },
      { label: 'Message', value: 'Unavailable' },
      { label: 'Attempts', value: '2 in a row' },
      { label: 'App version', value: `${APP_VERSION} (web)` },
      { label: 'Art style', value: 'Magical' },
    ]);
  });

  it('keeps large server errors below the report message cap', () => {
    const rows = failureReportRows(
      { status: null, endpoint: '/api/generation-result', message: 'x'.repeat(10000) },
      1,
      null
    );
    expect(rows.map(({ label, value }) => `${label}: ${value}`).join('\n').length).toBeLessThan(
      4000
    );
    expect(rows[0].value).toBe('No response · /api/generation-result');
    expect(rows.at(-1)?.value).toBe('Default');
  });
  it('normalizes multiline upstream errors into one previewed report row', () => {
    const rows = failureReportRows(
      {
        status: 502,
        endpoint: '/api/generate-image',
        message: '  <html>\n<head>502 Bad Gateway</head>\r\n<body>\tnginx</body>\n</html>  ',
      },
      1,
      'Crayon'
    );
    expect(rows[1]).toEqual({
      label: 'Message',
      value: '<html> <head>502 Bad Gateway</head> <body> nginx</body> </html>',
    });
    expect(
      rows
        .map(({ label, value }) => `${label}: ${value}`)
        .join('\n')
        .split('\n')
    ).toHaveLength(rows.length);
  });
});
