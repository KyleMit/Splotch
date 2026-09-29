// @vitest-environment node
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import SidebarToc, { type SidebarTocButtonItem, type SidebarTocItem } from './SidebarToc.svelte';

type SidebarTocProps = ComponentProps<typeof SidebarToc>;

interface Shared {
  active: string;
  label: string;
}

type OnSelect = (id: string, trigger: HTMLElement) => void;

const anchorItems: SidebarTocItem[] = [
  { id: 'color', label: 'Color', href: '#color' },
  { id: 'type', label: 'Type scale', href: '#type' },
];

const buttonItems: SidebarTocButtonItem[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'sound', label: 'Sound' },
];

function servedMarkup(props: SidebarTocProps) {
  return render(SidebarToc, { props }).body;
}

describe('SidebarToc props', () => {
  it('accepts anchor rows alone, and button rows with the handler they call', () => {
    expectTypeOf<Shared & { items: SidebarTocItem[] }>().toExtend<SidebarTocProps>();
    expectTypeOf<
      Shared & { items: SidebarTocButtonItem[]; onSelect: OnSelect }
    >().toExtend<SidebarTocProps>();
  });

  // toExtend is structural, the relation a spread of props gets: these hold
  // without the excess-property check that only written-out attributes get.
  it('rejects button rows with no handler, which would render inert buttons', () => {
    expectTypeOf<Shared & { items: SidebarTocButtonItem[] }>().not.toExtend<SidebarTocProps>();
  });

  it('rejects a handler over anchor rows, which navigate themselves and never call it', () => {
    expectTypeOf<
      Shared & { items: SidebarTocItem[]; onSelect: OnSelect }
    >().not.toExtend<SidebarTocProps>();
  });

  it('rejects a rail mixing anchor and button rows', () => {
    expectTypeOf<
      Shared & { items: (SidebarTocItem | SidebarTocButtonItem)[]; onSelect: OnSelect }
    >().not.toExtend<SidebarTocProps>();
  });

  it('renders each kind of rail with the row element its props admit', () => {
    const anchors = servedMarkup({ items: anchorItems, active: 'color', label: 'Contents' });
    const buttons = servedMarkup({
      items: buttonItems,
      active: 'sound',
      label: 'Settings sections',
      onSelect: () => {},
    });

    expect(anchors.match(/<a\s/g)).toHaveLength(anchorItems.length);
    expect(anchors).not.toContain('<button');
    expect(buttons.match(/<button\s/g)).toHaveLength(buttonItems.length);
    expect(buttons).not.toContain('<a ');
  });
});
