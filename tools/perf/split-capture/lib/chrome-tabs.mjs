// Chrome restores every tab a previous cell left behind across the force-stop a
// launch performs, and the session restore can front a restored tab while the
// launch's URL loads in the BACKGROUND — where it reports ready and then
// receives none of the injected touch, because readiness proves the page
// loaded, not that it is on screen (issue 1294; a landscape cell reproduced
// this with the Google tab foregrounded and the run's page answering every
// poll from behind it).
//
// The remedy is clear-then-activate: close the tooling's OWN leftovers (the
// pile session restore re-fronts from — activation alone lost that race
// repeatedly while reporting 200), then front the run's page over the
// devtools HTTP endpoint, idempotently, re-issued right before dispatch.
// Launch-time tab surgery only; nothing stays attached while anything is
// measured.

// One ownership rule decides what may be closed. The tooling's pages are
// recognizable by their run-identity params (?probe= / ?verify=) or the
// STAND_DOWN_PATH husks stale pages park themselves on, matched across EVERY
// port the tooling serves on the session host — because the tab that steals
// the foreground on relaunch is whichever tab Chrome used last, which can be
// a different tool's page than the one being launched (a stale probe tab
// stole the verifier's foreground from another port exactly this way).
// Nothing without a tool signature on the session host is ever touched: not
// operator tabs, not other apps' Custom Tabs on the same socket, not a bare
// about:blank (unprovable — which is also why legacy pre-stand-down husks
// linger until swept by hand), and not even this host's plain preview pages,
// which an operator may have opened deliberately. The trade consciously
// accepted: an unrelated server on this host whose pages carry ?probe=/
// ?verify= would be claimed — no such server exists in this repo's tooling.
// Where a stale page parks itself. One constant, three consumers — the
// bootstrap that navigates there, the hosts that must serve it inertly, and
// this matcher — with a drift-guard test on each side, because a husk served
// by a host missing the route gets the injected bootstrap back and turns
// into a self-reloading page on the device being measured.
export const STAND_DOWN_PATH = '/__probe/stand-down';

// What a stood-down page SHOWS. It used to be a bare <title>, so a human whose
// manual page stood down (a mistyped or query-stripped URL) stared at a blank
// screen while the runner waited out its full ready budget — three minutes of
// unexplained blankness for a typo (issue 1300 review). Served by both the
// probe host and the floor-control host.
export const STAND_DOWN_PAGE_HTML =
  '<!doctype html><title>stood down</title>' +
  '<body style="font: 16px/1.5 system-ui; max-width: 40em; margin: 3em auto">' +
  '<h1>This page stood down</h1>' +
  '<p>It was opened for an earlier capture run, or without this run’s identity.</p>' +
  '<p>If a capture tool printed an address for you to open, reopen that EXACT ' +
  'address — the <code>?probe=</code> query is the run’s identity and is ' +
  'load-bearing. Otherwise just close this tab; it is a leftover.</p></body>';

export function toolingLitter(targets, hostname, keepNonce) {
  return targets.filter((target) => {
    if (target.type !== 'page') return false;
    try {
      const url = new URL(String(target.url ?? ''));
      if (url.hostname !== hostname) return false;
      const marked =
        url.searchParams.has('probe') ||
        url.searchParams.has('verify') ||
        url.pathname === STAND_DOWN_PATH;
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
  let closed = 0;
  for (const target of litter) {
    // Counting attempts as closes reported a clean prune while a stale tab
    // stayed up to answer for the next run (issue 1296) — only a close that
    // went through counts.
    const done = await fetchImpl(`${cdpBase}/json/close/${target.id}`).then(
      () => true,
      () => false
    );
    if (done) closed += 1;
  }
  return { closed, attempted: litter.length };
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
