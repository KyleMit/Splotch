import { nativeRecoveryBoundaryRules } from './native-ai-recovery-rules.mjs';

const paths = Object.freeze({
  android: 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
  apple: 'ios/HelloWorld/SplotchAIJournal.swift',
});
const operations = Object.freeze([
  'read',
  'prepare',
  'importLegacy',
  'write',
  'retain',
  'pictures',
  'readPreparedUpload',
  'prepareRecovery',
  'commitRecoveryIntent',
  'recordRecoveryStatus',
  'prepareRecoverySendFromHeld',
  'markRecoverySubmission',
  'readRecoveryUpload',
  'recordRecoveryAdmission',
  'recordRecoveryTerminal',
  'retainRecoveryResult',
  'recordAck',
  'readRecoveryAttempt',
]);
const progress = Object.freeze({
  prepared: [
    'prepared',
    'submission-uncertain',
    'admitted',
    'delivery-pinned',
    'retained',
    'acknowledged',
    'terminal',
  ],
  'submission-uncertain': [
    'submission-uncertain',
    'admitted',
    'delivery-pinned',
    'retained',
    'acknowledged',
    'terminal',
  ],
  admitted: ['admitted', 'delivery-pinned', 'retained', 'acknowledged', 'terminal'],
  'delivery-pinned': ['delivery-pinned', 'retained', 'acknowledged'],
  retained: ['retained', 'acknowledged'],
  acknowledged: ['acknowledged'],
  terminal: ['terminal'],
});

const regions = {
  'selected-read': {
    android: ['      "readRecoveryAttempt" -> {', '      "markRecoverySubmission",'],
    apple: ['    case "readRecoveryAttempt":', '    case "markRecoverySubmission",'],
  },
  upload: {
    android: ['          "readRecoveryUpload" -> {', '          "recordRecoveryAdmission" ->'],
    apple: [
      '      if kind == "readRecoveryUpload" {',
      '      if kind == "recordRecoveryAdmission"',
    ],
  },
  read: {
    android: ['      "read" -> {', '      "pictures" ->'],
    apple: ['    case "read":', '    case "pictures":'],
  },
  pictures: {
    android: ['      "pictures" -> {', '      "readPreparedUpload" ->'],
    apple: ['    case "pictures":', '    case "readPreparedUpload":'],
  },
  submission: {
    android: ['          else -> {\n            check(r.getString("state")', '      "read" ->'],
    apple: ['      if kind == "recordRecoveryAdmission"', '    case "read":'],
  },
  'selected-operation': {
    android: [
      '      "markRecoverySubmission", "readRecoveryUpload", "recordRecoveryAdmission" -> {',
      '        when (kind) {',
    ],
    apple: [
      '    case "markRecoverySubmission", "readRecoveryUpload", "recordRecoveryAdmission":',
      '      if kind == "readRecoveryUpload" {',
    ],
  },
};
const orders = {
  recoveryTerminal: [15, 16, 17, 18],
  retainRecovery: [3, 4, 8, 9, 14, 12],
  acknowledgeRecovery: [6, 7, 8, 9, 10, 11],
};

