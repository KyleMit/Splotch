import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  assertAiRecoverySourceContract,
  nativeRecoverySourceRules,
  nativeRecoverySourceScope,
  readNativeRecoveryProgress,
} from '../lib/native-ai-recovery-contract.mjs';

const candidate = new URL('../../../experiments/native-architecture/', import.meta.url);
const paths = {
  android: 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
  apple: 'ios/HelloWorld/SplotchAIJournal.swift',
};
function fixture() {
  return new Map(
    Object.values(paths).map((path) => [path, readFileSync(new URL(path, candidate))])
  );
}
function mutateScope(files, rule, change) {
  const path = paths[rule.platform],
    source = files.get(path).toString('utf8');
  const { start, end, body } = nativeRecoverySourceScope(source, rule);
  files.set(path, Buffer.from(source.slice(0, start) + change(body) + source.slice(end)));
}

it('accepts both actual maintained schema 3 source owners', () => {
  expect(() => assertAiRecoverySourceContract(fixture())).not.toThrow();
});
it('pins every production fence owner and its independent omission coverage count', () => {
  expect(
    nativeRecoverySourceRules.map(({ platform, owner, tokens, ordered }) => [
      platform,
      owner,
      tokens.length,
      ordered?.length ?? 0,
    ])
  ).toEqual([
    ['android', 'recoveryProgress', 1, 0],
    ['apple', 'recoveryProgress', 1, 0],
    ['android', 'latest', 19, 0],
    ['apple', 'latest', 19, 0],
    ['android', 'recoveryRequest', 34, 0],
    ['apple', 'recoveryRequest', 24, 0],
    ['android', 'delivery', 5, 0],
    ['apple', 'delivery', 4, 0],
    ['android', 'requestProgress', 10, 0],
    ['apple', 'requestProgress', 10, 0],
    ['android', 'sourceHeld', 5, 0],
    ['apple', 'sourceHeld', 5, 0],
    ['android', 'selectedRequest', 3, 0],
    ['apple', 'selectedRequest', 3, 0],
    ['android', 'prepareRecoverySend', 18, 0],
    ['apple', 'prepareRecoverySend', 18, 0],
    ['android', 'publishRequest', 5, 0],
    ['apple', 'publishRequest', 5, 0],
    ['android', 'recoveryAdmission', 8, 0],
    ['apple', 'recoveryAdmission', 8, 0],
    ['android', 'recoveryTerminal', 19, 4],
    ['apple', 'recoveryTerminal', 20, 4],
    ['android', 'recoveryResultFile', 9, 0],
    ['apple', 'recoveryResultFile', 14, 0],
    ['android', 'retainRecovery', 18, 6],
    ['apple', 'retainRecovery', 18, 6],
    ['android', 'confirm', 6, 0],
    ['apple', 'confirm', 7, 0],
    ['android', 'acknowledgeRecovery', 12, 6],
    ['apple', 'acknowledgeRecovery', 12, 6],
    ['android', 'confirmedAttempts', 3, 0],
    ['apple', 'confirmedAttempts', 4, 0],
    ['android', 'dispatch', 2, 0],
    ['apple', 'dispatch', 2, 0],
    ['android', 'dispatch', 6, 0],
    ['apple', 'dispatch', 6, 0],
    ['android', 'dispatch', 1, 0],
    ['apple', 'dispatch', 1, 0],
    ['android', 'dispatch', 1, 0],
    ['apple', 'dispatch', 1, 0],
    ['android', 'dispatch', 3, 0],
    ['apple', 'dispatch', 3, 0],
    ['android', 'dispatch', 3, 0],
    ['apple', 'dispatch', 3, 0],
    ['android', 'exactStrings', 1, 0],
    ['android', 'checkFile', 1, 0],
    ['apple', 'string', 1, 0],
    ['apple', 'regular', 2, 0],
    ['apple', 'fileStat', 1, 0],
    ['android', 'keys', 1, 0],
    ['apple', 'keys', 1, 0],
    ['android', 'integer', 2, 0],
    ['apple', 'integer', 3, 0],
    ['android', 'atomic', 7, 0],
    ['apple', 'atomic', 7, 0],
    ['android', 'limits', 5, 0],
    ['apple', 'limits', 5, 0],
    ['android', 'unresolved', 1, 0],
    ['apple', 'unresolved', 1, 0],
    ['android', 'decode', 2, 0],
    ['apple', 'decode', 3, 0],
    ['android', 'same', 3, 0],
    ['apple', 'same', 1, 0],
  ]);
});

const omissions = nativeRecoverySourceRules.flatMap((rule, index) =>
  rule.tokens.map((token) => [`${rule.platform}/${rule.owner}/${index}: ${token}`, rule, token])
);
it.each(omissions)('rejects an omitted owner-scoped boundary %s', (_label, rule, token) => {
  const files = fixture();
  expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
  mutateScope(files, rule, (body) => body.replaceAll(token, ''));
  expect(() => assertAiRecoverySourceContract(files)).toThrow(
    'Native journal contract mismatch: recovery'
  );
});

