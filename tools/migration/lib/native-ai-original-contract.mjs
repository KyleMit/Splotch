export function assertAiOriginalModelContract(files) {
  for (const [path, versions, imported, call] of [
    [
      'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
      'setOf(5L, 6L, 7L)',
      'setOf(1L, 2L, 3L, 4L, 5L, 6L, 7L)',
      'originalModel(original, kind == "importLegacy")',
    ],
    [
      'ios/HelloWorld/SplotchAIJournal.swift',
      'Set<Int64> = [5, 6, 7]',
      'Set<Int64> = [1, 2, 3, 4, 5, 6, 7]',
      'try originalModel(original, kind == "importLegacy")',
    ],
  ]) {
    const bytes = files.get(path);
    if (!Buffer.isBuffer(bytes)) throw new Error(`Missing maintained native source: ${path}`);
    const source = bytes.toString('utf8');
    const body = source.match(
      /private (?:fun|func) originalModel\b([\s\S]*?)\n {2}private (?:fun|func) dispatch/
    )?.[1];
    if (
      !body ||
      !source.includes(
        'currentOriginalVersions' + (path.endsWith('.kt') ? ' = ' : ': ') + versions
      ) ||
      !source.includes(
        'importedOriginalVersions' + (path.endsWith('.kt') ? ' = ' : ': ') + imported
      )
    )
      throw new Error('Native original model version admission changed');
    for (const token of [
      'maxModel',
      'importedOriginalVersions',
      'currentOriginalVersions',
      '"seedCursor"',
      '"firstSeed"',
      '"styles"',
      '"moves"',
      '"ops"',
      '"points"',
      'maxDrawingContacts',
      'maxDrawingSamples',
      'maxRecordedOps',
      'maxAllocationCursor',
      '"unadopted"',
      'count == 0',
      '"cssWidth"',
      '"cssHeight"',
      '"backingScale"',
    ])
      if (!body.includes(token))
        throw new Error('Native original model envelope changed: ' + token);
    const admission = source.indexOf(call);
    const publication = source.indexOf('atomic(dir, "original.bin", original)');
    if (admission < 0 || publication <= admission || source.split(call).length !== 2)
      throw new Error('Native original model admission must precede publication');
  }
}
