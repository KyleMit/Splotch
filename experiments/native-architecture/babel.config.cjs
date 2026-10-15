const reactStrictPreset = require('react-strict-dom/babel-preset');

const STRICT_DOM = 'react-strict-dom';

// React Strict DOM's web preset compiles every html.* element and css.* call to plain DOM props,
// then leaves the import behind; Metro keeps it as a require that loads RSD's runtime element
// library and StyleX's runtime on the web startup path. This drops each RSD import binding no
// code reads once the preset has run, so only a module that still reads one (html.h2 as a value)
// loads them.
function dropCompiledStrictDomImports() {
  return {
    name: 'drop-compiled-strict-dom-imports',
    visitor: {
      Program: {
        exit(program) {
          program.scope.crawl();
          for (const statement of program.get('body')) {
            if (!statement.isImportDeclaration() || statement.node.source.value !== STRICT_DOM)
              continue;
            const specifiers = statement.get('specifiers');
            if (specifiers.length === 0) continue;
            for (const specifier of specifiers)
              if (!program.scope.getBinding(specifier.node.local.name)?.referenced)
                specifier.remove();
            if (statement.node.specifiers.length === 0) statement.remove();
          }
        },
      },
    },
  };
}

module.exports = function createBabelConfig(api) {
  const platform = api.caller((caller) => caller?.platform ?? 'native');
  const dev = api.caller((caller) => caller?.isDev ?? process.env.NODE_ENV === 'development');
  // Babel runs presets last to first and each plugin's Program exit in that order, so the drop
  // sits between the RSD preset, whose StyleX pass compiles css.props at its exit, and Expo's.
  return {
    presets: [
      require.resolve('babel-preset-expo'),
      ...(platform === 'web' ? [() => ({ plugins: [dropCompiledStrictDomImports] })] : []),
      [reactStrictPreset, { platform, debug: dev, dev }],
    ],
  };
};