// Exporting the inventory lets falsification tests exercise every production source fence.
export const nativeRecoverySourceRules = Object.freeze([
  ...nativeRecoveryBoundaryRules.map((rule) => {
    if (rule.regionName && !Object.hasOwn(regions, rule.regionName)) fail('missing region owner');
    return {
      ...rule,
      region: regions[rule.regionName]?.[rule.platform],
      ordered: (rule.owner === 'recoveryTerminal' && rule.platform === 'apple'
        ? [16, 17, 18, 19]
        : orders[rule.owner]
      )?.map((position) => rule.tokens[position]),
    };
  }),
  {
    platform: 'android',
    owner: 'exactStrings',
    tokens: ['names.forEach { check(value.get(it) is String) }'],
  },
  {
    platform: 'android',
    owner: 'checkFile',
    tokens: [
      'check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid())',
    ],
  },
  {
    platform: 'apple',
    owner: 'string',
    tokens: ['guard let result = value[key] as? String else { throw failure() }'],
  },
  {
    platform: 'apple',
    owner: 'regular',
    tokens: [
      'fstat(descriptor, &result) == 0 && (result.st_mode & S_IFMT) == S_IFREG &&',
      'result.st_nlink == 1 && result.st_uid == geteuid()',
    ],
  },
  {
    platform: 'apple',
    owner: 'fileStat',
    tokens: ['try checked(lstat(path, &result) == 0 && result.st_uid == geteuid())'],
  },
  {
    platform: 'android',
    owner: 'keys',
    tokens: ['check(value.keys().asSequence().toSet() == names.toSet())'],
  },
  { platform: 'apple', owner: 'keys', tokens: ['try checked(Set(value.keys) == Set(expected))'] },
  {
    platform: 'android',
    owner: 'integer',
    tokens: [
      'check(raw is Number && raw !is Float && raw.toDouble().isFinite())',
      'check(raw.toDouble() == number.toDouble() && number in minimum..safeInteger)',
    ],
  },
  {
    platform: 'apple',
    owner: 'integer',
    tokens: [
      'guard let number = value[key] as? NSNumber else { throw failure() }',
      'CFGetTypeID(number) != CFBooleanGetTypeID() && number.doubleValue.isFinite &&',
      'number.doubleValue == Double(number.int64Value) && number.int64Value >= minimum && number.int64Value <= safeInteger',
    ],
  },
  {
    platform: 'android',
    owner: 'atomic',
    tokens: [
      'check(read(final, bytes.size).contentEquals(bytes))',
      'try { checkFile(fd); Os.fsync(fd) } finally { Os.close(fd) }',
      'OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW',
      'stream.write(bytes); stream.flush(); stream.fd.sync()',
      'check(read(pending, bytes.size).contentEquals(bytes))',
      'check(!final.exists())',
      'Os.rename(pending.path, final.path)\n    fence(dir)',
    ],
  },
  {
    platform: 'apple',
    owner: 'atomic',
    tokens: [
      'try checked(read(final, bytes.count) == bytes)',
      '_ = try regular(descriptor)',
      'try checked(fsync(descriptor) == 0 && fcntl(descriptor, F_FULLFSYNC) == 0)',
      'O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC',
      'try checked(read(pending, bytes.count) == bytes)',
      'renameatx_np(AT_FDCWD, pending.path, AT_FDCWD, final.path, UInt32(RENAME_EXCL)) == 0',
      'try fence(dir)\n      try checked(fcntl(descriptor, F_FULLFSYNC) == 0)',
    ],
  },
  {
    platform: 'android',
    owner: 'limits',
    tokens: [
      'maxModel = 8 * 1024 * 1024',
      'maxUpload = 15 * 1024 * 1024',
      'maxResult = 16 * 1024 * 1024',
      'maxJournal = 32 * 1024',
      'maxRecoveryJson = 8192',
    ],
  },
  {
    platform: 'apple',
    owner: 'limits',
    tokens: [
      'maxModel = 8 * 1024 * 1024',
      'maxUpload = 15 * 1024 * 1024',
      'maxResult = 16 * 1024 * 1024',
      'maxJournal = 32 * 1024',
      'maxRecoveryJson = 8192',
    ],
  },
  {
    platform: 'android',
    owner: 'unresolved',
    tokens: [
      'integer(value, "schema") == 2L || value.getJSONObject("journal").getString("phase") !in setOf("result", "failed")',
    ],
  },
  {
    platform: 'apple',
    owner: 'unresolved',
    tokens: [
      'try integer(value, "schema") == 2 || !["result", "failed"].contains(string(object(value["journal"]), "phase"))',
    ],
  },
  {
    platform: 'android',
    owner: 'decode',
    tokens: [
      'check(encoded.length <= ((cap + 2) / 3) * 4 && Regex("[A-Za-z0-9+/]*={0,2}").matches(encoded))',
      'check(it.isNotEmpty() && it.size <= cap && Base64.encodeToString(it, Base64.NO_WRAP) == encoded)',
    ],
  },
  {
    platform: 'apple',
    owner: 'decode',
    tokens: [
      'try checked(encoded.utf8.count <= ((cap + 2) / 3) * 4 && matches(encoded, "[A-Za-z0-9+/]*={0,2}"))',
      'guard let bytes = Data(base64Encoded: encoded), !bytes.isEmpty, bytes.count <= cap,',
      'bytes.base64EncodedString() == encoded else { throw failure() }',
    ],
  },
  {
    platform: 'android',
    owner: 'same',
    tokens: [
      'if (a.keys().asSequence().toSet() != b.keys().asSequence().toSet()) return false',
      'return a.keys().asSequence().all { key ->',
      'if (x is JSONObject && y is JSONObject) same(x, y) else x == y',
    ],
  },
  { platform: 'apple', owner: 'same', tokens: ['NSDictionary(dictionary: a).isEqual(to: b)'] },
]);

