<script lang="ts" module>
  export type MiniMapZone =
    | 'canvas'
    | 'palette'
    | 'gradient'
    | 'actions'
    | 'flyout'
    | 'clear'
    | 'corners'
    | 'notch'
    | 'banner'
    | 'halos'
    | 'dial'
    | 'polaroid'
    | 'shell'
    | 'breadcrumb'
    | 'settings'
    | 'error';
</script>

<script lang="ts">
  import { paletteHex } from '$lib/palette';

  // A 96×64 diagram of where a named chrome piece lives on screen — decorative
  // (aria-hidden); the card's name and blurb carry the meaning. Highlight
  // shapes paint --brand-solid, muted context shapes --control-track; drawing
  // inks come from lib/palette.ts so the maps can't drift from the crayons.
  interface Props {
    zone: MiniMapZone;
    /** Canvas chrome sits on the grained paper; page chrome on the app ground. */
    ground: 'paper' | 'page';
  }

  let { zone, ground }: Props = $props();

  const hi = 'background:var(--brand-solid);border-radius:2px;';
  const mut = 'background:var(--control-track);border-radius:2px;';
  const paletteBar = `left:3px;top:3px;bottom:3px;width:11px;${mut}`;
  const actionDot = (left: number, fill: string) =>
    `left:${left}px;bottom:5px;width:9px;height:9px;${fill}`;
  const inkDot = (label: Parameters<typeof paletteHex>[0], top: number) =>
    `left:6px;top:${top}px;width:5px;height:5px;border-radius:50%;background:${paletteHex(label)}`;
  const halo = (left: number, top: number) =>
    `left:${left}px;top:${top}px;width:14px;height:14px;border-radius:50%;border:2.5px solid var(--brand)`;

  const ZONE_SHAPES: Record<MiniMapZone, string[]> = {
    canvas: [
      'left:26px;top:16px;width:44px;height:30px;border:2.5px solid var(--brand);border-radius:50% 60% 55% 45%;transform:rotate(-8deg)',
    ],
    palette: [
      `left:3px;top:3px;bottom:3px;width:11px;${hi}`,
      inkDot('Yellow', 7),
      inkDot('Red', 15),
      inkDot('Blue', 23),
      inkDot('Green', 31),
    ],
    gradient: [
      paletteBar,
      `left:5px;bottom:6px;width:7px;height:7px;border-radius:50%;background:conic-gradient(${paletteHex('Red')},${paletteHex('Yellow')},${paletteHex('Green')},${paletteHex('Blue')},${paletteHex('Purple')},${paletteHex('Red')});box-shadow:0 0 0 2px var(--brand)`,
    ],
    actions: [paletteBar, actionDot(20, hi), actionDot(32, hi), actionDot(44, hi)],
    flyout: [paletteBar, actionDot(20, mut), `left:20px;bottom:18px;width:33px;height:11px;${hi}`],
    clear: [
      'right:4px;top:4px;width:11px;height:11px;border-radius:50%;background:var(--clear-gradient-rest)',
    ],
    corners: [
      `left:4px;top:4px;width:9px;height:9px;${hi}`,
      `right:4px;bottom:4px;width:9px;height:9px;${hi}`,
    ],
    notch: ['left:0;top:0;right:0;height:6px;background:var(--brand-solid)'],
    banner: [`left:24px;right:24px;bottom:5px;height:9px;border-radius:999px;${hi}`],
    halos: [halo(30, 20), halo(52, 32)],
    dial: [
      'left:36px;top:20px;width:24px;height:24px;border-radius:50%;border:3px solid var(--brand);border-top-color:var(--control-track);background:var(--surface)',
    ],
    polaroid: [
      'left:33px;top:14px;width:30px;height:32px;background:var(--polaroid-paper);border-radius:1.5px;box-shadow:0 2px 5px rgba(0,0,0,0.3);transform:rotate(-5deg)',
      'left:37px;top:17px;width:22px;height:19px;background:var(--brand-wash);transform:rotate(-5deg)',
    ],
    shell: [
      'left:20px;top:6px;right:20px;bottom:0;background:var(--surface);border-radius:4px 4px 0 0;box-shadow:0 1px 4px rgba(0,0,0,0.15)',
      'left:26px;top:12px;width:16px;height:3px;border-radius:2px;background:var(--brand)',
      'left:26px;top:20px;width:30px;height:5px;border-radius:2px;background:var(--text-soft)',
      `left:26px;top:30px;right:26px;height:2.5px;${mut}`,
      `left:26px;top:36px;right:34px;height:2.5px;${mut}`,
    ],
    breadcrumb: [
      `left:6px;top:6px;width:18px;height:6px;${hi}`,
      `left:27px;top:6px;width:6px;height:6px;border-radius:1px;${mut}`,
      `left:36px;top:6px;width:22px;height:6px;${mut}`,
    ],
    settings: [
      'left:14px;top:8px;right:14px;bottom:8px;background:var(--surface);border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.25)',
      'left:18px;top:12px;width:18px;bottom:12px;background:var(--brand-wash);border-radius:2px',
      `left:41px;top:13px;right:19px;height:4px;${mut}`,
      `left:41px;top:22px;right:19px;height:4px;${mut}`,
      `left:41px;top:31px;right:19px;height:4px;${mut}`,
    ],
    error: [
      'left:26px;top:12px;right:26px;bottom:12px;background:var(--surface);border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.25)',
      `left:38px;top:19px;width:20px;height:5px;${mut}`,
      `left:36px;bottom:18px;width:24px;height:7px;border-radius:3px;${hi}`,
    ],
  };
</script>

<div class={['map', ground]} aria-hidden="true">
  {#each ZONE_SHAPES[zone] as shape, index (index)}
    <i style="position:absolute;{shape}"></i>
  {/each}
</div>

<style>
  .map {
    position: relative;
    flex-shrink: 0;
    width: 96px;
    height: 64px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .map.paper {
    background: var(--paper) url('/icons/handmade-paper.webp') repeat;
    border: var(--border-width) solid var(--border-warm);
  }

  .map.page {
    background: var(--app-bg);
    border: var(--border-width) solid var(--border);
  }

  .map i {
    display: block;
  }
</style>
