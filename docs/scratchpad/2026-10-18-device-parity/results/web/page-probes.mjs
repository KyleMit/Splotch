// In-page readers shared by the cells. Each runs inside the arm's page and reads only public DOM:
// roles, names, rendered text, boxes and computed styles, never either app's internal state.

export function readBanner() {
  const named = (element) => (element.getAttribute('aria-label') || element.innerText || '').trim();
  const notNow = [...document.querySelectorAll('button')].find(
    (element) => named(element) === 'Not now' && element.checkVisibility()
  );
  const parting = [...document.querySelectorAll('div,p,span')].find(
    (element) =>
      element.checkVisibility() &&
      element.children.length < 4 &&
      /No rush — these steps are always in/.test(element.innerText)
  );
  const rect = (element) => {
    const r = element.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  if (!notNow)
    return {
      present: false,
      parting: parting ? parting.innerText.replace(/\s+/g, ' ').trim() : null,
    };
  let card = notNow;
  while (
    card.parentElement &&
    !(card.querySelectorAll('button').length >= 2 && card.innerText.length > 30)
  )
    card = card.parentElement;
  // Each visible text run as the lines it wraps into, so a moved break shows even when the line
  // count matches.
  const lines = [];
  const walker = document.createTreeWalker(card, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
    const wrapped = new Map();
    for (const match of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const top = Math.round(range.getBoundingClientRect().top);
      wrapped.set(top, [...(wrapped.get(top) ?? []), match[0]]);
    }
    lines.push([...wrapped.values()].map((words) => words.join(' ')));
  }
  // The manual steps can render beside the card rather than inside it; read them page-wide.
  const hint = [...document.querySelectorAll('li, p, span, div')]
    .filter(
      (element) =>
        element.checkVisibility() &&
        element.childElementCount <= 6 &&
        /^(\d\s*)?(Tap Share|Choose Add|Don.t see it|Open the)/.test(
          element.innerText.replace(/\s+/g, ' ').trim()
        )
    )
    .map((element) => element.innerText.replace(/\s+/g, ' ').trim())
    .filter((text, index, all) => all.findIndex((other) => other.includes(text)) === index);
  const image = card.querySelector('img');
  return {
    present: true,
    card: rect(card),
    viewport: { w: innerWidth, h: innerHeight },
    text: card.innerText.replace(/\s+/g, ' ').trim(),
    lines,
    buttons: [...card.querySelectorAll('button')]
      .filter((element) => element.checkVisibility())
      .map((element) => ({
        name: named(element),
        expanded: element.getAttribute('aria-expanded'),
        box: rect(element),
      })),
    hint,
    image: image
      ? {
          src: image.getAttribute('src'),
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          box: rect(image),
        }
      : null,
    overflow: card.scrollWidth - card.clientWidth,
  };
}

// The visible text of the open Settings dialog's section whose heading or row matches `name`.
export function readDialogText() {
  const dialog = [...document.querySelectorAll('dialog[open],[role="dialog"]')].find((element) =>
    element.checkVisibility()
  );
  return dialog ? dialog.innerText.replace(/\s+/g, ' ').trim() : null;
}

export function readSurfaceLocks() {
  const style = (element) => {
    const computed = getComputedStyle(element);
    return {
      touchAction: computed.touchAction,
      userSelect: computed.userSelect || computed.webkitUserSelect,
      touchCallout:
        computed.webkitTouchCallout ?? computed.getPropertyValue('-webkit-touch-callout'),
      overscroll: computed.overscrollBehavior,
      overflow: computed.overflow,
    };
  };
  const viewport = document.querySelector('meta[name="viewport"]');
  return {
    appSurface: document.documentElement.hasAttribute('data-app-surface'),
    html: style(document.documentElement),
    body: style(document.body),
    viewport: viewport ? viewport.getAttribute('content') : null,
    path: window.location.pathname,
    title: document.title,
  };
}

export function readHeadings() {
  return [...document.querySelectorAll('h1,h2,[role="heading"]')]
    .filter((element) => element.checkVisibility())
    .map((element) => element.innerText.replace(/\s+/g, ' ').trim())
    .slice(0, 12);
}

export function readLinks() {
  return [...document.querySelectorAll('a[href],[role="link"]')]
    .filter((element) => element.checkVisibility())
    .map((element) => ({
      text: element.innerText.replace(/\s+/g, ' ').trim(),
      href: element.getAttribute('href'),
    }))
    .slice(0, 30);
}
