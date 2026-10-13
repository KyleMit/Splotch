module.exports = function createBrowserBabelConfig(api) {
  api.cache(true);
  const preset = require('react-strict-dom/babel-preset');
  const stylex = require('@stylexjs/babel-plugin');
  const web = preset(null, { platform: 'web', debug: false, dev: false });
  if (web.plugins.length !== 2 || web.plugins[1][0] !== stylex || web.plugins[1][1].runtimeInjection !== false) throw new Error('RSD_PRESET_CONTRACT');
  web.plugins[1][1] = { ...web.plugins[1][1], runtimeInjection: true };
  return { presets: [require.resolve('babel-preset-expo')], plugins: web.plugins };
};
