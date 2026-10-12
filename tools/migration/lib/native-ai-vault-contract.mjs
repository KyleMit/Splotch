function text(files, path) {
  const value = files.get(path);
  if (!Buffer.isBuffer(value)) throw new Error(`Missing maintained native source: ${path}`);
  return value.toString('utf8');
}

export function assertAiVaultContract(files, kotlinDirectory) {
  const android = text(files, `${kotlinDirectory}/SplotchAIEnvironment.kt`);
  const apple = text(files, 'ios/HelloWorld/SplotchAIEnvironment.swift');
  for (const [source, tokens] of [
    [
      android,
      [
        'SPLOTCH-AI-VAULT-2',
        'SecureRandom().nextBytes(it)',
        'cipher.doFinal(plain)',
        'file.finishWrite(output)',
        'confirmed.getString("reference") == reference',
        'confirmed.getString("value") == value',
        'protectedRecord(name)?.getString("reference") != reference',
        'current.getString("reference") == reference',
        'check(value == installationValue())',
        'writeReferencedCredential',
        'readReferencedCredential',
        'pinCredentialReference',
        'slot(name).delete()',
        'check(read(name) == null)',
        'synchronized(this)',
        'free-generation-identity',
      ],
    ],
    [
      apple,
      [
        'SPLOTCH-AI-VAULT-2',
        'SecRandomCopyBytes',
        'kSecAttrAccessibleWhenUnlockedThisDeviceOnly',
        'kSecAttrSynchronizable as String: false',
        'confirmed["reference"] == reference',
        'confirmed["value"] == value',
        'previous?["reference"] != reference',
        'current["reference"] == reference',
        'value == (try self.installationValue())',
        'writeReferencedCredential',
        'readReferencedCredential',
        'pinCredentialReference',
        'SecItemDelete',
        'try self.read(name) == nil',
        'DispatchQueue(label: "art.splotch.ai-credentials")',
        'free-generation-identity',
      ],
    ],
  ]) {
    for (const token of tokens)
      if (!source.includes(token)) throw new Error(`Native vault contract mismatch: ${token}`);
  }
  const registration = text(files, 'ios/HelloWorld/SplotchAIEnvironment.m');
  for (const method of [
    'writeReferencedCredential',
    'pinCredentialReference',
    'readReferencedCredential',
  ])
    if (!registration.includes(`RCT_EXTERN_METHOD(${method}:`))
      throw new Error(`Native vault contract registration missing: ${method}`);
}
