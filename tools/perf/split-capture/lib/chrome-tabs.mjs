// Chrome restores every tab a previous cell left behind across the force-stop a
// launch performs, and the session restore can front a restored tab while the
// launch's URL loads in the BACKGROUND — where it reports ready and then
// receives none of the injected touch, because readiness proves the page
// loaded, not that it is on screen (issue 1294; a landscape cell reproduced
// this with the Google tab foregrounded and the run's page answering every
// poll from behind it).
//
// The remedy ACTIVATES the run's page rather than closing anything: the
// devtools HTTP endpoint fronts a named target, which solves the foreground
// problem directly, is idempotent (safe to re-issue right before dispatch),
// and fails in the benign direction — a page that cannot be identified is
// left alone, where a close-the-rest sweep would take the operator's own tabs
// (and other apps' Custom Tabs on the same socket) with it, or in the worst
// case the run page itself. Launch-time tab surgery only; nothing stays
// attached while anything is measured.

// The pages this transport itself created and abandoned: earlier runs' probe
// pages (same origin, different nonce) and the about:blank husks their
// standdowns leave behind. Session restore re-fronts from exactly this pile —
// activation alone lost that race twice on the SM-G990U1, reporting 200 while
// a stood-down about:blank held the screen for a full 68s dispatch — and the
// pile is also what lazy-restores into fresh bootstraps next launch. Only the
// transport's own litter qualifies: operator tabs and other apps' Custom Tabs
// on the same socket are never touched, whatever they cost us.
export function transportLitter(targets, probeOrigin, keepNonce) {
  return targets.filter((target) => {
    if (target.type !== 'page') return false;
    const url = String(target.url ?? '');
    if (url === 'about:blank') return true;
    try {
      const parsed = new URL(url);
      return parsed.origin === probeOrigin && parsed.searchParams.get('probe') !== keepNonce;
    } catch {
      return false;
    }
  });
}

export async function clearTransportLitter({ cdpBase, probeOrigin, nonce, fetchImpl = fetch }) {
  const targets = await fetchImpl(`${cdpBase}/json/list`).then((response) => response.json());
  const litter = transportLitter(targets, probeOrigin, nonce);
  for (const target of litter) {
    await fetchImpl(`${cdpBase}/json/close/${target.id}`).catch(() => null);
  }
  return { closed: litter.length };
}

export function runChromePage(targets, nonce) {
  return (
    targets.find((target) => {
      if (target.type !== 'page') return false;
      try {
        return new URL(target.url).searchParams.get('probe') === nonce;
      } catch {
        return false;
      }
    }) ?? null
  );
}

export async function activateChromePage({ cdpBase, nonce, fetchImpl = fetch }) {
  const targets = await fetchImpl(`${cdpBase}/json/list`).then((response) => response.json());
  const page = runChromePage(targets, nonce);
  if (!page) {
    return { activated: false, pages: targets.filter((target) => target.type === 'page').length };
  }
  const response = await fetchImpl(`${cdpBase}/json/activate/${page.id}`);
  return {
    activated: Boolean(response.ok ?? true),
    pages: targets.filter((target) => target.type === 'page').length,
  };
}
