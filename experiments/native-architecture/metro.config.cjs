const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('node:path');
const { createColoringAssetsMiddleware } = require('./scripts/serve-coloring-assets.cjs');

const config = getDefaultConfig(__dirname);
const defaultEnhancer = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const fallback = defaultEnhancer ? defaultEnhancer(middleware, metroServer) : middleware;
  const serveColoringAssets = createColoringAssetsMiddleware(
    resolve(__dirname, '../../web/static/coloring')
  );
  return (request, response, next) =>
    serveColoringAssets(request, response, () => fallback(request, response, next));
};

module.exports = config;
