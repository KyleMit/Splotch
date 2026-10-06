import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { realpathSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { join } from 'node:path';

const RSA_FIXTURE_BITS = 2048;
const CERTIFICATE_VALIDITY_RADIUS_MS = 60_000;
const FIXTURE_IDENTITY = 'SPLOTCH-PUBLIC-FIXTURE';

function fixtureKeys() {
  return generateKeyPairSync('rsa', {
    modulusLength: RSA_FIXTURE_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function der(tag, value) {
  assert.ok(value.length < 128, 'Bounded regression DER value exceeds short length');
  return String.fromCharCode(tag, value.length) + value;
}

function digestInfo(forge, digest, mode) {
  const oid = forge.asn1.oidToDer(forge.oids.sha256).getBytes();
  const parameters =
    mode === 'absent'
      ? ''
      : mode.startsWith('nonempty-')
        ? der(5, 'x'.repeat(Number(mode.split('-')[1])))
        : mode === 'constructed'
          ? '\x25\x00'
          : mode === 'long-null'
            ? '\x05\x81\x00'
            : '\x05\x00';
  const selectedOid = mode === 'nonminimal-oid' ? oid[0] + '\x80' + oid.slice(1) : oid;
  const extra = mode === 'nested-extra' ? der(4, 'garbage') : '';
  const algorithmBody = der(6, selectedOid) + parameters + extra;
  const algorithm =
    mode === 'indefinite-inner' ? '\x30\x80' + algorithmBody + '\x00\x00' : der(48, algorithmBody);
  const outerExtra = mode === 'outer-extra' ? der(4, 'garbage') : '';
  return der(48, algorithm + der(4, digest) + outerExtra);
}

export function runForgeRsaControls(forge, vector) {
  const results = [];
  function check(name, callback) {
    callback();
    results.push({ name, passed: true });
  }
  const forgedKey = forge.pki.rsa.setPublicKey(
    new forge.jsbn.BigInteger(vector.modulusHex, 16),
    new forge.jsbn.BigInteger(vector.exponent)
  );
  const forgedDigest = forge.md.sha256.create().update(vector.message).digest().getBytes();
  check('public e=3 forgery rejected with default verification options', () => {
    assert.throws(() => forgedKey.verify(forgedDigest, forge.util.hexToBytes(vector.signatureHex)));
  });
  const native = fixtureKeys();
  const privateKey = forge.pki.privateKeyFromPem(native.privateKey);
  const publicKey = forge.pki.publicKeyFromPem(native.publicKey);
  const message = 'Splotch DigestInfo regression fixture';
  const digest = forge.md.sha256.create().update(message).digest().getBytes();
  const signature = (bytes) => forge.pki.rsa.encrypt(bytes, privateKey, 0x01);
  for (const mode of [
    'outer-extra',
    'nested-extra',
    'nonempty-1',
    'nonempty-8',
    'nonempty-32',
    'constructed',
  ]) {
    check(`signed malformed ${mode} rejected`, () =>
      assert.throws(() => publicKey.verify(digest, signature(digestInfo(forge, digest, mode))))
    );
  }
  for (const mode of ['absent', 'empty', 'long-null', 'indefinite-inner', 'nonminimal-oid']) {
    check(`fixed compatibility encoding ${mode} accepted`, () =>
      assert.equal(publicKey.verify(digest, signature(digestInfo(forge, digest, mode))), true)
    );
  }
  check('wrong digest rejected', () =>
    assert.equal(
      publicKey.verify('\0'.repeat(32), signature(digestInfo(forge, digest, 'empty'))),
      false
    )
  );
  check('indefinite outer DigestInfo accepted', () => {
    const encoded = digestInfo(forge, digest, 'empty');
    assert.equal(
      publicKey.verify(digest, signature('\x30\x80' + encoded.slice(2) + '\x00\x00')),
      true
    );
  });
  check('Node SHA256 signature accepted', () =>
    assert.equal(
      publicKey.verify(
        digest,
        sign('sha256', Buffer.from(message), native.privateKey).toString('binary')
      ),
      true
    )
  );
  check('RSA PSS accepted', () => {
    const scheme = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 20,
    });
    assert.equal(
      publicKey.verify(
        digest,
        privateKey.sign(forge.md.sha256.create().update(message), scheme),
        scheme
      ),
      true
    );
  });
  check('RSA NONE accepted and wrong digest rejected', () => {
    const encoded = privateKey.sign(digest, 'NONE');
    assert.equal(publicKey.verify(digest, encoded, 'NONE'), true);
    assert.equal(publicKey.verify('\0'.repeat(32), encoded, 'NONE'), false);
  });
  return results;
}

function helperFixture(helper) {
  const native = fixtureKeys();
  const keyPair = helper.convertKeyPairPEMToKeyPair({
    publicKeyPEM: native.publicKey,
    privateKeyPEM: native.privateKey,
  });
  const certificate = helper.generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: new Date(Date.now() - CERTIFICATE_VALIDITY_RADIUS_MS),
    validityNotAfter: new Date(Date.now() + CERTIFICATE_VALIDITY_RADIUS_MS),
    commonName: FIXTURE_IDENTITY,
  });
  const pem = helper.convertCertificateToCertificatePEM(certificate);
  const parsed = helper.convertCertificatePEMToCertificate(pem);
  helper.validateSelfSignedCertificate(parsed, keyPair);
  const message = Buffer.from('Splotch Expo consumer regression fixture');
  const signature = helper.signBufferRSASHA256AndVerify(keyPair.privateKey, parsed, message);
  assert.equal(verify('sha256', message, native.publicKey, Buffer.from(signature, 'base64')), true);
  assert.equal(
    verify(
      'sha256',
      Buffer.from('wrong message'),
      native.publicKey,
      Buffer.from(signature, 'base64')
    ),
    false
  );
  const csr = helper.convertCSRPEMToCSR(
    helper.convertCSRToCSRPEM(helper.generateCSR(keyPair, FIXTURE_IDENTITY))
  );
  assert.equal(csr.verify(), true);
  const development = helper.generateDevelopmentCertificateFromCSR(
    keyPair.privateKey,
    parsed,
    csr,
    'fixture-app',
    'fixture-scope'
  );
  assert.equal(parsed.verify(development), true);
  const tampered = helper.convertCertificatePEMToCertificate(pem);
  tampered.signature =
    String.fromCharCode(tampered.signature.charCodeAt(0) ^ 1) + tampered.signature.slice(1);
  assert.throws(() => helper.validateSelfSignedCertificate(tampered, keyPair));
  return { native, pem };
}

