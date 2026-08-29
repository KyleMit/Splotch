import { describe, expect, it } from 'vitest';
import {
  DESIGN_FILE_READ_LIMIT_BYTES,
  assetFileName,
  canvasBackgroundCss,
  collectStyleBlocks,
  designCardMarker,
  designSnapshotPath,
  extensionFor,
  isFullyTransparent,
  modalBackdropCss,
  oversizedSnapshots,
  rewriteReferences,
} from '../lib/design-snapshot.mjs';
import {
  describeChange,
  diffStylesheets,
  indexScopeOwners,
  parseDeclarations,
  selectorOwners,
  splitCssBlocks,
} from '../lib/design-port-back.mjs';
import { differingPixelPercent, parseSnapshotName } from '../verify-design-snapshots.mjs';

const asset = (fileName) => ({ fileName });

describe('rewriteReferences', () => {
  it('rewrites both the absolute URL and the bare path', () => {
    const assets = new Map([
      ['http://localhost:4319/icons/splotchy.svg', asset('assets/ab12.svg')],
    ]);

    expect(rewriteReferences('<img src="/icons/splotchy.svg">', assets, '../')).toBe(
      '<img src="../assets/ab12.svg">'
    );
    expect(
      rewriteReferences('<img src="http://localhost:4319/icons/splotchy.svg">', assets, '../')
    ).toBe('<img src="../assets/ab12.svg">');
  });

  // A reference whose path is a prefix of another's used to consume it and
  // leave the longer name's tail dangling in the middle of the rewritten URL.
  it('replaces the longest matching reference first', () => {
    const assets = new Map([
      ['http://localhost:4319/a.png', asset('assets/short.png')],
      ['http://localhost:4319/a.png.webp', asset('assets/long.webp')],
    ]);

    expect(rewriteReferences('<img src="/a.png.webp">', assets, '../')).toBe(
      '<img src="../assets/long.webp">'
    );
  });

  it('leaves unreferenced text alone', () => {
    const assets = new Map([['http://localhost:4319/logo.png', asset('assets/cd34.png')]]);

    expect(rewriteReferences('.a{color:red}/*/x/*/', assets, '../')).toBe('.a{color:red}/*/x/*/');
  });
});

describe('assetFileName', () => {
  it('content-addresses so one asset is stored once', () => {
    expect(assetFileName(Buffer.from('same'), 'png')).toBe(
      assetFileName(Buffer.from('same'), 'png')
    );
    expect(assetFileName(Buffer.from('a'), 'png')).not.toBe(assetFileName(Buffer.from('b'), 'png'));
  });
});

describe('extensionFor', () => {
  it.each([
    ['http://host/a/b.WEBP', undefined, 'webp'],
    ['http://host/icon', 'image/svg+xml', 'svg'],
    ['http://host/thing', 'font/woff2', 'woff2'],
    ['http://host/thing', undefined, 'bin'],
  ])('%s + %s -> %s', (url, contentType, expected) => {
    expect(extensionFor(url, contentType)).toBe(expected);
  });
});

describe('collectStyleBlocks', () => {
  it('keeps first-seen order and drops repeats across surfaces', () => {
    const shared = [];
    collectStyleBlocks(['a{}', 'b{}'], shared);
    collectStyleBlocks(['b{}', 'c{}'], shared);

    expect(shared).toEqual(['a{}', 'b{}', 'c{}']);
  });
});

describe('designCardMarker', () => {
  it('escapes the group so the marker cannot be broken out of', () => {
    expect(designCardMarker('Canvas & "controls"')).toBe(
      '<!-- @dsCard group="Canvas &amp; &quot;controls&quot;" -->'
    );
  });
});

