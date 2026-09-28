// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Each app-local plugin's JS name is typed once per language, and Capacitor 8 registers neither
// platform's app-local plugins on its own. A JS proxy whose native half is missing, misnamed, or
// never registered still builds on every platform and fails only when a device calls it, as
// "plugin is not implemented". The platform columns are the one fact no source file states in a
// form a test can read.
const NATIVE_PLUGINS = [
  { jsName: 'AppSettings', android: true, ios: true },
  { jsName: 'ColoringPacks', android: true, ios: true },
  { jsName: 'DeviceLock', android: true, ios: true },
  { jsName: 'PencilEraser', android: false, ios: true },
  { jsName: 'PhotoLibrary', android: true, ios: false },
  { jsName: 'SensorOrientation', android: true, ios: false },
  { jsName: 'SystemBack', android: true, ios: false },
] as const;

const ANDROID_SOURCE_DIR = '../../../../android/app/src/main/java/art/splotch/app/';
const IOS_SOURCE_DIR = '../../../../ios/App/App/';

// Capacitor's base plugin class serves addListener on both platforms (PencilEraserPlugin.swift
// declares no methods yet emits events), so a native plugin declares it only to override it, as
// SystemBackPlugin.java does.
const BASE_PLUGIN_METHODS: ReadonlySet<string> = new Set(['addListener']);

interface ProxyDeclaration {
  jsName: string;
  methods: string[];
}

interface NativeDeclaration extends ProxyDeclaration {
  file: string;
  className: string;
}

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function sourceFiles(dir: string, extension: string): { file: string; text: string }[] {
  return readdirSync(new URL(dir, import.meta.url))
    .filter((file) => file.endsWith(extension) && !file.endsWith('.test.ts'))
    .map((file) => ({ file, text: sourceFile(`${dir}${file}`) }));
}

function proxyDeclarations(): ProxyDeclaration[] {
  return sourceFiles('./', '.ts').flatMap(({ file, text }) => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
    const interfaces = new Map(
      source.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, node])
    );
    const found: ProxyDeclaration[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'registerPlugin'
      ) {
        found.push(proxyDeclaration(file, source, interfaces, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  });
}

function proxyDeclaration(
  file: string,
  source: ts.SourceFile,
  interfaces: ReadonlyMap<string, ts.InterfaceDeclaration>,
  call: ts.CallExpression
): ProxyDeclaration {
  const [typeArgument] = call.typeArguments ?? [];
  const [nameArgument] = call.arguments;
  const pluginInterface =
    typeArgument && ts.isTypeReferenceNode(typeArgument)
      ? interfaces.get(typeArgument.typeName.getText(source))
      : undefined;
  if (!pluginInterface || !nameArgument || !ts.isStringLiteral(nameArgument)) {
    throw new Error(
      `${file}: registerPlugin needs an interface from its own module as the type argument and a string-literal name`
    );
  }
  return {
    jsName: nameArgument.text,
    methods: pluginInterface.members
      .filter(ts.isMethodSignature)
      .map((member) => member.name.getText(source)),
  };
}

function androidDeclarations(): NativeDeclaration[] {
  return sourceFiles(ANDROID_SOURCE_DIR, '.java').flatMap(({ file, text }) => {
    const annotations = text.match(/@CapacitorPlugin\b/g) ?? [];
    if (annotations.length === 0) return [];
    const plugin = /@CapacitorPlugin\(\s*name = "(\w+)"[\s\S]*?\bclass (\w+) extends Plugin\b/.exec(
      text
    );
    const methods = [
      ...text.matchAll(/@PluginMethod\b(?:\([^)]*\))?\s+public void (\w+)\(PluginCall \w+\)/g),
    ].map(([, method]) => method);
    const annotatedMethods = text.match(/@PluginMethod\b/g) ?? [];
    if (annotations.length !== 1 || !plugin || methods.length !== annotatedMethods.length) {
      throw new Error(
        `${file}: expected one @CapacitorPlugin(name = "…") class whose every @PluginMethod is a public void method taking a PluginCall`
      );
    }
    return [{ file, jsName: plugin[1], className: plugin[2], methods }];
  });
}