function fail(label) {
  throw new Error(`Native journal contract mismatch: recovery ${label}`);
}
function source(files, platform) {
  const value = files.get(paths[platform]);
  if (!Buffer.isBuffer(value)) fail(`missing ${platform}`);
  return value.toString('utf8');
}
function uniqueOffset(text, token, label) {
  const offset = text.indexOf(token);
  if (offset < 0 || text.indexOf(token, offset + token.length) >= 0) fail(label);
  return offset;
}

export function nativeRecoverySourceScope(text, rule) {
  const headers = [...text.matchAll(/^ {2}(?:private )?(?:fun|func) ([A-Za-z0-9_]+)\(/gm)];
  if (rule.owner === 'limits')
    return { start: 0, end: headers[0].index, body: text.slice(0, headers[0].index) };
  const selected = headers.filter((match) => match[1] === rule.owner);
  if (selected.length !== 1) fail(`${rule.platform} ${rule.owner} owner`);
  const header = selected[0];
  const next = headers.find((match) => match.index > header.index);
  let start = header.index,
    end = next?.index ?? text.length;
  if (rule.region) {
    const body = text.slice(start, end);
    const offset = uniqueOffset(body, rule.region[0], `${rule.owner} region start`);
    const finish = uniqueOffset(body, rule.region[1], `${rule.owner} region end`);
    if (finish <= offset) fail(`${rule.owner} region order`);
    end = start + finish;
    start += offset;
  }
  return { start, end, body: text.slice(start, end) };
}

export function readNativeRecoveryProgress(text, platform) {
  const { body } = nativeRecoverySourceScope(text, { platform, owner: 'requestProgress' });
  const expression =
    platform === 'android' ? /"([a-z-]+)" -> setOf\(([^)]*)\)/g : /"([a-z-]+)": \[([^\]]*)\]/g;
  const result = {};
  for (const match of body.matchAll(expression)) {
    if (Object.hasOwn(result, match[1])) fail(`${platform} duplicate state`);
    result[match[1]] = [...match[2].matchAll(/"([a-z-]+)"/g)].map((item) => item[1]);
  }
  if (platform === 'android') {
    if (!body.includes('else -> setOf("terminal")')) fail('Android terminal progress');
    result.terminal = ['terminal'];
  }
  return result;
}
function assertDispatch(text, platform) {
  const { body } = nativeRecoverySourceScope(text, { platform, owner: 'dispatch' });
  const expression =
    platform === 'android'
      ? /^ {6}((?:"[A-Za-z]+"(?:, )?)+) ->/gm
      : /^ {4}case ((?:"[A-Za-z]+"(?:, )?)+):/gm;
  const actual = [...body.matchAll(expression)].flatMap((match) =>
    [...match[1].matchAll(/"([A-Za-z]+)"/g)].map((item) => item[1])
  );
  if (
    actual.length !== operations.length ||
    new Set(actual).size !== operations.length ||
    actual.some((name) => !operations.includes(name))
  )
    fail(`${platform} finite operation vocabulary`);
  if (
    !(platform === 'android'
      ? body.includes('else -> error("Unknown storage operation")')
      : body.includes('default: throw failure()'))
  )
    fail(`${platform} unknown operation`);
}
function assertRule(text, rule) {
  const { body } = nativeRecoverySourceScope(text, rule);
  for (const token of rule.tokens)
    if (!body.includes(token)) fail(`${rule.platform} ${rule.owner}: ${token}`);
  let previous = -1;
  for (const token of rule.ordered ?? []) {
    const offset = uniqueOffset(body, token, `${rule.owner} ordered ${token}`);
    if (offset <= previous) fail(`${rule.platform} ${rule.owner} publication order`);
    previous = offset;
  }
}
export function assertAiRecoverySourceContract(files) {
  for (const platform of Object.keys(paths)) {
    const text = source(files, platform);
    for (const rule of nativeRecoverySourceRules.filter((entry) => entry.platform === platform))
      assertRule(text, rule);
    assertDispatch(text, platform);
    if (JSON.stringify(readNativeRecoveryProgress(text, platform)) !== JSON.stringify(progress))
      fail(`${platform} monotonic progress vocabulary`);
  }
}