describe('designSnapshotPath', () => {
  it('round-trips through parseSnapshotName', () => {
    const item = { group: 'controls', id: 'brush-menu' };
    const viewport = { id: 'ipad-pro-13-m4-landscape' };
    const theme = { id: 'dark' };

    const path = designSnapshotPath(item, viewport, theme);
    const parsed = parseSnapshotName(path.replace('surfaces/', ''));

    expect(parsed).toMatchObject({ group: 'controls', id: 'brush-menu' });
    expect(parsed.viewport.id).toBe('ipad-pro-13-m4-landscape');
    expect(parsed.theme.id).toBe('dark');
    expect(parsed.referencePath).toBe(
      'assets/controls/brush-menu--ipad-pro-13-m4-landscape--dark.webp'
    );
  });

  it('rejects a name that does not describe a capture', () => {
    expect(parseSnapshotName('index.html')).toBeUndefined();
    expect(parseSnapshotName('controls--x--not-a-viewport--dark.html')).toBeUndefined();
  });
});

describe('oversizedSnapshots', () => {
  it('flags only what a design project could not read back', () => {
    const files = [
      { path: 'a.html', bytes: DESIGN_FILE_READ_LIMIT_BYTES },
      { path: 'b.html', bytes: DESIGN_FILE_READ_LIMIT_BYTES + 1 },
    ];

    expect(oversizedSnapshots(files).map(({ path }) => path)).toEqual(['b.html']);
  });
});

describe('canvasBackgroundCss', () => {
  it('paints captured pixels back onto the element they came from', () => {
    expect(canvasBackgroundCss([{ id: 'c1', href: '../assets/x.png' }])).toContain(
      '[data-snapshot-canvas="c1"]{background-image:url("../assets/x.png")'
    );
  });

  it('renders nothing when a surface has no canvas', () => {
    expect(canvasBackgroundCss([])).toBe('');
  });
});

describe('modalBackdropCss', () => {
  it('emits nothing when the surface had no modal', () => {
    expect(modalBackdropCss([])).toBe('');
  });

  it('lifts the dialog above its own backdrop, and both above the page', () => {
    const css = modalBackdropCss([
      { id: 'b0', background: 'rgba(0, 0, 0, 0.6)', backgroundImage: 'none' },
    ]);

    const backdropZ = Number(css.match(/-layer="b0"\]\{[^}]*z-index:(\d+)/)[1]);
    const dialogZ = Number(css.match(/\[data-snapshot-modal="b0"\]\{z-index:(\d+)/)[1]);

    expect(dialogZ).toBe(backdropZ + 1);
    expect(backdropZ).toBeGreaterThan(1000);
    // The app styles the dialog by class, which outranks an attribute selector.
    expect(css).toContain(`z-index:${dialogZ}!important`);
    expect(css).toContain('background-color:rgba(0, 0, 0, 0.6)');
  });

  // Chromium folds the dialog into a backdrop-filtered layer even when it
  // paints above, so carrying the blur over blurs the modal itself.
  it('never carries a backdrop filter over', () => {
    const css = modalBackdropCss([
      { id: 'b0', background: 'rgba(0, 0, 0, 0.6)', backgroundImage: 'none' },
    ]);

    expect(css).not.toContain('backdrop-filter');
  });

  it('pairs each dialog with its own backdrop', () => {
    const css = modalBackdropCss([
      { id: 'b0', background: 'rgb(0, 0, 0)', backgroundImage: 'none' },
      { id: 'b1', background: 'rgb(1, 1, 1)', backgroundImage: 'none' },
    ]);

    expect(css).toContain('[data-snapshot-modal-layer="b1"]');
    expect(css).toContain('[data-snapshot-modal="b1"]');
    expect(css).not.toContain('background-image');
  });
});

describe('isFullyTransparent', () => {
  it('is false for bytes sharp cannot read', async () => {
    await expect(isFullyTransparent(Buffer.from('not an image'))).resolves.toBe(false);
  });
});

describe('splitCssBlocks', () => {
  it('keeps at-rule context attached to the rules inside it', () => {
    expect(splitCssBlocks('.a{color:red}@media(min-width:700px){.a{color:blue}}')).toEqual([
      { context: '', selector: '.a', body: 'color:red' },
      { context: '@media(min-width:700px)', selector: '.a', body: 'color:blue' },
    ]);
  });
});

