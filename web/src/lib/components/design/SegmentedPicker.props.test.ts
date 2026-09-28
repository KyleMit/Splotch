// @vitest-environment node
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import SegmentedPicker from './SegmentedPicker.svelte';

type PickerProps = ComponentProps<typeof SegmentedPicker>;

interface Shared {
  label: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

const options = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
];

function servedMarkup(props: PickerProps) {
  return render(SegmentedPicker, { props }).body;
}

describe('SegmentedPicker props', () => {
  it('accepts a radio picker with one value or none, native radios included', () => {
    expectTypeOf<Shared & { selected: string }>().toExtend<PickerProps>();
    expectTypeOf<Shared & { mode: 'radio'; selected: null }>().toExtend<PickerProps>();
    expectTypeOf<Shared & { selected: string; inputName: string }>().toExtend<PickerProps>();
  });

  it('accepts a toggle picker with its pressed subset', () => {
    expectTypeOf<
      Shared & { mode: 'toggle'; selected: readonly string[] }
    >().toExtend<PickerProps>();
  });

  // toExtend is structural, the relation a spread of props gets: these hold
  // without the excess-property check that only written-out attributes get.
  it('rejects native radios on a toggle picker, which would render no pressed state', () => {
    expectTypeOf<
      Shared & { mode: 'toggle'; selected: readonly string[]; inputName: string }
    >().not.toExtend<PickerProps>();
  });

  it('rejects a selection shaped for the other mode', () => {
    expectTypeOf<Shared & { mode: 'toggle'; selected: string }>().not.toExtend<PickerProps>();
    expectTypeOf<Shared & { selected: readonly string[] }>().not.toExtend<PickerProps>();
    expectTypeOf<
      Shared & { mode: 'radio'; selected: readonly string[] }
    >().not.toExtend<PickerProps>();
  });

  it('renders each mode with the roles and states its props admit', () => {
    const onSelect = () => {};
    const nativeRadios = servedMarkup({
      label: 'Kind',
      options,
      onSelect,
      selected: 'bug',
      inputName: 'kind',
    });
    const toggles = servedMarkup({
      label: 'Kinds',
      options,
      onSelect,
      mode: 'toggle',
      selected: ['bug'],
    });

    expect(nativeRadios).toContain('role="radiogroup"');
    expect(nativeRadios.match(/type="radio"/g)).toHaveLength(options.length);
    expect(toggles).toContain('role="group"');
    expect(toggles).not.toContain('type="radio"');
    expect(toggles.match(/aria-pressed="(true|false)"/g)).toEqual([
      'aria-pressed="true"',
      'aria-pressed="false"',
    ]);
  });
});
