<script lang="ts">
  import { DEVICE_PROFILES } from './lib/devices';
  import {
    SYMMETRIC_LANDSCAPE_NOTE,
    sizeClassOf,
    supportedOrientations,
  } from './lib/deviceProfile';
  import ScenarioTile from './lib/ScenarioTile.svelte';

  // Every distinct safe-area profile the app can land in, held one way at a
  // time, with the real HUD inside. A section per profile, a tile per
  // orientation the device actually offers.

  const TILE_SIZES = { small: 200, medium: 300, large: 420 } as const;
  type TileSize = keyof typeof TILE_SIZES;

  let tileSize = $state<TileSize>('medium');
  let showOutline = $state(true);
  let onlyCutouts = $state(false);

  const profiles = $derived(
    onlyCutouts ? DEVICE_PROFILES.filter((p) => p.cutout.kind !== 'none') : DEVICE_PROFILES
  );
</script>

<svelte:head>
  <title>Notch & safe area · Splotch dev</title>
</svelte:head>

<div class="harness" class:hide-outline={!showOutline}>
  <header>
    <a class="back" href="/dev">← Dev harnesses</a>
    <h1>Notch &amp; safe area</h1>
    <p class="lede">
      One section per distinct <code>env(safe-area-inset-*)</code> profile, one tile per orientation the
      device actually offers. Each tile is the live HUD in an iframe at that device's CSS viewport, under
      that device's insets and rotation angle, so the Notch Band, the palette and every corner control
      lay themselves out against the geometry the device would give them.
    </p>
    <p class="lede">
      <strong>A web-layout model, not the native app.</strong> Frames run the ordinary web build, so
      <code>isNative()</code> is false and no Capacitor plugin runs. A native-only effect reaches a tile
      only where it changes the geometry and this harness models it explicitly — one does: Android native
      hides the status bar in landscape, and those tiles are drawn with that inset already reclaimed.
      Native status-bar icon styling changes no geometry and is absent.
    </p>
    <p class="lede">
      The dashed outline is the claimable region. Hardware is drawn over the top: a cutout, the
      status glyphs, the home indicator. <strong>{SYMMETRIC_LANDSCAPE_NOTE}</strong> The two landscape
      tiles for an iPhone therefore receive identical numbers, which is why the band covers both sides
      there — neither strip is claimable, so covering both cannot land on the wrong one. Where the two
      sides differ, as on Android, the rotation angle picks.
    </p>

    <div class="controls">
      <label>
        Tile size
        <select bind:value={tileSize}>
          {#each Object.keys(TILE_SIZES) as size (size)}
            <option value={size}>{size}</option>
          {/each}
        </select>
      </label>
      <label><input type="checkbox" bind:checked={showOutline} /> Safe-area outline</label>
      <label><input type="checkbox" bind:checked={onlyCutouts} /> Cutout devices only</label>
    </div>
  </header>

  {#each profiles as profile (profile.id)}
    <section>
      <div class="meta">
        <h2>{profile.label}</h2>
        <span class="badge" data-confidence={profile.confidence}>{profile.confidence}</span>
        <span class="badge surface">{profile.surface}</span>
        <span class="viewport">{profile.viewport.width} × {profile.viewport.height}</span>
        <span class="badge">{sizeClassOf(profile)}</span>
      </div>
      <p class="models">{profile.models.join(' · ')}</p>
      <p class="notes">{profile.notes}</p>

      <div class="tiles">
        {#each supportedOrientations(profile) as orientation (orientation)}
          <ScenarioTile {profile} {orientation} budgetPx={TILE_SIZES[tileSize]} />
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  /* The harness reads the themed app tokens like every other route rather than
     pinning its own palette, so it follows the parent's night-mode preference.
     Only the two values below have no token to read.

     The safe-area outline is a measurement annotation, not product chrome —
     there is no token for "instrument overlay", and it has to stay legible on
     both papers and over a tile of any drawing colour, which is what the
     alpha buys. rgb() rather than hex is not linter evasion: an opaque hex
     could not do this job. */
  .harness {
    --notch-safe-outline: rgb(120 220 255 / 65%);
    /* The one raw pair: there is no warn token in the ramp — amber is the
       product's missing status colour, the same gap AdminConsole's persistence
       banner documents — and both warn surfaces here (a medium-confidence
       badge, a wrong-edge-adjacent verdict) need the same pair. Declared once
       so ScenarioTile inherits it instead of restating the hexes. */
    --notch-warn-wash: #5a4210;
    --notch-warn-ink: #ffd479;

    min-height: 100vh;
    padding: var(--space-6);
    background: var(--app-bg);
    color: var(--text-strong);
    font-family: var(--font-family);
  }

  .harness.hide-outline :global(.safe-outline) {
    display: none;
  }

  header {
    max-width: 70ch;
    margin-bottom: var(--space-8);
  }

  .back {
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    text-decoration: none;
  }

  h1 {
    margin: var(--space-2) 0 var(--space-3);
    color: var(--text-strong);
    font-size: var(--font-size-xl);
  }

  .lede {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }

  code {
    font-family: var(--font-mono);
    color: var(--text-strong);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: center;
    margin-top: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  select {
    font: inherit;
    padding: 2px 6px;
    color: inherit;
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
  }

  section {
    padding: var(--space-5) 0 var(--space-6);
    border-top: var(--border-width) solid var(--border);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--font-size-lg);
  }

  .badge {
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--surface-hover);
    color: var(--text-strong);
  }

  /* A medium or low badge is a standing instruction to verify on hardware before
     trusting the tile, so it has to be visible without reading the note. */
  .badge[data-confidence='medium'] {
    background: var(--notch-warn-wash);
    color: var(--notch-warn-ink);
  }

  .badge[data-confidence='low'] {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  .viewport,
  .models,
  .notes {
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .models {
    margin: var(--space-2) 0 0;
  }

  .notes {
    margin: var(--space-2) 0 0;
    max-width: 80ch;
    line-height: 1.6;
  }

  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    align-items: flex-end;
    margin-top: var(--space-5);
  }
</style>
