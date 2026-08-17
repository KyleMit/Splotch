<script lang="ts">
  import type { StoreTarget } from './targets.ts';
  import { frameGeometry, L_BASE_H } from './geometry.ts';
  import type { StorePage } from './pages.ts';
  import { MARKS, MARK_BASE_W, marksFor } from './marks.ts';
  import {
    CHIP_SPEC,
    DARK_BG,
    FRAME_RADIUS,
    FRAME_SHADOW_SPEC,
    INK,
    INK_MUTED,
    INK_MUTED_ON_DARK,
    INK_ON_DARK,
    LIGHT_BG,
    TYPE_SPEC,
  } from './frameStyle.ts';
  import { assetUrl, captureAssetFile } from './paths.ts';
  import ShowcaseScene from './ShowcaseScene.svelte';

  interface Props {
    target: StoreTarget;
    page: StorePage;
  }

  let { target, page }: Props = $props();

  const geo = $derived(frameGeometry(target));
  const k = $derived(geo.k);
  const px = (value: number) => `${Math.round(value * k)}px`;

  const type = $derived(TYPE_SPEC[geo.orientation]);
  const shadow = $derived(FRAME_SHADOW_SPEC[geo.orientation][page.dark ? 'dark' : 'light']);

  const rootVars = $derived(
    [
      `width:${target.width}px`,
      `height:${target.height}px`,
      `--bg:${page.dark ? DARK_BG : LIGHT_BG}`,
      `--ink:${page.dark ? INK_ON_DARK : INK}`,
      `--ink-light-page:${INK}`,
      `--ink-muted:${page.dark ? INK_MUTED_ON_DARK : INK_MUTED}`,
      `--frame-shadow:0 ${px(shadow.y)} ${px(shadow.blur)} ${shadow.color}`,
      `--logo-gap:${px(type.logoGap)}`,
      `--logo-margin-bottom:${px(type.logoMarginBottom)}`,
      `--logo-icon:${px(type.logoIcon)}`,
      `--logo-radius:${px(type.logoRadius)}`,
      `--logo-text:${px(type.logoText)}`,
      `--headline:${px(type.headline)}`,
      `--headline-line-height:${type.headlineLineHeight}`,
      `--headline-letter-spacing:${(type.letterSpacing * k).toFixed(2)}px`,
      `--sub-size:${px(type.sub)}`,
      `--sub-line-height:${type.subLineHeight}`,
      `--sub-margin-top:${px(type.subMarginTop)}`,
      `--chips-margin-top:${px(CHIP_SPEC.marginTop)}`,
      `--chip-gap:${px(CHIP_SPEC.gap)}`,
      `--chip-label-gap:${px(CHIP_SPEC.labelGap)}`,
      `--chip-pad:${px(CHIP_SPEC.padY)} ${px(CHIP_SPEC.padX)}`,
      `--chip-font:${px(CHIP_SPEC.font)}`,
      `--chip-dot:${px(CHIP_SPEC.dot)}`,
      `--chip-shadow:0 ${px(CHIP_SPEC.shadowY)} ${px(CHIP_SPEC.shadowBlur)} rgba(60,40,110,.10)`,
      `--frame-x:${geo.frame.x}px`,
      `--frame-y:${geo.frame.y}px`,
      `--frame-w:${geo.frame.width}px`,
      `--frame-h:${geo.frame.height}px`,
      `--frame-radius:${px(FRAME_RADIUS[geo.orientation])}`,
    ].join(';')
  );

  const copyVars = $derived(
    geo.orientation === 'portrait'
      ? `left:${geo.copy.x}px;top:${geo.copy.top}px;width:${geo.copy.width}px;height:${geo.copy.height}px`
      : `left:${geo.copy.x}px;top:0;bottom:0;width:${geo.copy.width}px`
  );

  // Landscape mark Y scales with frame HEIGHT, not width: the copy column is
  // vertically centered, so on the taller 4:3 iPad a width-scaled bottom mark
  // would land inside the copy block instead of the bottom whitespace. On the
  // 16:9 base the two scales are identical.
  const renderedMarks = $derived.by(() => {
    const yScale = geo.orientation === 'landscape' ? target.height / L_BASE_H : k;
    return marksFor(page.id, geo.orientation).map((m) => {
      const x = Math.round(m.x * k);
      const yFromTop = Math.round(m.y * yScale);
      const y = m.fromBottom ? target.height - yFromTop : yFromTop;
      if (m.kind === 'dot') {
        const d = Math.round(m.d * k);
        return {
          html: null,
          style: `left:${x}px;top:${y}px;width:${d}px;height:${d}px;border-radius:50%;background:${m.color}`,
        };
      }
      const w = Math.round(MARK_BASE_W[m.kind] * m.scale * k);
      return {
        html: MARKS[m.kind](m.color),
        style: `left:${x}px;top:${y}px;width:${w}px;transform:rotate(${m.rot}deg)`,
      };
    });
  });
