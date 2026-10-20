// Accessibility-tree parsing for Appium page sources.
// iOS XCUITest: <XCUIElementTypeButton name=".." label=".." x= y= width= height= enabled= .../>
// Android UiAutomator2: <android.widget.Button content-desc=".." text=".." bounds="[x1,y1][x2,y2]"/>
// Android frames are divided by the screen density, so both platforms report points (pt / dp).

const XML_ENTITIES = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#10;': '\n' };

function decodeXml(text) {
  return text
    .replace(/&(quot|apos|lt|gt|#10);/g, (entity) => XML_ENTITIES[entity])
    .replace(/&amp;/g, '&');
}

function nodeFrame(attrs, platform, density) {
  if (platform === 'ios') {
    if (attrs.x === undefined) return null;
    return { x: +attrs.x, y: +attrs.y, w: +attrs.width, h: +attrs.height };
  }
  const bounds = attrs.bounds?.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (!bounds) return null;
  const [x1, y1, x2, y2] = bounds.slice(1).map(Number);
  return { x: x1 / density, y: y1 / density, w: (x2 - x1) / density, h: (y2 - y1) / density };
}

export function parseNodes(xml, platform, density = 1) {
  const nodes = [];
  for (const match of xml.matchAll(/<([A-Za-z0-9_.]+)((?:\s+[A-Za-z0-9_:-]+="[^"]*")*)\s*\/?>/g)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeXml(attr[2]);
    }
    const frame = nodeFrame(attrs, platform, density);
    if (!frame) continue;
    const name =
      platform === 'ios'
        ? attrs.name || attrs.label || ''
        : attrs['content-desc'] || attrs.text || '';
    nodes.push({
      tag: match[1],
      name,
      label: attrs.label ?? attrs.text ?? '',
      value: attrs.value ?? '',
      enabled: attrs.enabled,
      visible: attrs.visible ?? attrs.displayed,
      selected: attrs.selected,
      checked: attrs.checked,
      frame,
    });
  }
  return nodes;
}

export const shortTag = (tag) =>
  tag.replace('XCUIElementType', '').replace(/^android\.(widget|view)\./, '');

// The named, visible, non-empty controls a capture sidecar records.
export function namedFrames(nodes) {
  return nodes
    .filter((node) => node.name && node.visible !== 'false' && node.frame.w > 0 && node.frame.h > 0)
    .map((node) => ({
      name: node.name,
      tag: shortTag(node.tag),
      frame: node.frame,
      enabled: node.enabled,
      value: node.value,
      selected: node.selected,
      checked: node.checked,
    }));
}
