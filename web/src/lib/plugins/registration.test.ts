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

const FIELDLESS_TYPE_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.VoidKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.StringKeyword,
]);

// Java and Swift share comment syntax, and commented-out native code must count as absent. String
// literals match first so a `//` inside one is not read as a comment.
const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

interface ProxyDeclaration {
  jsName: string;
  methods: string[];
  // Each own method's distinct resolve payloads, as field-name lists. The fields reach JS untyped,
  // so a native rename or a dropped payload fails only on a device, where the field reads as
  // undefined.
  resolvedPayloads: Record<string, string[][]>;
}

interface NativeDeclaration extends ProxyDeclaration {
  file: string;
  className: string;
}

interface IosDeclaration extends NativeDeclaration {
  // Capacitor calls a declared method through the `<name>:` Objective-C selector.
  objcMethods: string[];
}

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function withoutComments(code: string): string {
  return code.replace(COMMENT_OR_STRING, (_match, string: string | undefined) => string ?? ' ');
}

function nativeSourceFile(path: string): string {
  return withoutComments(sourceFile(path));
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
  // The proxy turns every member access into a native call, so a property counts as a method.
  const methods = pluginInterface.members.map((member) => {
    if (!member.name) throw new Error(`${file}: every plugin interface member needs a name`);
    return member.name.getText(source);
  });
  const signatures = new Map(
    pluginInterface.members
      .filter(ts.isMethodSignature)
      .map((member) => [member.name.getText(source), member])
  );
  return {
    jsName: nameArgument.text,
    methods,
    resolvedPayloads: payloadsByMethod(methods, (method) => [
      promisedFields(file, source, interfaces, method, signatures.get(method)),
    ]),
  };
}

// Reads a method's Promise<T> through object literal types, arrays, and interfaces declared in the
// proxy's own module. Any other shape throws rather than passing as a result without fields.
function promisedFields(
  file: string,
  source: ts.SourceFile,
  interfaces: ReadonlyMap<string, ts.InterfaceDeclaration>,
  method: string,
  signature: ts.MethodSignature | undefined
): string[] {
  const returned = signature?.type;
  if (
    !returned ||
    !ts.isTypeReferenceNode(returned) ||
    returned.typeName.getText(source) !== 'Promise'
  ) {
    throw new Error(
      `${file}: ${method} needs a method signature with a declared Promise<…> result`
    );
  }
  const fields: string[] = [];
  const visitMembers = (members: readonly ts.TypeElement[]): void => {
    for (const member of members) {
      if (!member.name) throw new Error(`${file}: every resolved field needs a name`);
      fields.push(member.name.getText(source));
      if (ts.isPropertySignature(member)) visitType(member.type);
    }
  };
  const visitType = (type: ts.TypeNode | undefined): void => {
    if (!type || FIELDLESS_TYPE_KINDS.has(type.kind)) return;
    if (ts.isArrayTypeNode(type)) visitType(type.elementType);
    else if (ts.isTypeLiteralNode(type)) visitMembers(type.members);
    else {
      const local = ts.isTypeReferenceNode(type)
        ? interfaces.get(type.typeName.getText(source))
        : undefined;
      if (!local) {
        throw new Error(
          `${file}: ${method} resolves ${type.getText(source)}, which is not an object literal, array, or local interface`
        );
      }
      visitMembers(local.members);
    }
  };
  visitType(returned.typeArguments?.[0]);
  return fields;
}