describe('parseDeclarations', () => {
  it('does not split on a semicolon inside a function', () => {
    expect([...parseDeclarations('background:url(a;b);color:red')]).toEqual([
      ['background', 'url(a;b)'],
      ['color', 'red'],
    ]);
  });
});

describe('diffStylesheets', () => {
  it('reports changed, added, and removed declarations', () => {
    const changes = diffStylesheets(
      '.a{color:red;padding:4px}',
      '.a{color:blue;margin:2px}.b{gap:1px}'
    );

    expect(changes).toHaveLength(2);
    expect(changes[0].declarations).toEqual(
      expect.arrayContaining([
        { property: 'color', from: 'red', to: 'blue' },
        { property: 'margin', from: undefined, to: '2px' },
        { property: 'padding', from: '4px', to: undefined },
      ])
    );
    expect(changes[1]).toMatchObject({ selector: '.b', added: true });
  });

  it('separates the same selector under different media queries', () => {
    const changes = diffStylesheets(
      '.a{color:red}@media(min-width:700px){.a{color:red}}',
      '.a{color:red}@media(min-width:700px){.a{color:green}}'
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].context).toBe('@media(min-width:700px)');
  });

  it('finds nothing when the stylesheet is untouched', () => {
    expect(diffStylesheets('.a{color:red}', '.a{color:red}')).toEqual([]);
  });
});

describe('scope ownership', () => {
  const html =
    '<button class="brush svelte-abc1" data-src="src/lib/components/BrushMenu.svelte:42"></button>' +
    '<span class="brush svelte-abc1" data-src="src/lib/components/BrushMenu.svelte:51"></span>' +
    '<div class="shell svelte-zz9" data-src="src/routes/+page.svelte:8"></div>' +
    '<i class="svelte-abc1"></i>';

  it('maps a scope class to every source line that rendered it', () => {
    const owners = indexScopeOwners(html);

    expect(selectorOwners('.brush.svelte-abc1:hover', owners)).toEqual([
      'src/lib/components/BrushMenu.svelte:42',
      'src/lib/components/BrushMenu.svelte:51',
    ]);
  });

  it('names the global stylesheets when a selector carries no scope', () => {
    expect(describeChange({ selector: 'body', declarations: [] }, new Map())).toContain(
      'web/src/app.css'
    );
  });

  it('renders each declaration with its direction of travel', () => {
    const change = {
      selector: '.brush.svelte-abc1',
      context: '',
      declarations: [
        { property: 'color', from: 'red', to: 'blue' },
        { property: 'gap', from: undefined, to: '2px' },
        { property: 'padding', from: '4px', to: undefined },
      ],
    };

    const described = describeChange(change, indexScopeOwners(html));

    expect(described).toContain('~ color: red → blue');
    expect(described).toContain('+ gap: 2px');
    expect(described).toContain('- padding: 4px');
    expect(described).toContain('BrushMenu.svelte:42');
  });
});

describe('differingPixelPercent', () => {
  const rgb = (...pixels) => Uint8Array.from(pixels.flat());

  it('is zero for identical images', () => {
    expect(differingPixelPercent(rgb([1, 2, 3], [4, 5, 6]), rgb([1, 2, 3], [4, 5, 6]), 3)).toBe(0);
  });

  it('counts a pixel once however many channels moved', () => {
    expect(
      differingPixelPercent(rgb([0, 0, 0], [0, 0, 0]), rgb([255, 255, 255], [0, 0, 0]), 3)
    ).toBe(50);
  });

  it('ignores a difference below the encoder-rounding threshold', () => {
    expect(differingPixelPercent(rgb([100, 100, 100]), rgb([105, 100, 100]), 3)).toBe(0);
  });

  it('reports a total mismatch when the sizes disagree', () => {
    expect(differingPixelPercent(rgb([0, 0, 0]), rgb([0, 0, 0], [0, 0, 0]), 3)).toBe(100);
  });
});
