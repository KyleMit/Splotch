import { describe, expect, it } from 'vitest';
import { collectEpicChildren, formatEpicChildren } from '../show-epic-children.mjs';

function child(number, title, state = 'open') {
  return {
    number,
    title,
    state,
    labels: [{ name: 'type:chore' }],
    assignees: [],
    html_url: `https://github.com/KyleMit/Splotch/issues/${number}`,
  };
}

describe('show-epic-children', () => {
  it('walks nested children and reconciles parent counts with unique descendants', () => {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      const path = args[1];
      if (path === 'repos/KyleMit/Splotch/issues/10')
        return JSON.stringify({ number: 10, title: 'Epic' });
      if (path.endsWith('/10/sub_issues'))
        return [child(11, 'First'), child(12, 'Second')].map(JSON.stringify).join('\n');
      if (path.endsWith('/11/sub_issues')) return JSON.stringify(child(13, 'Nested'));
      if (path.endsWith('/12/sub_issues')) return JSON.stringify(child(13, 'Nested'));
      if (path.endsWith('/13/sub_issues')) return '';
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    };
    const inventory = collectEpicChildren({ number: 10, repository: 'KyleMit/Splotch', run });
    expect(inventory.parents).toEqual([
      { number: 10, count: 2 },
      { number: 11, count: 1 },
      { number: 12, count: 1 },
      { number: 13, count: 0 },
    ]);
    expect(inventory.children.map((issue) => issue.number)).toEqual([11, 12, 13]);
    expect(inventory.duplicates).toEqual([{ number: 13, parent: 12, firstParent: 11 }]);
    expect(calls.filter((args) => args.includes('--paginate'))).toHaveLength(4);
    expect(formatEpicChildren(inventory)).toContain('Unique descendants: 3');
  });

  it('fails on an incomplete child instead of silently dropping it', () => {
    const run = (args) =>
      args[1].endsWith('/sub_issues')
        ? JSON.stringify({ number: 11, title: 'Missing state' })
        : JSON.stringify({ number: 10, title: 'Epic' });
    expect(() => collectEpicChildren({ number: 10, repository: 'KyleMit/Splotch', run })).toThrow(
      'Sub-issue response for parent 10 is incomplete'
    );
  });
});