async function securityParserFixture(require, path, pem) {
  const previousModule = require.cache[path];
  const previousLoad = Module._load;
  let intercepted = false;
  delete require.cache[path];
  // The fixture substitutes only the host keychain subprocess; crypto resolutions remain real.
  Module._load = function (name, parent, isMain) {
    if (name === '@expo/spawn-async' && parent?.filename === path)
      return async (command, args) => {
        assert.equal(command, 'security');
        assert.deepEqual(args, ['find-certificate', '-c', FIXTURE_IDENTITY, '-p']);
        intercepted = true;
        return { stdout: pem };
      };
    return previousLoad.call(this, name, parent, isMain);
  };
  try {
    const result = await require(path).resolveCertificateSigningInfoAsync(FIXTURE_IDENTITY);
    assert.equal(result.codeSigningInfo, FIXTURE_IDENTITY);
    assert.equal(intercepted, true, 'Actual iOS parser did not use the bounded subprocess fixture');
  } finally {
    Module._load = previousLoad;
    if (previousModule) require.cache[path] = previousModule;
    else delete require.cache[path];
  }
}

export function assertForgeConsumerEntries(installedPackages) {
  const helpers = installedPackages.filter(
    ({ manifest }) => manifest.name === '@expo/code-signing-certificates'
  );
  assert.ok(helpers.length, 'Inspected Expo helper entries absent');
  const inspected = new Set();
  for (const helper of helpers) {
    const expected = realpathSync(join(helper.path, 'build/main.js'));
    const require = createRequire(join(helper.path, 'package.json'));
    assert.equal(
      realpathSync(require.resolve(helper.path)),
      expected,
      'Helper default main is outside reviewed source'
    );
    inspected.add(expected);
  }
  for (const cli of installedPackages.filter(({ manifest }) => manifest.name === '@expo/cli')) {
    const source = join(cli.path, 'build/src/utils/codesigning.js');
    const require = createRequire(source);
    assert.equal(
      realpathSync(require.resolve(source)),
      realpathSync(source),
      'CLI signing entry is outside reviewed source'
    );
    assert.ok(
      inspected.has(realpathSync(require.resolve('@expo/code-signing-certificates'))),
      'CLI helper resolution is outside inspected source'
    );
    const security = join(cli.path, 'build/src/run/ios/codeSigning/Security.js');
    assert.equal(
      realpathSync(require.resolve(security)),
      realpathSync(security),
      'CLI certificate parser entry is outside reviewed source'
    );
  }
}

export async function runForgeConsumerControls(installedPackages) {
  assertForgeConsumerEntries(installedPackages);
  const results = [];
  for (const installed of installedPackages.filter(
    ({ manifest }) => manifest.name === '@expo/code-signing-certificates'
  )) {
    const require = createRequire(join(installed.path, 'package.json'));
    helperFixture(require(installed.path));
    results.push({
      consumer: installed.path,
      control: 'actual certificate/signature/CSR and tamper rejection',
      resolvedEntry: realpathSync(require.resolve(installed.path)),
      passed: true,
    });
  }
  for (const installed of installedPackages.filter(
    ({ manifest }) => manifest.name === '@expo/cli'
  )) {
    const source = join(installed.path, 'build/src/utils/codesigning.js');
    const require = createRequire(source);
    const { native, pem } = helperFixture(require('@expo/code-signing-certificates'));
    const manifest = JSON.stringify({ fixture: true });
    const signature = require(source).signManifestString(manifest, {
      privateKey: native.privateKey,
      certificateForPrivateKey: pem,
    });
    assert.equal(
      verify('sha256', Buffer.from(manifest), native.publicKey, Buffer.from(signature, 'base64')),
      true
    );
    await securityParserFixture(
      require,
      join(installed.path, 'build/src/run/ios/codeSigning/Security.js'),
      pem
    );
    results.push({
      consumer: installed.path,
      control: 'actual CLI manifest signing and iOS parser with host subprocess fixture',
      resolvedEntry: realpathSync(require.resolve(source)),
      helperEntry: realpathSync(require.resolve('@expo/code-signing-certificates')),
      passed: true,
    });
  }
  assert.ok(results.length, 'Actual Expo consumer controls absent');
  return results;
}
