// Chrome restores every tab a previous cell left behind across the force-stop a
// launch performs, and with a pile present the session restore can front a
// restored tab while the launch's URL loads in the BACKGROUND — where it
// reports ready and then receives none of the injected touch, because
// readiness proves the page loaded, not that it is on screen (issue 1294; a
// landscape cell reproduced this with the Google tab foregrounded and the
// run's page answering every poll from behind it). Closing every other page
// leaves the restore race nothing to win, and Chrome fronts the survivor.
//
// Uses the devtools HTTP endpoints (/json/list, /json/close) over the adb
// forward rather than a CDP session: launch-time tab surgery, nothing attached
// while anything is measured.

export function staleChromePages(targets, keepMatch) {
  return targets.filter(
    (target) => target.type === 'page' && !String(target.url ?? '').includes(keepMatch)
  );
}

export async function pruneChromeTabs({ cdpBase, keepMatch, fetchImpl = fetch }) {
  const targets = await fetchImpl(`${cdpBase}/json/list`).then((response) => response.json());
  const stale = staleChromePages(targets, keepMatch);
  for (const target of stale) {
    await fetchImpl(`${cdpBase}/json/close/${target.id}`).catch(() => null);
  }
  const pages = targets.filter((target) => target.type === 'page').length;
  return { closed: stale.length, kept: pages - stale.length };
}
