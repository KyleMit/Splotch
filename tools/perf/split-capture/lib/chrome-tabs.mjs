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
// pages and the /__probe/stand-down husks stale pages park themselves on —
// all on the probe host's origin, which is what makes ownership PROVABLE.
// Session restore re-fronts from exactly this pile — activation alone lost
// that race twice on the SM-G990U1, reporting 200 while a stood-down husk
// held the screen for a full 68s dispatch — and the pile is also what
// lazy-restores into fresh bootstraps next launch. Nothing off this origin is
// ever touched: not operator tabs, not other apps' Custom Tabs on the same
// socket, and not a bare about:blank, which nothing can prove ownership of.
// The pages this session's capture tooling opened, recognizable by their
// run-identity params (?probe= / ?verify=) or the stand-down path — across
// EVERY port the tooling serves on the host, because the tab that steals the
// foreground on relaunch is whichever tab Chrome used last, which can be a
// different tool's page than the one being launched (a stale probe tab stole
// the verifier's foreground exactly this way). Session restore re-fronts from
// this pile — activation alone lost that race repeatedly while reporting 200
// — and the pile is also what lazy-restores into fresh bootstraps next
// launch. Nothing without a tool signature on the session host is ever
// touched: not operator tabs, not other apps' Custom Tabs on the same socket,
// not a bare about:blank (unprovable), and not even this host's plain preview
// pages, which an operator may have opened deliberately.
export function toolingLitter(targets, hostname, keepNonce) {
  return targets.filter((target) => {
    if (target.type !== 'page') return false;
    try {
      const url = new URL(String(target.url ?? ''));
      if (url.hostname !== hostname) return false;
      const marked =
        url.searchParams.has('probe') ||
        url.searchParams.has('verify') ||
        url.pathname === '/__probe/stand-down';
      if (!marked) return false;
      return (
        url.searchParams.get('probe') !== keepNonce && url.searchParams.get('verify') !== keepNonce
      );
    } catch {
      return false;
    }
  });
}

export async function clearToolingLitter({ cdpBase, hostname, nonce, fetchImpl = fetch }) {
  const targets = await fetchImpl(`${cdpBase}/json/list`).then((response) => response.json());
  const litter = toolingLitter(targets, hostname, nonce);
  for (const target of litter) {
    await fetchImpl(`${cdpBase}/json/close/${target.id}`).catch(() => null);
  }
  return { closed: litter.length };
}

export function runChromePage(targets, nonce, param = 'probe') {
  return (
    targets.find((target) => {
      if (target.type !== 'page') return false;
      try {
        return new URL(target.url).searchParams.get(param) === nonce;
      } catch {
        return false;
      }
    }) ?? null
  );
}

export async function activateChromePage({ cdpBase, nonce, param = 'probe', fetchImpl = fetch }) {
  const targets = await fetchImpl(`${cdpBase}/json/list`).then((response) => response.json());
  const page = runChromePage(targets, nonce, param);
  if (!page) {
    return { activated: false, pages: targets.filter((target) => target.type === 'page').length };
  }
  const response = await fetchImpl(`${cdpBase}/json/activate/${page.id}`);
  return {
    activated: Boolean(response.ok ?? true),
    pages: targets.filter((target) => target.type === 'page').length,
  };
}
