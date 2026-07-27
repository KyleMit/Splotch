export function warnIfNoPerfMarks(command) {
  if (process.env.PERF_MARKS !== 'true') {
    console.warn(`! PERF_MARKS is not "true" — engine.* marks will be absent. Use \`${command}\`.`);
  }
}