const orders = nativeRecoverySourceRules.flatMap((rule) =>
  (rule.ordered ?? [])
    .slice(1)
    .map((token, index) => [
      `${rule.platform}/${rule.owner}/${index}`,
      rule,
      rule.ordered[index],
      token,
    ])
);
it.each(orders)(
  'rejects reordered confirmation or publication edge %s',
  (_label, rule, before, after) => {
    const files = fixture();
    expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
    mutateScope(files, rule, (body) =>
      body
        .replace(before, '__ORDER_FIRST__')
        .replace(after, before)
        .replace('__ORDER_FIRST__', after)
    );
    expect(() => assertAiRecoverySourceContract(files)).toThrow('publication order');
  }
);

const dispatchMutations = [
  ['android', '      "recordRecoveryTerminal" -> recoveryTerminal(input)', ''],
  ['apple', '    case "recordRecoveryTerminal": return try recoveryTerminal(root, input)', ''],
  [
    'android',
    '      "recordRecoveryTerminal" -> recoveryTerminal(input)',
    '      "recordAck" -> recoveryTerminal(input)',
  ],
  [
    'apple',
    '    case "recordRecoveryTerminal": return try recoveryTerminal(root, input)',
    '    case "recordAck": return try recoveryTerminal(root, input)',
  ],
  [
    'android',
    '      "prepare", "importLegacy", "prepareRecovery" ->',
    '      "prepare", "importLegacy", "prepareRecovery", "unreviewed" ->',
  ],
  [
    'apple',
    '    case "prepare", "importLegacy", "prepareRecovery":',
    '    case "prepare", "importLegacy", "prepareRecovery", "unreviewed":',
  ],
  ['android', '      "write", "retain" ->', '      "write", "write" ->'],
  ['apple', '    case "write", "retain":', '    case "write", "write":'],
  ['android', 'else -> error("Unknown storage operation")', 'else -> JSONObject()'],
  ['apple', 'default: throw failure()', 'default: return [:]'],
];
it.each(dispatchMutations)(
  'rejects open, duplicate or default operation dispatch in %s: %s',
  (platform, from, to) => {
    const files = fixture();
    expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
    mutateScope(files, { platform, owner: 'dispatch' }, (body) => body.replace(from, to));
    expect(() => assertAiRecoverySourceContract(files)).toThrow('operation');
  }
);

it.each(['android', 'apple'])(
  'accepts the bounded three-revision pre-prune source policy in %s',
  (platform) => {
    const files = fixture(),
      source = files.get(paths[platform]).toString('utf8');
    const policy = readNativeRecoveryProgress(source, platform);
    const newestFirst = ['retained', 'delivery-pinned', 'prepared'];
    expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
    expect(newestFirst.every((older) => policy[older].includes(newestFirst[0]))).toBe(true);
  }
);
it.each(['android', 'apple'])(
  'rejects a three-revision regression in the extracted source policy in %s',
  (platform) => {
    const files = fixture(),
      source = files.get(paths[platform]).toString('utf8');
    const policy = readNativeRecoveryProgress(source, platform);
    const regressedNewestFirst = ['prepared', 'delivery-pinned', 'retained'];
    expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
    expect(
      regressedNewestFirst.every((older) => policy[older].includes(regressedNewestFirst[0]))
    ).toBe(false);
  }
);
it.each([
  [
    'android',
    '"retained" -> setOf("retained", "acknowledged")',
    '"retained" -> setOf("retained", "acknowledged", "prepared")',
  ],
  [
    'apple',
    '"retained": ["retained", "acknowledged"]',
    '"retained": ["retained", "acknowledged", "prepared"]',
  ],
])('rejects a native transition table that permits regression in %s', (platform, from, to) => {
  const files = fixture();
  expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
  mutateScope(files, { platform, owner: 'requestProgress' }, (body) => body.replace(from, to));
  expect(() => assertAiRecoverySourceContract(files)).toThrow('monotonic progress vocabulary');
});

it.each([
  [
    'android',
    'Os.remove(pending.path); fence(dir)',
    'Os.remove(File(dir, "original.bin").path); fence(dir)',
  ],
  [
    'android',
    'Os.remove(pending.path); fence(dir)',
    'Os.remove(File(dir, "upload.bin").path); fence(dir)',
  ],
  [
    'android',
    'Os.remove(pending.path); fence(dir)',
    'Os.remove(File(dir, "journal-1.json").path); fence(dir)',
  ],
  [
    'apple',
    'try checked(unlink(pending.path) == 0); try fence(dir)',
    'try checked(unlink(dir.appendingPathComponent("original.bin").path) == 0); try fence(dir)',
  ],
  [
    'apple',
    'try checked(unlink(pending.path) == 0); try fence(dir)',
    'try checked(unlink(dir.appendingPathComponent("upload.bin").path) == 0); try fence(dir)',
  ],
  [
    'apple',
    'try checked(unlink(pending.path) == 0); try fence(dir)',
    'try checked(unlink(dir.appendingPathComponent("journal-1.json").path) == 0); try fence(dir)',
  ],
])(
  'rejects cleanup redirected beyond the owned result temporary file in %s',
  (platform, from, to) => {
    const files = fixture();
    expect(() => assertAiRecoverySourceContract(files)).not.toThrow();
    mutateScope(files, { platform, owner: 'recoveryResultFile' }, (body) => body.replace(from, to));
    expect(() => assertAiRecoverySourceContract(files)).toThrow('recoveryResultFile');
  }
);
