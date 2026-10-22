import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { host } from './rsd-native-selection-host.mjs';
import { click, mountProduct } from './rsd-native-parent-center-fixture.mjs';
import { gateKey } from './rsd-parent-gate-keypad.mjs';

function assertKeypadSelector(expression) {
  for (const digit of Array.from({ length: 10 }, (_, digit) => digit)) {
    const id = runInNewContext(expression.slice(2, -1), {
      output: { answer: String(digit), digitIndex: 0 },
    });
    expect(host.querySelector(`[data-testid="${id}"]`)).toBe(gateKey(digit));
  }
}

it('binds Maestro digit selectors to the rendered native keypad with a drift negative control', async () => {
  await mountProduct();
  await click('Parent Center fixture entry');
  const commands = parseAllDocuments(
    readFileSync(resolve(import.meta.dirname, '../../../.maestro/api-generation.yaml'), 'utf8')
  )[1].toJS();
  const expression = commands.find((command) => command.repeat).repeat.commands[0].tapOn.id;
  assertKeypadSelector(expression);
  expect(() => assertKeypadSelector(expression.replace('gate-key-', 'broken-key-'))).toThrow();
});
