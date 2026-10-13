const reactStrictPreset = require('react-strict-dom/babel-preset');

module.exports = function createBabelConfig(api) {
  const platform = api.caller((caller) => caller?.platform ?? 'native');
  const dev = api.caller((caller) => caller?.isDev ?? process.env.NODE_ENV === 'development');
  return {
    presets: [
      require.resolve('babel-preset-expo'),
      [reactStrictPreset, { platform, debug: dev, dev }],
    ],
  };
};
