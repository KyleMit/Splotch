<script lang="ts">
  import { DEVICE_PROFILES } from './lib/devices';
  import { SYMMETRIC_LANDSCAPE_NOTE, supportedOrientations } from './lib/deviceProfile';
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
      device actually offers. Each tile is the live HUD in an iframe at that device's CSS viewport, with
      the four insets overridden — so the Notch Band, the palette, and every corner control lay themselves
      out exactly as they would on the hardware.
    </p>
    <p class="lede">
      The dashed outline is the claimable region. Hardware is drawn over the top: a cutout, the
      status glyphs, the home indicator. <strong>{SYMMETRIC_LANDSCAPE_NOTE}</strong> The two landscape
      tiles for an iPhone therefore receive identical numbers and differ only in where the hardware really
      is — compare them against each other.
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
  /* Local palette, so the harness reads as its own surface rather than borrowing
     the app's drawing chrome, and so the tiles' overlay colors have one home. */
  .harness {
    --notch-page-ground: #14141a;
    --notch-panel: #1d1d25;
    --notch-body: #c8c8d4;
    --notch-muted: #8a8a9a;
    --notch-glyph: #ffffff;
    --notch-safe-outline: rgb(120 220 255 / 65%);

    min-height: 100vh;
    padding: var(--space-6);
    background: var(--notch-page-ground);
    color: var(--notch-body);
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
    color: var(--notch-muted);
    font-size: var(--font-size-sm);
    text-decoration: none;
  }

  h1 {
    margin: var(--space-2) 0 var(--space-3);
    color: #fff;
    font-size: var(--font-size-xl);
  }

  .lede {
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }

  code {
    font-family: var(--font-mono);
    color: #fff;
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
    background: var(--notch-panel);
    border: var(--border-width) solid #33333f;
    border-radius: var(--radius-sm);
  }

  section {
    padding: var(--space-5) 0 var(--space-6);
    border-top: var(--border-width) solid #2a2a34;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    color: #fff;
    font-size: var(--font-size-lg);
  }

  .badge {
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: #2f2f3c;
    color: var(--notch-body);
  }

  /* A medium or low badge is a standing instruction to verify on hardware before
     trusting the tile, so it has to be visible without reading the note. */
  .badge[data-confidence='medium'] {
    background: #5a4210;
    color: #ffd479;
  }

  .badge[data-confidence='low'] {
    background: #5a1a1a;
    color: #ff9d9d;
  }

  .viewport,
  .models,
  .notes {
    font-size: var(--font-size-sm);
    color: var(--notch-muted);
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
