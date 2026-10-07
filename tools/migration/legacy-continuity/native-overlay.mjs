import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replaceOnce } from './contract.mjs';

const SWIFT_FILES = [
  ['LegacyContinuityObserver.swift', 'F0C000000000000000000001', 'F0C000000000000000000002'],
  ['LegacyContinuityDriver.swift', 'F0C000000000000000000003', 'F0C000000000000000000004'],
];

function projectSources(project) {
  for (const [name, build, file] of SWIFT_FILES) {
    assert.ok(
      !project.includes(name) && !project.includes(build) && !project.includes(file),
      'L0_PROJECT_ENTRY_EXISTS'
    );
  }
  const buildFiles = SWIFT_FILES.map(
    ([name, build, file]) =>
      `\t\t${build} /* ${name} in Sources */ = {isa = PBXBuildFile; fileRef = ${file} /* ${name} */; };`
  ).join('\n');
  const references = SWIFT_FILES.map(
    ([name, , file]) =>
      `\t\t${file} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${name}; sourceTree = "<group>"; };`
  ).join('\n');
  project = replaceOnce(
    project,
    '/* End PBXBuildFile section */',
    `${buildFiles}\n/* End PBXBuildFile section */`
  );
  project = replaceOnce(
    project,
    '/* End PBXFileReference section */',
    `${references}\n/* End PBXFileReference section */`
  );
  const groupAnchor = '\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,';
  project = replaceOnce(
    project,
    groupAnchor,
    `${groupAnchor}\n${SWIFT_FILES.map(([name, , file]) => `\t\t\t\t${file} /* ${name} */,`).join('\n')}`
  );
  const sourceAnchor = '\t\t\t\t504EC3081FED79650016851F /* AppDelegate.swift in Sources */,';
  return replaceOnce(
    project,
    sourceAnchor,
    `${sourceAnchor}\n${SWIFT_FILES.map(([name, build]) => `\t\t\t\t${build} /* ${name} in Sources */,`).join('\n')}`
  );
}

export function nativeOverlay(root, configuration, templateRoot) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const template = (name) => readFileSync(join(templateRoot, name), 'utf8');
  const ownedKeys = configuration.observedKeys;
  const vaultAccounts = configuration.vaultAccounts;
  const render = (source) => {
    source = replaceOnce(
      source,
      '@@OWNED_KEYS@@',
      ownedKeys.map((key) => JSON.stringify(key)).join(', ')
    );
    source = replaceOnce(
      source,
      '@@VAULT_ACCOUNTS@@',
      vaultAccounts.map((key) => JSON.stringify(key)).join(', ')
    );
    source = replaceOnce(source, '@@VOLUME_KEY@@', JSON.stringify(configuration.keys.soundVolume));
    source = replaceOnce(
      source,
      '@@PREFERENCES_GROUP@@',
      JSON.stringify(configuration.preferencesGroup)
    );
    return replaceOnce(source, '@@OWNER_KEY@@', JSON.stringify(configuration.ownerKey));
  };
  const activity = 'android/app/src/main/java/art/splotch/app/MainActivity.java';
  const controller = 'ios/App/App/MainViewController.swift';
  let swift = replaceOnce(
    read(controller),
    'class MainViewController: CAPBridgeViewController {',
    'class MainViewController: CAPBridgeViewController {\n    private var legacyContinuityDriver: LegacyContinuityDriver?'
  );
  swift = replaceOnce(
    swift,
    '        bridge.registerPluginInstance(DeviceLockPlugin())',
    '        bridge.registerPluginInstance(DeviceLockPlugin())\n        bridge.registerPluginInstance(LegacyContinuityObserver())'
  );
  swift = replaceOnce(
    swift,
    '        pencilEraser.attach(to: webView)',
    '        pencilEraser.attach(to: webView)\n        legacyContinuityDriver = LegacyContinuityDriver(webView: webView)'
  );
  return {
    [activity]: replaceOnce(
      read(activity),
      '        registerPlugin(DeviceLockPlugin.class);',
      '        registerPlugin(DeviceLockPlugin.class);\n        registerPlugin(LegacyContinuityObserver.class);'
    ),
    [controller]: swift,
    'ios/App/App.xcodeproj/project.pbxproj': projectSources(
      read('ios/App/App.xcodeproj/project.pbxproj')
    ),
    'android/app/src/main/java/art/splotch/app/LegacyContinuityObserver.java': replaceOnce(
      render(template('LegacyContinuityObserver.java.template')),
      '@@VAULT_PREFERENCES@@',
      JSON.stringify(configuration.vaultPreferences)
    ),
    'android/app/src/main/java/art/splotch/app/LegacyContinuityDisk.java': template(
      'LegacyContinuityDisk.java.template'
    ),
    'ios/App/App/LegacyContinuityObserver.swift': render(
      template('LegacyContinuityObserver.swift.template')
    ),
    'ios/App/App/LegacyContinuityDriver.swift': replaceOnce(
      replaceOnce(
        template('LegacyContinuityDriver.swift.template'),
        '@@COMMANDS@@',
        configuration.commands.map((command) => JSON.stringify(command)).join(', ')
      ),
      '@@FIXTURE_PATH@@',
      JSON.stringify(configuration.path)
    ),
  };
}
