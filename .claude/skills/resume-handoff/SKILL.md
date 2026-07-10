---
name: resume-handoff
description: Pick up in-flight work from a transfer packet in docs/handoff/. Verifies the packet against the current repo, reports what's stale/missing, deletes the consumed handoff, then continues the work. Use when the user says to "resume", "pick up the handoff", "continue where we left off", or names a handoff to resume. To write a handoff, use create-handoff instead.
---

# Resume handoff

Pick up work from a handoff packet. Your first job is **not** to continue — it is
to **verify the packet against the repo**, flag what's stale or missing, and only
then proceed. Read `docs/handoff/CLAUDE.md` for the folder conventions.

## Steps

1. **Find the handoff.** List `docs/handoff/*.md` (ignore `CLAUDE.md`).
   - **None** → tell the user there are no open handoffs and stop.
   - **One** → that's it.
   - **Several** → match the user's hint (if any) against each file's topic name
     *and* its status-line objective; a fuzzy match is fine, the user should not
     have to know the exact filename. If exactly one matches, use it. If the hint
     is ambiguous or absent, **ask** with `AskUserQuestion`, listing each open
     handoff as `<topic> — <date>, <objective>` so the choice is obvious without
     opening files.

2. **Read the packet and everything it points to.** Read the chosen file in full,
   then open the files, ADRs, and skills under its **Reread first** section. Check
   out its branch if you're not on it (`git fetch origin && git checkout <branch>`).

3. **Verify before continuing.** Walk the packet against reality and build a short
   delta:
   - **State** — do the listed commits exist on the branch (`git log --oneline`)?
     Are the touched files in the described shape? Is the PR still open?
   - **Unverified assumptions** — test each one now. This is the section most
     likely to have gone stale.
   - **Done & verified** — spot-check the cheap ones (e.g. re-run
     `npm run check` or the named `gen:*:audit`); trust the expensive ones unless
     something looks off.
   - Mark every item **confirmed / stale / missing**.

4. **Report the delta, then delete the handoff.** Give the user a few-line summary
   of what's confirmed and what drifted since the handoff was written. Then delete
   the consumed packet right away and commit the deletion so a later resume can't
   re-pick it:
   ```
   git rm docs/handoff/<topic>.md
   git commit -m "Consume handoff for <topic>"
   ```
   The packet's content now lives in this session's context; if substantial work
   remains when you stop, write a fresh handoff with `/create-handoff`.

5. **Proceed** with the packet's **next 3 steps**, adjusted for anything you
   marked stale.
