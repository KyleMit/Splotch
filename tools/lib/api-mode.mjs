import { join } from 'node:path';
import { ROOT } from './proc.mjs';

export const SELECTION_PATH = 'netlify/server/deployment.generated.ts';
export const CONFIGURATION_PATH = 'netlify/server/deploymentConfig.generated.ts';
export const EDGE_DIRECTORY = '.netlify/api-mode-edge';

export function readApiMode(env) {
  const mode = env.SPLOTCH_API_MODE ?? 'production';
  if (mode !== 'production' && mode !== 'test')
    throw new Error('SPLOTCH_API_MODE must be production or test');
  if (mode === 'test' && env.CONTEXT === 'production')
    throw new Error('Test API mode is forbidden in the production deploy context');
  return mode;
}

function modulePath(name, serverDirectory) {
  return serverDirectory ? JSON.stringify(join(serverDirectory, name)) : `'./${name}'`;
}

export function selectionSource(mode, serverDirectory) {
  if (mode !== 'production' && mode !== 'test') throw new Error('Invalid API mode');
  return [
    `export { ${mode === 'test' ? 'fakeAiProvider' : 'openAiProvider'} as aiProvider } from ${modulePath(mode === 'test' ? 'ai/fake' : 'ai/openai', serverDirectory)};`,
    `export { createIssue, isReportingConfigured } from ${modulePath(mode === 'test' ? 'githubTest' : 'githubProduction', serverDirectory)};`,
    '',
  ].join('\n');
}

export function configurationSource(mode, serverDirectory) {
  if (mode !== 'production' && mode !== 'test') throw new Error('Invalid API mode');
  return `export { projectApiKey, scopeStoreName } from ${modulePath(mode === 'test' ? 'deploymentTest' : 'deploymentProduction', serverDirectory)};\n`;
}

export function apiSelectionPlugin(mode) {
  const effectsId = '\0splotch-api-effects';
  const configId = '\0splotch-api-configuration';
  return {
    name: 'splotch-api-selection',
    enforce: 'pre',
    resolveId(id) {
      if (/(^|\/)deployment\.generated(?:\.ts)?$/.test(id)) return effectsId;
      if (/(^|\/)deploymentConfig\.generated(?:\.ts)?$/.test(id)) return configId;
    },
    load(id) {
      const directory = join(ROOT, 'netlify/server');
      if (id === effectsId) return selectionSource(mode, directory);
      if (id === configId) return configurationSource(mode, directory);
    },
  };
}