function iosDeclarations(): NativeDeclaration[] {
  return sourceFiles(IOS_SOURCE_DIR, '.swift').flatMap(({ file, text }) => {
    const classes = [...text.matchAll(/\bclass (\w+):[^{]*\bCAPBridgedPlugin\b/g)];
    if (classes.length === 0) return [];
    const jsName = /\blet jsName = "(\w+)"/.exec(text);
    if (classes.length !== 1 || !jsName) {
      throw new Error(`${file}: expected one CAPBridgedPlugin class with a jsName`);
    }
    const methods = [...text.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(
      ([, method]) => method
    );
    return [{ file, jsName: jsName[1], className: classes[0][1], methods }];
  });
}

// MainViewController registers most plugins as `registerPluginInstance(XPlugin())`, and one it
// also calls later through a field (`registerPluginInstance(pencilEraser)`).
function iosRegisteredClasses(controller: string): string[] {
  const fieldClasses = new Map(
    [...controller.matchAll(/\blet (\w+) = (\w+)\(\)/g)].map(([, field, className]) => [
      field,
      className,
    ])
  );
  return [...controller.matchAll(/registerPluginInstance\((\w+)(\(\))?\)/g)].map(
    ([, name, constructed]) => (constructed ? name : (fieldClasses.get(name) ?? name))
  );
}

function declarationOf<T extends ProxyDeclaration>(declarations: readonly T[], jsName: string): T {
  const declaration = declarations.find((candidate) => candidate.jsName === jsName);
  if (!declaration) throw new Error(`Nothing declares the plugin JS name "${jsName}"`);
  return declaration;
}

function jsNames(plugins: readonly { jsName: string }[]): string[] {
  return plugins.map(({ jsName }) => jsName).sort();
}

function ownMethods(methods: readonly string[]): string[] {
  return methods.filter((method) => !BASE_PLUGIN_METHODS.has(method)).sort();
}

const proxies = proxyDeclarations();
const androidPlugins = androidDeclarations();
const iosPlugins = iosDeclarations();
const ANDROID_PLUGINS = NATIVE_PLUGINS.filter(({ android }) => android);
const IOS_PLUGINS = NATIVE_PLUGINS.filter(({ ios }) => ios);

describe('the native plugin table', () => {
  it('lists every registerPlugin proxy under lib/plugins', () => {
    expect(jsNames(proxies)).toEqual(jsNames(NATIVE_PLUGINS));
  });

  it('lists every @CapacitorPlugin class as an Android plugin', () => {
    expect(jsNames(androidPlugins)).toEqual(jsNames(ANDROID_PLUGINS));
  });

  it('lists every CAPBridgedPlugin class as an iOS plugin', () => {
    expect(jsNames(iosPlugins)).toEqual(jsNames(IOS_PLUGINS));
  });

  it('gives every proxy a native implementation', () => {
    expect(NATIVE_PLUGINS.filter(({ android, ios }) => !android && !ios)).toEqual([]);
  });
});

// The lookups stay inside each test so a renamed plugin fails as a readable table diff above
// rather than as a collection error that hides every other result.
describe.each(ANDROID_PLUGINS)('the $jsName plugin on Android', ({ jsName }) => {
  it('is registered before BridgeActivity starts the bridge', () => {
    const plugin = declarationOf(androidPlugins, jsName);
    const activity = sourceFile(`${ANDROID_SOURCE_DIR}MainActivity.java`);
    const bridgeStart = activity.indexOf('super.onCreate(');

    expect(bridgeStart).toBeGreaterThan(0);
    expect(activity.slice(0, bridgeStart)).toContain(`registerPlugin(${plugin.className}.class);`);
  });

  it('implements exactly the methods its JS proxy declares', () => {
    expect(ownMethods(declarationOf(androidPlugins, jsName).methods)).toEqual(
      ownMethods(declarationOf(proxies, jsName).methods)
    );
  });
});

describe.each(IOS_PLUGINS)('the $jsName plugin on iOS', ({ jsName }) => {
  it('is registered on the bridge', () => {
    const plugin = declarationOf(iosPlugins, jsName);
    const controller = sourceFile(`${IOS_SOURCE_DIR}MainViewController.swift`);

    expect(iosRegisteredClasses(controller)).toContain(plugin.className);
  });

  it('is compiled into the App target', () => {
    const plugin = declarationOf(iosPlugins, jsName);
    const project = sourceFile('../../../../ios/App/App.xcodeproj/project.pbxproj');

    expect(project).toContain(`/* ${plugin.file} in Sources */,`);
  });

  it('implements exactly the methods its JS proxy declares', () => {
    expect(ownMethods(declarationOf(iosPlugins, jsName).methods)).toEqual(
      ownMethods(declarationOf(proxies, jsName).methods)
    );
  });
});
