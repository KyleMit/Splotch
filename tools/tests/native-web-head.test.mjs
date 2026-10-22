import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEB_INSTALL_HEAD_TAGS, WEB_VIEWPORT_META } from '../migration/lib/native-web-head.mjs';
import {
  installHeadTagAssets,
  withInstallHeadTags,
  withWebViewport,
} from '../migration/build-native-web.mjs';
import { ROOT } from '../lib/proc.mjs';

const DOCUMENT = '<html><head><meta name="viewport" content="width=device-width"></head></html>';

describe('web export install head', () => {
  it('preserves the viewport and install tags independently of an application template', () => {
    const html = withWebViewport(withInstallHeadTags(DOCUMENT, WEB_INSTALL_HEAD_TAGS));
    expect(html).toContain(WEB_VIEWPORT_META);
    expect(html.match(/name="viewport"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />'
    );
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="theme-color" content="#ffffff" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Splotch" />');
  });

  it('ships every linked install asset and the manifest’s icons', () => {
    const assets = installHeadTagAssets(WEB_INSTALL_HEAD_TAGS);
    expect(assets).toEqual([
      'favicon-96x96.png',
      'favicon.ico',
      'apple-touch-icon.png',
      'site.webmanifest',
    ]);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/static/site.webmanifest'), 'utf8'));
    for (const asset of [...assets, ...manifest.icons.map(({ src }) => src.replace(/^\//, ''))]) {
      expect(existsSync(join(ROOT, 'assets/static', asset)), asset).toBe(true);
    }
  });

  it('rejects an export that lost its viewport or document head', () => {
    expect(() => withWebViewport('<html><head></head></html>')).toThrow('no viewport');
    expect(() => withInstallHeadTags('<html></html>', WEB_INSTALL_HEAD_TAGS)).toThrow('no </head>');
  });
});
