import type { ComponentProps } from 'react';
import { expectTypeOf, it } from 'vitest';
import type { RsdSidebarRow } from './RsdSidebarRow';
import type { SectionIconName } from './RsdSectionIcon';

type RowProps = ComponentProps<typeof RsdSidebarRow>;
type PlainRow = { label: string; active: boolean; onSelect: () => void };

it('keeps activity marks paired with the section icon that holds them', () => {
  expectTypeOf<PlainRow>().toExtend<RowProps>();
  expectTypeOf<PlainRow & { icon: SectionIconName; unseen: boolean }>().toExtend<RowProps>();
  expectTypeOf<PlainRow & { unseen: boolean }>().not.toExtend<RowProps>();
  expectTypeOf<PlainRow & { icon: SectionIconName }>().not.toExtend<RowProps>();
});
