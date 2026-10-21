// adapter-netlify ends the SvelteKit function module with a literal config, which
// Netlify reads by static analysis:
//
//   export const config = {
//   	path: ["/*"],
//   	excludedPath: ["/.netlify/*"],
//   	preferStatic: true
//   };
//
// excludeFunctionRoutes adds paths to that excludedPath list, and throws rather
// than stage a function whose list it could not find.
const EXCLUDED_PATH = /^(\s*excludedPath: \[)(.*)(\],?)$/m;

export function excludeFunctionRoutes(source, paths) {
  const configAt = source.lastIndexOf('export const config = {');
  const match = configAt < 0 ? null : EXCLUDED_PATH.exec(source.slice(configAt));
  if (!match) {
    throw new Error('The SvelteKit function has no adapter-netlify excludedPath list to extend');
  }
  const listed = [match[2], ...paths.map((path) => JSON.stringify(path))].join(', ');
  const start = configAt + match.index;
  const end = start + match[0].length;
  return `${source.slice(0, start)}${match[1]}${listed}${match[3]}${source.slice(end)}`;
}