// A method may resolve from a private helper (ColoringPacks' install resolves inside observe) with
// a payload built in another (installedPack), so its payloads follow calls into the class's own
// methods, and each resolved value back to the `put` calls that filled it.
function androidPayloads(bodies: ReadonlyMap<string, string>, method: string): string[][] {
  const reached = new Set([method]);
  for (const name of reached) {
    for (const [, callee] of (bodies.get(name) ?? '').matchAll(/\b(\w+)\(/g)) {
      if (bodies.has(callee)) reached.add(callee);
    }
  }
  return [...reached].flatMap((name) => {
    const body = bodies.get(name) ?? '';
    return resolvedArguments(body).map((value) => javaPayloadFields(value, body, bodies));
  });
}

// Keyed by the name of each method declared with an access modifier; a method nested in an
// anonymous class also appears inside its enclosing method's body.
function javaMethodBodies(text: string): Map<string, string> {
  return new Map(
    [
      ...text.matchAll(/\b(?:public|private|protected)\b[^;={}()]*?\b(\w+)\([^()]*\)[^;{}()]*\{/g),
    ].map((declaration) => [
      declaration[1],
      enclosed(text, declaration.index + declaration[0].length, '{', '}'),
    ])
  );
}

function javaPayloadFields(
  value: string,
  scope: string,
  bodies: ReadonlyMap<string, string>
): string[] {
  const [, helper = ''] = /^(\w+)\(/.exec(value) ?? [];
  const helperBody = bodies.get(helper);
  if (helperBody !== undefined) {
    // A second return could resolve a different payload the guard never reads.
    const returns = [...helperBody.matchAll(/\breturn\b([^;]*);/g)].map(([, returned]) =>
      returned.trim()
    );
    if (returns.length !== 1 || !/^\w+$/.test(returns[0])) {
      throw new Error(`${helper} needs exactly one return, of a local payload variable`);
    }
    return javaPayloadFields(returns[0], helperBody, bodies);
  }
  if (!/^\w+$/.test(value)) return [];
  return [...scope.matchAll(new RegExp(`\\b${value}\\.put\\(`, 'g'))].flatMap((put) => {
    const [, field, element] =
      /^(?:"(\w+)",)?\s*([\s\S]*)$/.exec(enclosed(scope, put.index + put[0].length, '(', ')')) ??
      [];
    const nested = javaPayloadFields(element.trim(), scope, bodies);
    return field ? [field, ...nested] : nested;
  });
}

// Swift resolves a dictionary literal in the method body, possibly nesting another in a closure, so
// every string key inside one of the body's `.resolve(…)` argument lists counts.
function iosPayloads(text: string, method: string): string[][] {
  const declaration = new RegExp(
    `@objc\\s+(?:\\w+\\s+)*?func ${method}\\(_ \\w+: CAPPluginCall\\)[^{]*\\{`
  ).exec(text);
  if (!declaration) return [];
  const body = enclosed(text, declaration.index + declaration[0].length, '{', '}');
  return resolvedArguments(body).map((value) =>
    [...value.matchAll(/"(\w+)"\s*:/g)].map(([, field]) => field)
  );
}

function resolvedArguments(body: string): string[] {
  return [...body.matchAll(/\.resolve\(/g)].map((call) =>
    enclosed(body, call.index + call[0].length, '(', ')').trim()
  );
}

// Returns the text from `start` up to the `close` that balances an `open` just before it.
function enclosed(text: string, start: number, open: string, close: string): string {
  let depth = 1;
  for (let end = start; end < text.length; end++) {
    if (text[end] === open) depth++;
    else if (text[end] === close && --depth === 0) return text.slice(start, end);
  }
  throw new Error(`A "${open}" opened at offset ${start} never closes`);
}

function androidDeclarations(): NativeDeclaration[] {
  return sourceFiles(ANDROID_SOURCE_DIR, '.java').flatMap(({ file, text: rawText }) => {
    const text = withoutComments(rawText);
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
    const bodies = javaMethodBodies(text);
    return [
      {
        file,
        jsName: plugin[1],
        className: plugin[2],
        methods,
        resolvedPayloads: payloadsByMethod(methods, (method) => androidPayloads(bodies, method)),
      },
    ];
  });
}

function iosDeclarations(): IosDeclaration[] {
  return sourceFiles(IOS_SOURCE_DIR, '.swift').flatMap(({ file, text: rawText }) => {
    const text = withoutComments(rawText);
    const classes = [...text.matchAll(/\bclass (\w+):[^{]*\bCAPBridgedPlugin\b/g)];
    if (classes.length === 0) return [];
    const jsName = /\blet jsName = "(\w+)"/.exec(text);
    if (classes.length !== 1 || !jsName) {
      throw new Error(`${file}: expected one CAPBridgedPlugin class with a jsName`);
    }
    const methods = [...text.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(
      ([, method]) => method
    );
    const objcMethods = [
      ...text.matchAll(/@objc\s+(?:\w+\s+)*?func (\w+)\(_ \w+: CAPPluginCall\)/g),
    ].map(([, method]) => method);
    return [
      {
        file,
        jsName: jsName[1],
        className: classes[0][1],
        methods,
        objcMethods,
        resolvedPayloads: payloadsByMethod(methods, (method) => iosPayloads(text, method)),
      },
    ];
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

function sortedDistinct(names: readonly string[]): string[] {
  return [...new Set(names)].sort();
}

function ownMethods(methods: readonly string[]): string[] {
  return sortedDistinct(methods).filter((method) => !BASE_PLUGIN_METHODS.has(method));
}

// A method with no resolve call of its own text (cancel's `call::resolve`) counts as resolving one
// payload without fields, so a payload the reader cannot find fails instead of passing unread.
function payloadsByMethod(
  methods: readonly string[],
  payloadsOf: (method: string) => string[][]
): Record<string, string[][]> {
  return Object.fromEntries(
    ownMethods(methods).map((method) => {
      const payloads = new Map(
        payloadsOf(method)
          .map(sortedDistinct)
          .map((fields) => [fields.join(), fields])
      );
      return [method, payloads.size > 0 ? [...payloads.values()] : [[]]];
    })
  );
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
    const activity = nativeSourceFile(`${ANDROID_SOURCE_DIR}MainActivity.java`);
    const bridgeStart = activity.indexOf('super.onCreate(');

    expect(bridgeStart).toBeGreaterThan(0);
    expect(activity.slice(0, bridgeStart)).toContain(`registerPlugin(${plugin.className}.class);`);
  });

  it('implements exactly the methods its JS proxy declares', () => {
    expect(ownMethods(declarationOf(androidPlugins, jsName).methods)).toEqual(
      ownMethods(declarationOf(proxies, jsName).methods)
    );
  });

  it('resolves each method with exactly the fields its JS proxy declares', () => {
    expect(declarationOf(androidPlugins, jsName).resolvedPayloads).toEqual(
      declarationOf(proxies, jsName).resolvedPayloads
    );
  });
});

describe.each(IOS_PLUGINS)('the $jsName plugin on iOS', ({ jsName }) => {
  it('is registered on the bridge', () => {
    const plugin = declarationOf(iosPlugins, jsName);
    const controller = nativeSourceFile(`${IOS_SOURCE_DIR}MainViewController.swift`);

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

  it('resolves each method with exactly the fields its JS proxy declares', () => {
    expect(declarationOf(iosPlugins, jsName).resolvedPayloads).toEqual(
      declarationOf(proxies, jsName).resolvedPayloads
    );
  });

  it('backs every declared method with an @objc func the bridge can call', () => {
    const plugin = declarationOf(iosPlugins, jsName);

    expect([...plugin.objcMethods].sort()).toEqual([...plugin.methods].sort());
  });
});
