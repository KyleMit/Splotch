<script lang="ts">
  import { paletteHex } from '$lib/palette';
  import { FEATURE_GRAPHIC } from './targets.ts';
  import { assetUrl, PLAY_ICON_ASSET_FILE } from './paths.ts';

  const RAINBOW_GRADIENT = `linear-gradient(90deg,${(
    ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'] as const
  )
    .map(paletteHex)
    .join(',')})`;

  const DOTS = [
    { size: 42, color: paletteHex('Yellow'), style: 'top:48px;left:560px' },
    { size: 26, color: paletteHex('Green'), style: 'top:120px;left:930px' },
    { size: 34, color: paletteHex('Blue'), style: 'bottom:70px;left:520px' },
    { size: 20, color: paletteHex('Red'), style: 'bottom:120px;left:880px' },
    { size: 30, color: paletteHex('Purple'), style: 'top:60px;left:60px' },
  ] as const;
</script>

<div
  class="graphic"
  style="width:{FEATURE_GRAPHIC.width}px;height:{FEATURE_GRAPHIC.height}px;--name-gradient:{RAINBOW_GRADIENT}"
>
  <div class="dots">
    {#each DOTS as dot (dot.style)}
      <span
        class="dot"
        style="width:{dot.size}px;height:{dot.size}px;background:{dot.color};{dot.style}"
      ></span>
    {/each}
  </div>
  <img class="icon" src={assetUrl(PLAY_ICON_ASSET_FILE)} alt="" />
  <div class="copy">
    <div class="name">Splotch</div>
    <div class="tag">Doodle, color &amp; create</div>
    <div class="sub">A calm, ad-free drawing app made for little hands</div>
  </div>
</div>

<style>
  .graphic {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 54px;
    padding: 0 86px;
    font-family: var(--font-family, 'Quicksand Variable', sans-serif);
    background: radial-gradient(circle at 20% 20%, #fff 0%, #fdf7ff 45%, #f3f0ff 100%);
  }

  .dots {
    position: absolute;
    inset: 0;
  }

  .dot {
    position: absolute;
    border-radius: 50%;
    opacity: 0.85;
  }

  .icon {
    width: 300px;
    height: 300px;
    flex: 0 0 auto;
    filter: drop-shadow(0 14px 30px rgba(120, 80, 180, 0.25));
  }

  .copy {
    z-index: 2;
  }

  .name {
    font-size: 128px;
    font-weight: 700;
    letter-spacing: -2px;
    background: var(--name-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    line-height: 1;
  }

  .tag {
    font-size: 38px;
    font-weight: 600;
    color: #5a4a6b;
    margin-top: 18px;
  }

  .sub {
    font-size: 24px;
    font-weight: 500;
    color: #9385a3;
    margin-top: 14px;
  }
</style>