</script>

<div class="page" style={rootVars}>
  <!-- eslint-disable svelte/no-at-html-tags mark SVGs and titles are first-party strings from marks.ts / pages.ts -->
  {#each renderedMarks as mark, index (index)}
    {#if mark.html}
      <span class="mark" style={mark.style}>{@html mark.html}</span>
    {:else}
      <span class="mark" style={mark.style}></span>
    {/if}
  {/each}

  <div class="copy" class:centered={geo.orientation === 'portrait'} style={copyVars}>
    {#if page.logo}
      <div class="logo">
        <img src="/web-app-manifest-192x192.png" alt="" />
        <span>Splotch</span>
      </div>
    {/if}
    <h1>{@html page.title}</h1>
    <!-- eslint-enable svelte/no-at-html-tags -->
    <p class="sub">{page.sub}</p>
    {#if page.chips}
      <div class="chips">
        {#each page.chips as chip (chip.label)}
          <span class="chip"><i style="background:{chip.color}"></i>{chip.label}</span>
        {/each}
      </div>
    {/if}
  </div>

  {#if page.showcase}
    <ShowcaseScene {target} {geo} />
  {:else}
    <img class="frame" src={assetUrl(captureAssetFile(target.name, page.id))} alt="" />
  {/if}
</div>

<style>
  .page {
    position: relative;
    overflow: hidden;
    background: var(--bg);
    font-family: var(--font-family, 'Quicksand Variable', sans-serif);
  }

  .mark {
    position: absolute;
    z-index: 1;
    display: block;
  }

  .mark :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .copy {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
  }

  .copy.centered {
    align-items: center;
    text-align: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--logo-gap);
    margin-bottom: var(--logo-margin-bottom);
  }

  .logo img {
    width: var(--logo-icon);
    height: var(--logo-icon);
    border-radius: var(--logo-radius);
  }

  /* The logo row only appears on the light hero page, so its ink stays the
     static light-page value rather than following --ink. */
  .logo span {
    font-size: var(--logo-text);
    font-weight: 700;
    color: var(--ink-light-page);
    letter-spacing: -0.5px;
  }

  h1 {
    font-size: var(--headline);
    font-weight: 700;
    line-height: var(--headline-line-height);
    letter-spacing: var(--headline-letter-spacing);
    color: var(--ink);
    text-wrap: balance;
  }

  .sub {
    margin-top: var(--sub-margin-top);
    font-size: var(--sub-size);
    font-weight: 600;
    line-height: var(--sub-line-height);
    color: var(--ink-muted);
    text-wrap: balance;
  }

  .chips {
    margin-top: var(--chips-margin-top);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--chip-gap);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--chip-label-gap);
    /* Pinned white, not var(--surface): the chips sit on the frame's fixed
       light gradient, and store art must render identically whatever theme
       the previewing browser is in. Baselined in lint-token-styles.mjs. */
    background: #fff;
    border-radius: 999px;
    padding: var(--chip-pad);
    font-size: var(--chip-font);
    font-weight: 600;
    color: var(--ink-light-page);
    box-shadow: var(--chip-shadow);
  }

  .chip i {
    width: var(--chip-dot);
    height: var(--chip-dot);
    border-radius: 50%;
  }

  .frame {
    position: absolute;
    z-index: 3;
    left: var(--frame-x);
    top: var(--frame-y);
    width: var(--frame-w);
    height: var(--frame-h);
    border-radius: var(--frame-radius);
    box-shadow: var(--frame-shadow);
  }
</style>
