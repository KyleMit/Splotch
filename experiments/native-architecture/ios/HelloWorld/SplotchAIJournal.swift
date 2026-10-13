import Foundation
import CryptoKit
import Security
import Darwin

final class SplotchAIJournal {
  private let queue = DispatchQueue(label: "art.splotch.ai-journal")
  private let maxModel = 8 * 1024 * 1024
  private let currentOriginalVersions: Set<Int64> = [5, 7]
  private let importedOriginalVersions: Set<Int64> = [1, 2, 3, 4, 5, 7]
  private let maxDrawingContacts = 1000
  private let maxDrawingSamples = 100000
  private let drawingRainbowCount: Int64 = 10
  private let drawingPaperWidth = 1024.0
  private let drawingPaperHeight = 768.0
  private let maximumPaperCssPx = 8192.0
  private let minimumPaperCssPx = 16.0
  private let minimumBackingScale = 0.25
  private let maximumBackingScale = 2.0
  private let maxUpload = 15 * 1024 * 1024
  private let maxResult = 16 * 1024 * 1024
  private let maxJournal = 32 * 1024
  private var maxUploadReply: Int { ((maxUpload + 2) / 3) * 4 + maxJournal }
  private let maxQuota = 128 * 1024 * 1024
  private let maxAttempts = 32
  private let maxLegacy = 256
  private let safeInteger: Int64 = 9007199254740991
  private let minimumRecoveryExpiryDeltaMs: Int64 = 1170000
  private let maximumRecoveryExpiryDeltaMs: Int64 = 1260000
  private let recoveryPollAfterMs: Int64 = 4000
  private let maxRecoveryJson = 8192
  private let styles = ["Magical", "Crayon", "Watercolor", "Paper", "Felt", "Sticker", "Cartoon", "Clay"]
  private func failure() -> NSError { NSError(domain: "AI_DURABILITY_UNAVAILABLE", code: 1) }
  private func checked(_ condition: Bool) throws { if !condition { throw failure() } }
  private func matches(_ text: String, _ pattern: String) -> Bool { text.range(of: "^(?:" + pattern + ")$", options: .regularExpression) != nil }
  private func object(_ value: Any?) throws -> [String: Any] {
    guard let result = value as? [String: Any] else { throw failure() }
    return result
  }
  private func keys(_ value: [String: Any], _ expected: [String]) throws { try checked(Set(value.keys) == Set(expected)) }
  private func integer(_ value: [String: Any], _ key: String, _ minimum: Int64 = 1) throws -> Int64 {
    guard let number = value[key] as? NSNumber else { throw failure() }
    try checked(CFGetTypeID(number) != CFBooleanGetTypeID() && number.doubleValue.isFinite &&
      number.doubleValue == Double(number.int64Value) && number.int64Value >= minimum && number.int64Value <= safeInteger)
    return number.int64Value
  }
  private func string(_ value: [String: Any], _ key: String) throws -> String {
    guard let result = value[key] as? String else { throw failure() }
    return result
  }
  private func isNull(_ value: [String: Any], _ key: String) -> Bool { value[key] is NSNull }
  private func data(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
  private func hash(_ value: Data) -> String { SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined() }
  private func metadata(_ value: Data) -> [String: Any] { ["bytes": value.count, "sha256": hash(value)] }
  private func fileStat(_ path: String) throws -> stat {
    var result = stat()
    try checked(lstat(path, &result) == 0 && result.st_uid == geteuid())
    return result
  }
  private func regular(_ descriptor: Int32) throws -> stat {
    var result = stat()
    try checked(fstat(descriptor, &result) == 0 && (result.st_mode & S_IFMT) == S_IFREG &&
      result.st_nlink == 1 && result.st_uid == geteuid())
    return result
  }
  private func fence(_ dir: URL) throws {
    let descriptor = open(dir.path, O_RDONLY | O_NOFOLLOW | O_DIRECTORY | O_CLOEXEC)
    try checked(descriptor >= 0)
    do {
      var result = stat()
      try checked(fstat(descriptor, &result) == 0 && (result.st_mode & S_IFMT) == S_IFDIR && result.st_uid == geteuid())
      try checked(fsync(descriptor) == 0 && fcntl(descriptor, F_FULLFSYNC) == 0)
    } catch { _ = close(descriptor); throw error }
    try checked(close(descriptor) == 0)
  }
  private func directory(_ dir: URL, _ parent: URL) throws {
    if !FileManager.default.fileExists(atPath: dir.path) { try checked(mkdir(dir.path, 0o700) == 0) }
    let info = try fileStat(dir.path)
    try checked((info.st_mode & S_IFMT) == S_IFDIR && chmod(dir.path, 0o700) == 0)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: dir.path)
    var owner = dir
    var attributes = URLResourceValues()
    attributes.isExcludedFromBackup = true
    try owner.setResourceValues(attributes)
    try fence(parent)
    try fence(dir)
  }
  private func read(_ file: URL, _ cap: Int) throws -> Data {
    let descriptor = open(file.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
    try checked(descriptor >= 0)
    var output = Data()
    do {
      let info = try regular(descriptor)
      try checked(info.st_size > 0 && info.st_size <= cap)
      var buffer = [UInt8](repeating: 0, count: 8192)
      while true {
        let count = Darwin.read(descriptor, &buffer, buffer.count)
        try checked(count >= 0 && output.count + count <= cap)
        if count == 0 { break }
        output.append(contentsOf: buffer.prefix(count))
      }
    } catch { _ = close(descriptor); throw error }
    try checked(close(descriptor) == 0)
    return output
  }
  private func atomic(_ dir: URL, _ name: String, _ bytes: Data) throws {
    try checked(!bytes.isEmpty)
    let final = dir.appendingPathComponent(name)
    if FileManager.default.fileExists(atPath: final.path) {
      try checked(read(final, bytes.count) == bytes)
      let descriptor = open(final.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
      try checked(descriptor >= 0)
      do {
        _ = try regular(descriptor)
        try checked(fsync(descriptor) == 0 && fcntl(descriptor, F_FULLFSYNC) == 0)
        try fence(dir)
      } catch { _ = close(descriptor); throw error }
      try checked(close(descriptor) == 0)
      return
    }
    let pending = dir.appendingPathComponent(name + ".pending")
    let descriptor = open(pending.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
    try checked(descriptor >= 0)
    do {
      _ = try regular(descriptor)
      try bytes.withUnsafeBytes { raw in
        guard let base = raw.baseAddress else { throw failure() }
        var position = 0
        while position < raw.count {
          let count = Darwin.write(descriptor, base.advanced(by: position), raw.count - position)
          try checked(count > 0)
          position += count
        }
      }
      try checked(fsync(descriptor) == 0 && fcntl(descriptor, F_FULLFSYNC) == 0)
      try checked(read(pending, bytes.count) == bytes)
      try checked(renameatx_np(AT_FDCWD, pending.path, AT_FDCWD, final.path, UInt32(RENAME_EXCL)) == 0)
      try fence(dir)
      try checked(fcntl(descriptor, F_FULLFSYNC) == 0)
    } catch { _ = close(descriptor); throw error }
    try checked(close(descriptor) == 0)
  }
  private func journal(_ raw: Any?) throws -> [String: Any] {
    let value = try object(raw)
    try keys(value, ["version", "id", "createdAt", "style", "originalId", "phase", "jobId", "result"])
    try checked(integer(value, "version") == 1)
    _ = try integer(value, "id"); _ = try integer(value, "createdAt", 0)
    try checked(styles.contains(string(value, "style")) && matches(string(value, "originalId"), "picture-[0-9]+-[a-z0-9]+"))
    let phase = try string(value, "phase")
    try checked(["sent", "pending", "unknown", "result", "failed"].contains(phase))
    try checked(isNull(value, "jobId") || matches(string(value, "jobId"), "[a-f0-9]{64}"))
    try checked(phase != "pending" || !isNull(value, "jobId"))
    try checked((phase == "result") == !isNull(value, "result"))
    if !isNull(value, "result") {
      let result = try object(value["result"])
      try keys(result, ["uri", "mime"])
      try checked(["image/png", "image/jpeg", "image/webp"].contains(string(result, "mime")))
    }
    try checked(data(value).count <= maxJournal / 2)
    return value
  }
  private func children(_ dir: URL) throws -> [URL] { try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) }
  private func attempts(_ root: URL) throws -> [URL] {
    let entries = try children(root)
    try checked(entries.count <= maxAttempts + 1)
    return try entries.filter { $0.lastPathComponent != "owner.lock" }.map {
      let info = try fileStat($0.path)
      try checked(matches($0.lastPathComponent, "attempt-[0-9]+") && (info.st_mode & S_IFMT) == S_IFDIR)
      return $0
    }
  }
  private func verify(_ dir: URL, _ name: String, _ raw: Any?, _ cap: Int) throws {
    let meta = try object(raw)
    try keys(meta, ["bytes", "sha256"])
    let bytes = try read(dir.appendingPathComponent(name), cap)
    try checked(integer(meta, "bytes") == bytes.count && string(meta, "sha256") == hash(bytes))
  }
  private func revision(_ file: URL) throws -> Int64 {
    guard let number = Int64(file.lastPathComponent.dropFirst(8).dropLast(5)), number >= 1 else { throw failure() }
    return number
  }
  private func recovery(_ value: [String: Any]) throws -> [String: Any] {
    let r = try object(value["recovery"])
    try keys(r, ["version", "protocol", "id", "credential", "expiry", "intent"])
    try checked(integer(r, "version") == 2 && string(r, "protocol") == "splotch-ai-recovery-v1")
    let j = try journal(value["journal"])
    try checked(string(j, "phase") == "unknown" && isNull(j, "jobId") && isNull(j, "result"))
    try checked(!isNull(value, "upload") && isNull(value, "result"))
    let nonce = try string(value, "nonce")
    let created = try integer(j, "createdAt", 0)
    let envelope = Data("[\"splotch-ai-recovery-v1\",\"\(nonce)\",\(created)]".utf8)
    try checked(string(r, "id") == hash(envelope))
    let credential = try object(r["credential"])
    try keys(credential, ["kind", "reference"])
    try checked(["free", "managed", "byok"].contains(string(credential, "kind")) && matches(string(credential, "reference"), "[a-f0-9]{64}"))
    try checked(["prepared", "committed"].contains(string(r, "intent")))
    let expiry = try object(r["expiry"])
    if try string(expiry, "kind") == "unknown" { try keys(expiry, ["kind"]) }
    else {
      try keys(expiry, ["kind", "expiresAt", "provenance"])
      try checked(string(expiry, "provenance") == "admitted-status-202")
      try checked(string(expiry, "kind") == "known" && string(r, "intent") == "committed")
      try checked(created <= safeInteger - maximumRecoveryExpiryDeltaMs)
      let delta = try integer(expiry, "expiresAt") - created
      try checked(delta >= minimumRecoveryExpiryDeltaMs && delta <= maximumRecoveryExpiryDeltaMs)
    }
    return r
  }
  private func recoveryProgress(_ older: [String: Any], _ newer: [String: Any]) throws {
    try checked(integer(older, "schema") == integer(newer, "schema"))
    if try integer(older, "schema") == 3 { try requestProgress(older, newer); return }
    if try integer(older, "schema") != 2 { return }
    let a = try recovery(older); let b = try recovery(newer)
    for key in ["version", "protocol", "id"] { try checked(NSDictionary(dictionary: [key: a[key]!]).isEqual(to: [key: b[key]!])) }
    try checked(same(object(a["credential"]), object(b["credential"])))
    try checked(string(a, "intent") != "committed" || string(b, "intent") == "committed")
    let expiry = try object(a["expiry"])
    try checked(string(expiry, "kind") != "known" || same(expiry, object(b["expiry"])))
    for key in ["original", "upload"] { try checked(same(object(older[key]), object(newer[key]))) }
  }
  private func latest(_ dir: URL) throws -> [String: Any] {
    let files = try children(dir)
    try checked(files.count <= 12)
    for file in files {
      let info = try fileStat(file.path)
      try checked(matches(file.lastPathComponent, "(original|upload|result)\\.bin(\\.pending)?|journal-[0-9]+\\.json(\\.pending)?") &&
        (info.st_mode & S_IFMT) == S_IFREG && info.st_nlink == 1)
    }
    try checked(!files.contains { $0.lastPathComponent.hasSuffix(".json.pending") })
    let revisions = try files.filter { matches($0.lastPathComponent, "journal-[0-9]+\\.json") }
      .map { (try revision($0), $0) }.sorted { $0.0 > $1.0 }
    try checked(!revisions.isEmpty && revisions.count <= 3)
    var values = [[String: Any]]()
    for (number, file) in revisions {
      let value = try object(JSONSerialization.jsonObject(with: read(file, maxJournal)))
      let schema = try integer(value, "schema")
      try checked(schema == 1 || schema == 2 || schema == 3)
      try keys(value, schema == 1 ? ["schema", "nonce", "revision", "journal", "original", "upload", "result"] : ["schema", "nonce", "revision", "journal", "original", "upload", "result", "recovery"])
      try checked(integer(value, "revision") == number && matches(string(value, "nonce"), "[a-f0-9]{64}"))
      if schema == 2 { _ = try recovery(value) }
      if schema == 3 { _ = try recoveryRequest(value) }
      let j = try journal(value["journal"])
      try checked(dir.lastPathComponent == "attempt-\(try integer(j, "id"))")
      try verify(dir, "original.bin", value["original"], maxModel)
      if !isNull(value, "upload") { try verify(dir, "upload.bin", value["upload"], maxUpload) }
      if !isNull(value, "result") {
        try verify(dir, "result.bin", value["result"], maxResult)
        try checked(string(object(j["result"]), "uri") == dir.appendingPathComponent("result.bin").absoluteString)
      }
      try checked(isNull(value, "result") == isNull(j, "result"))
      values.append(value)
    }
    guard let first = values.first else { throw failure() }
    if try integer(first, "schema") == 3 {
      try checked(!files.contains { ["original.bin.pending", "upload.bin.pending"].contains($0.lastPathComponent) })
      _ = try sourceHeld(dir.deletingLastPathComponent(), first)
      let r = try object(first["recovery"]), state = try string(r, "state")
      let final = files.contains { $0.lastPathComponent == "result.bin" }
      let pending = files.contains { $0.lastPathComponent == "result.bin.pending" }
      try checked(!final || !pending)
      if pending { try checked(fileStat(dir.appendingPathComponent("result.bin.pending").path).st_size <= maxResult) }
      if state == "delivery-pinned" && final {
        let d = try delivery(r["delivery"])
        try verify(dir, "result.bin", ["bytes": try integer(d, "length"), "sha256": try string(d, "digest")], maxResult)
      }
      if !["delivery-pinned", "retained", "acknowledged"].contains(state) {
        try checked(!files.contains { $0.lastPathComponent == "result.bin" || $0.lastPathComponent == "result.bin.pending" })
      }
    }
    for (index, value) in values.enumerated() {
      try recoveryProgress(value, first)
      try checked(string(value, "nonce") == string(first, "nonce") && integer(value, "revision") == integer(first, "revision") - Int64(index))
      let current = try journal(value["journal"])
      let newest = try journal(first["journal"])
      for key in ["version", "id", "createdAt", "style", "originalId"] { try checked(NSDictionary(dictionary: [key: current[key]!]).isEqual(to: [key: newest[key]!])) }
    }
    return first
  }
  private func confirm(_ dir: URL, _ value: [String: Any]) throws -> [String: Any] {
    try atomic(dir, "original.bin", read(dir.appendingPathComponent("original.bin"), maxModel))
    if !isNull(value, "upload") { try atomic(dir, "upload.bin", read(dir.appendingPathComponent("upload.bin"), maxUpload)) }
    if !isNull(value, "result") { try atomic(dir, "result.bin", read(dir.appendingPathComponent("result.bin"), maxResult)) }
    let name = "journal-\(try integer(value, "revision")).json"
    try atomic(dir, name, read(dir.appendingPathComponent(name), maxJournal))
    try fence(dir)
    if try integer(value, "schema") == 3 {
      let (source, held) = try sourceHeld(dir.deletingLastPathComponent(), value)
      _ = try confirm(source, held)
      let r = try object(value["recovery"])
      if r["delivery"] != nil && FileManager.default.fileExists(atPath: dir.appendingPathComponent("result.bin").path) {
        let d = try delivery(r["delivery"])
        let bytes = try read(dir.appendingPathComponent("result.bin"), maxResult)
        try checked(hash(bytes) == string(d, "digest") && bytes.count == integer(d, "length"))
        _ = try SplotchAIImageDecoder.decode(bytes, string(d, "mime"))
        try atomic(dir, "result.bin", bytes)
      }
      let reopened = try latest(dir)
      try checked(same(reopened, value))
    }
    return value
  }
  private func unresolved(_ value: [String: Any]) throws -> Bool { try integer(value, "schema") == 2 || !["result", "failed"].contains(string(object(value["journal"]), "phase")) }
  private func receipt(_ value: [String: Any]) throws -> [String: Any] {
    let upload: [String: Any]? = isNull(value, "upload") ? nil : try object(value["upload"])
    let result: [String: Any]? = isNull(value, "result") ? nil : try object(value["result"])
    var resultReceipt: [String: Any] = ["kind": try integer(value, "schema") == 3 ? "recovery-request" : integer(value, "schema") == 2 ? "recovery-held" : upload == nil ? "imported" : "prepared", "originalRevision": 1,
      "journal": try journal(value["journal"]), "nonce": try string(value, "nonce"), "revision": try integer(value, "revision"),
      "originalDigest": try string(object(value["original"]), "sha256"),
      "inputDigest": try upload.map { try string($0, "sha256") as Any } ?? NSNull(),
      "inputLength": try upload.map { try integer($0, "bytes") as Any } ?? NSNull(),
      "resultDigest": try result.map { try string($0, "sha256") as Any } ?? NSNull(),
      "resultLength": try result.map { try integer($0, "bytes") as Any } ?? NSNull()]
    if try integer(value, "schema") == 2 { resultReceipt["recovery"] = try recovery(value) }
    if try integer(value, "schema") == 3 { resultReceipt["recovery"] = try recoveryRequest(value) }
    return resultReceipt
  }
  private func quota(_ root: URL, _ extra: Int, _ replacing: URL? = nil) throws {
    var size: Int64 = 0
    for dir in try attempts(root) {
      for file in try children(dir) {
        let info = try fileStat(file.path)
        try checked((info.st_mode & S_IFMT) == S_IFREG && info.st_nlink == 1 && info.st_size >= 0 && info.st_size <= maxQuota)
        size += info.st_size
      }
      if try dir != replacing && unresolved(latest(dir)) { size += Int64(maxResult + maxJournal * 2) }
    }
    guard let document = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { throw failure() }
    let legacy = document.appendingPathComponent("splotch-ai-pictures-v1")
    if FileManager.default.fileExists(atPath: legacy.path) {
      try checked((fileStat(legacy.path).st_mode & S_IFMT) == S_IFDIR)
      let files = try children(legacy)
      try checked(files.count <= maxLegacy)
      for file in files {
        let info = try fileStat(file.path)
        try checked((info.st_mode & S_IFMT) == S_IFREG && info.st_nlink == 1 && info.st_size >= 0 && info.st_size <= maxQuota)
        size += info.st_size
      }
    }
    try checked(size + Int64(extra) <= maxQuota)
  }
  private func publish(_ dir: URL, _ value: [String: Any]) throws -> [String: Any] {
    let bytes = try data(value)
    try checked(bytes.count <= maxJournal)
    try atomic(dir, "journal-\(integer(value, "revision")).json", bytes)
    let revisions = try children(dir).filter { matches($0.lastPathComponent, "journal-[0-9]+\\.json") }
      .map { (try revision($0), $0) }.sorted { $0.0 > $1.0 }
    for (_, old) in revisions.dropFirst(2) { try checked(unlink(old.path) == 0) }
    try fence(dir)
    return ["receipt": try receipt(confirm(dir, latest(dir)))]
  }
  private func decode(_ value: [String: Any], _ key: String, _ cap: Int) throws -> Data {
    let encoded = try string(value, key)
    try checked(encoded.utf8.count <= ((cap + 2) / 3) * 4 && matches(encoded, "[A-Za-z0-9+/]*={0,2}"))
    guard let bytes = Data(base64Encoded: encoded), !bytes.isEmpty, bytes.count <= cap,
      bytes.base64EncodedString() == encoded else { throw failure() }
    return bytes
  }
  private func same(_ a: [String: Any], _ b: [String: Any]) -> Bool { NSDictionary(dictionary: a).isEqual(to: b) }
  private func originalModel(_ bytes: Data, _ importing: Bool) throws {
    try checked(!bytes.isEmpty && bytes.count <= maxModel)
    let value = try object(JSONSerialization.jsonObject(with: bytes))
    let version = try integer(value, "version")
    try checked((importing ? importedOriginalVersions : currentOriginalVersions).contains(version))
    let expected: [String]
    switch version {
    case 1: expected = ["version", "strokes"]
    case 2: expected = value["pageId"] == nil ? ["version", "rainbow", "strokes"] : ["version", "pageId", "strokes"]
    case 3, 4, 5: expected = ["version", "pageId", "rainbow", "strokes"]
    case 7: expected = ["version", "paper", "pageId", "rainbow", "strokes"]
    default: throw failure()
    }
    try keys(value, expected)
    if value["pageId"] != nil { try checked(!string(value, "pageId").isEmpty) }
    if value["rainbow"] != nil { try checked(integer(value, "rainbow", 0) < drawingRainbowCount) }
    guard let strokes = value["strokes"] as? [Any], strokes.count <= maxDrawingContacts else { throw failure() }
    var points = 0
    for entry in strokes {
      let stroke = try object(entry)
      guard let samples = stroke["points"] as? [Any] else { throw failure() }
      points += samples.count
      try checked(!samples.isEmpty && points <= maxDrawingSamples)
      for item in samples { _ = try object(item) }
    }
    let count = strokes.count
    if version >= 7 {
      let paper = try object(value["paper"])
      if try string(paper, "kind") == "unadopted" { try keys(paper, ["kind"]); try checked(count == 0) }
      else {
        try keys(paper, ["kind", "cssWidth", "cssHeight", "backingScale"])
        try checked(string(paper, "kind") == "adopted")
        for (name, minimum, maximum) in [("cssWidth", minimumPaperCssPx, maximumPaperCssPx), ("cssHeight", minimumPaperCssPx, maximumPaperCssPx), ("backingScale", minimumBackingScale, maximumBackingScale)] {
          guard let raw = paper[name] as? NSNumber else { throw failure() }
          try checked(CFGetTypeID(raw) != CFBooleanGetTypeID() && raw.doubleValue.isFinite && raw.doubleValue >= minimum && raw.doubleValue <= maximum)
        }
        guard let width = paper["cssWidth"] as? NSNumber, let height = paper["cssHeight"] as? NSNumber, let backing = paper["backingScale"] as? NSNumber else { throw failure() }
        let portrait = height.doubleValue > width.doubleValue
        let scale = max(width.doubleValue / (portrait ? drawingPaperHeight : drawingPaperWidth), height.doubleValue / (portrait ? drawingPaperWidth : drawingPaperHeight))
        let unitsPerCss = 1.0 / scale, unitsPerTexel = unitsPerCss / backing.doubleValue
        let maximumUnitsPerCss = drawingPaperWidth / minimumPaperCssPx
        try checked(unitsPerTexel.isFinite && unitsPerCss <= maximumUnitsPerCss && unitsPerTexel <= maximumUnitsPerCss / minimumBackingScale)
      }
    }
  }
  private func recoveryRequest(_ value: [String: Any]) throws -> [String: Any] {
    let r = try object(value["recovery"]), j = try journal(value["journal"])
    let state = try string(r, "state")
    let deliveryStates = ["delivery-pinned", "retained", "acknowledged"]
    try checked(["prepared", "submission-uncertain", "admitted", "terminal"].contains(state) || deliveryStates.contains(state))
    try keys(r, ["version", "protocol", "id", "credential", "sourceHeld", "state", "expiry"] + (deliveryStates.contains(state) ? ["delivery"] : state == "terminal" ? ["outcome"] : []))
    try checked(integer(r, "version") == 3 && string(r, "protocol") == "splotch-ai-recovery-v1")
    let nonce = try string(value, "nonce"), created = try integer(j, "createdAt", 0)
    try checked(string(r, "id") == hash(Data("[\"splotch-ai-recovery-v1\",\"\(nonce)\",\(created)]".utf8)))
    let credential = try object(r["credential"])
    try keys(credential, ["kind", "reference"])
    try checked(["free", "managed", "byok"].contains(string(credential, "kind")) && matches(string(credential, "reference"), "[a-f0-9]{64}"))
    let source = try object(r["sourceHeld"])
    try keys(source, ["id", "nonce", "revision"])
    try checked(integer(source, "id") < integer(j, "id") && matches(string(source, "nonce"), "[a-f0-9]{64}"))
    _ = try integer(source, "revision")
    try checked(!isNull(value, "upload") && isNull(j, "jobId"))
    let expiry = try object(r["expiry"])
    if ["prepared", "submission-uncertain"].contains(state) {
      try keys(expiry, ["kind"]); try checked(string(expiry, "kind") == "unknown")
    } else {
      try keys(expiry, ["kind", "expiresAt", "provenance"])
      try checked(string(expiry, "kind") == "known" && string(expiry, "provenance") == "validated-recovery-response")
      try checked(created <= safeInteger - maximumRecoveryExpiryDeltaMs)
      let delta = try integer(expiry, "expiresAt") - created
      try checked(delta >= minimumRecoveryExpiryDeltaMs && delta <= maximumRecoveryExpiryDeltaMs)
    }
    if deliveryStates.contains(state) {
      let d = try delivery(r["delivery"])
      try checked(integer(d, "expiresAt") == integer(expiry, "expiresAt"))
      if state == "retained" || state == "acknowledged" {
        try checked(string(j, "phase") == "result" && !isNull(value, "result"))
        let result = try object(value["result"])
        try checked(string(result, "sha256") == string(d, "digest") && integer(result, "bytes") == integer(d, "length"))
        try checked(string(object(j["result"]), "mime") == string(d, "mime"))
      }
    }
    if !["retained", "acknowledged"].contains(state) {
      try checked(isNull(value, "result") && isNull(j, "result") && string(j, "phase") == (state == "terminal" ? "failed" : "unknown"))
    }
    if state == "terminal" { try checked(["refusal", "error", "expired"].contains(string(r, "outcome"))) }
    return r
  }
  private func delivery(_ raw: Any?) throws -> [String: Any] {
    let d = try object(raw)
    try keys(d, ["expiresAt", "digest", "receipt", "mime", "length"])
    _ = try integer(d, "expiresAt")
    try checked(matches(string(d, "digest"), "[a-f0-9]{64}") && matches(string(d, "receipt"), "[a-f0-9]{64}"))
    try checked(["image/png", "image/jpeg", "image/webp"].contains(string(d, "mime")) && integer(d, "length") <= maxResult)
    return d
  }
  private func requestProgress(_ older: [String: Any], _ newer: [String: Any]) throws {
    let a = try recoveryRequest(older), b = try recoveryRequest(newer)
    for key in ["version", "protocol", "id"] { try checked(NSDictionary(dictionary: [key: a[key]!]).isEqual(to: [key: b[key]!])) }
    for key in ["credential", "sourceHeld"] { try checked(same(object(a[key]), object(b[key]))) }
    for key in ["original", "upload"] { try checked(same(object(older[key]), object(newer[key]))) }
    let expiry = try object(a["expiry"])
    try checked(string(expiry, "kind") != "known" || same(expiry, object(b["expiry"])))
    if a["delivery"] != nil { try checked(same(object(a["delivery"]), object(b["delivery"]))) }
    if !isNull(older, "result") { try checked(same(object(older["result"]), object(newer["result"]))) }
    let state = try string(a, "state"), next = try string(b, "state")
    let allowed = ["prepared": ["prepared", "submission-uncertain", "admitted", "delivery-pinned", "retained", "acknowledged", "terminal"],
      "submission-uncertain": ["submission-uncertain", "admitted", "delivery-pinned", "retained", "acknowledged", "terminal"],
      "admitted": ["admitted", "delivery-pinned", "retained", "acknowledged", "terminal"],
      "delivery-pinned": ["delivery-pinned", "retained", "acknowledged"], "retained": ["retained", "acknowledged"],
      "acknowledged": ["acknowledged"], "terminal": ["terminal"]]
    try checked(allowed[state]?.contains(next) == true)
    if state == "terminal" { try checked(string(a, "outcome") == string(b, "outcome")) }
  }
  private func sourceHeld(_ root: URL, _ value: [String: Any]) throws -> (URL, [String: Any]) {
    let r = try recoveryRequest(value), source = try object(r["sourceHeld"])
    let dir = root.appendingPathComponent("attempt-\(try integer(source, "id"))")
    try checked(attempts(root).contains(dir))
    let held = try latest(dir)
    try checked(integer(held, "schema") == 2 && string(held, "nonce") == string(source, "nonce") && integer(held, "revision") == integer(source, "revision"))
    let j = try journal(value["journal"]), old = try journal(held["journal"])
    try checked(integer(j, "createdAt", 0) > integer(old, "createdAt", 0))
    for key in ["style", "originalId"] { try checked(string(j, key) == string(old, key)) }
    for key in ["original", "upload"] { try checked(same(object(value[key]), object(held[key]))) }
    return (dir, held)
  }
  private func selectedRequest(_ root: URL, _ input: [String: Any]) throws -> (URL, [String: Any]) {
    let id = try integer(input, "id")
    let all = try confirmedAttempts(root)
    guard let value = try all.first(where: { try integer(object($0["journal"]), "id") == id }) else { throw failure() }
    let dir = root.appendingPathComponent("attempt-\(id)")
    try checked(integer(value, "schema") == 3 && string(input, "nonce") == string(value, "nonce") && integer(input, "revision") == integer(value, "revision"))
    return (dir, value)
  }
  private func publishRequest(_ root: URL, _ dir: URL, _ before: [String: Any], _ next: [String: Any]) throws -> [String: Any] {
    _ = try recoveryRequest(next); try requestProgress(before, next)
    if same(before, next) { return ["receipt": try receipt(confirm(dir, next))] }
    try checked(integer(before, "revision") < safeInteger)
    let terminal = ["terminal", "retained", "acknowledged"].contains(try string(object(next["recovery"]), "state"))
    try quota(root, maxJournal, terminal ? dir : nil)
    var value = next; value["revision"] = try integer(before, "revision") + 1
    return try publish(dir, value)
  }
  private func prepareRecoverySend(_ root: URL, _ input: [String: Any]) throws -> [String: Any] {
    try keys(input, ["source", "id", "createdAt", "credential"])
    let selector = try object(input["source"])
    try keys(selector, ["id", "nonce", "revision"])
    let all = try attempts(root), confirmed = try confirmedAttempts(root)
    let id = try integer(input, "id"), created = try integer(input, "createdAt", 0)
    try checked(all.count < maxAttempts)
    for value in confirmed {
      let schema = try integer(value, "schema")
      try checked(integer(object(value["journal"]), "id") < id && integer(object(value["journal"]), "createdAt", 0) < created)
      try checked(schema == 2 || !unresolved(value))
    }
    let source = root.appendingPathComponent("attempt-\(try integer(selector, "id"))")
    try checked(all.contains(source))
    let held = try confirm(source, latest(source))
    try checked(integer(held, "schema") == 2 && string(selector, "nonce") == string(held, "nonce") && integer(selector, "revision") == integer(held, "revision"))
    var j = try journal(held["journal"])
    try checked(created > integer(j, "createdAt", 0))
    j["id"] = id; j["createdAt"] = created
    let original = try read(source.appendingPathComponent("original.bin"), maxModel)
    let upload = try read(source.appendingPathComponent("upload.bin"), maxUpload)
    try originalModel(original, false)
    _ = try SplotchAIImageDecoder.decode(upload, "image/png")
    try quota(root, original.count + upload.count + maxResult + maxJournal * 2)
    var entropy = [UInt8](repeating: 0, count: 32)
    try checked(SecRandomCopyBytes(kSecRandomDefault, entropy.count, &entropy) == errSecSuccess)
    let nonce = entropy.map { String(format: "%02x", $0) }.joined()
    for value in confirmed { try checked(string(value, "nonce") != nonce) }
    let r: [String: Any] = ["version": 3, "protocol": "splotch-ai-recovery-v1", "id": hash(Data("[\"splotch-ai-recovery-v1\",\"\(nonce)\",\(created)]".utf8)),
      "credential": try object(input["credential"]), "sourceHeld": selector, "state": "prepared", "expiry": ["kind": "unknown"]]
    let value: [String: Any] = ["schema": 3, "nonce": nonce, "revision": 1, "journal": j, "original": metadata(original), "upload": metadata(upload), "result": NSNull(), "recovery": r]
    _ = try recoveryRequest(value)
    let dir = root.appendingPathComponent("attempt-\(id)")
    try checked(!FileManager.default.fileExists(atPath: dir.path)); try directory(dir, root)
    try atomic(dir, "original.bin", original); try atomic(dir, "upload.bin", upload)
    return try publish(dir, value)
  }
  private func recoveryAdmission(_ root: URL, _ dir: URL, _ value: [String: Any], _ status: [String: Any]) throws -> [String: Any] {
    try keys(status, ["kind", "protocol", "id", "expiresAt", "phase", "pollAfterMs", "headerExpiresAt"])
    var r = try recoveryRequest(value), next = value
    try checked(string(r, "state") != "prepared" && string(status, "kind") == "status" && string(status, "protocol") == string(r, "protocol") && string(status, "id") == string(r, "id"))
    let phase = try string(status, "phase"), expiry = try integer(status, "expiresAt")
    try checked(["preparing", "funded", "pending", "working", "image", "delivery", "refusal", "error", "acknowledged"].contains(phase) && integer(status, "pollAfterMs") == recoveryPollAfterMs && string(status, "headerExpiresAt") == String(expiry))
    let known: [String: Any] = ["kind": "known", "expiresAt": expiry, "provenance": "validated-recovery-response"]
    try checked(string(object(r["expiry"]), "kind") == "unknown" || same(object(r["expiry"]), known))
    r["expiry"] = known
    let state = try string(r, "state")
    if ["submission-uncertain", "admitted"].contains(state) { r["state"] = "admitted" }
    next["recovery"] = r
    return try publishRequest(root, dir, value, next)
  }
  private func recoveryTerminal(_ root: URL, _ input: [String: Any]) throws -> [String: Any] {
    try keys(input, ["id", "nonce", "revision", "confirmation"])
    let (dir, value) = try selectedRequest(root, input)
    var r = try recoveryRequest(value)
    let state = try string(r, "state")
    try checked(["submission-uncertain", "admitted", "terminal"].contains(state))
    let confirmation = try object(input["confirmation"])
    try keys(confirmation, ["status", "body"])
    let body = try object(confirmation["body"])
    try keys(body, ["ok", "error", "code", "protocol", "id", "createdAt", "expiresAt", "outcome"])
    guard let ok = body["ok"] as? NSNumber else { throw failure() }
    try checked(CFGetTypeID(ok) == CFBooleanGetTypeID() && !ok.boolValue)
    let message = try string(body, "error")
    try checked(!message.isEmpty && message.utf8.count <= maxRecoveryJson)
    try checked(string(body, "code") == "RECOVERY_TERMINAL" && string(body, "protocol") == string(r, "protocol") && string(body, "id") == string(r, "id"))
    try checked(integer(body, "createdAt", 0) == integer(object(value["journal"]), "createdAt", 0))
    let outcome = try string(body, "outcome")
    let statuses: [String: Int64] = ["expired": 410, "refusal": 422, "error": 502]
    guard let status = statuses[outcome] else { throw failure() }
    try checked(integer(confirmation, "status") == status)
    let known: [String: Any] = ["kind": "known", "expiresAt": try integer(body, "expiresAt"), "provenance": "validated-recovery-response"]
    try checked(string(object(r["expiry"]), "kind") == "unknown" || same(object(r["expiry"]), known))
    if state == "terminal" { try checked(string(r, "outcome") == outcome) }
    try checked(same(confirm(dir, latest(dir)), value))
    r["expiry"] = known; r["state"] = "terminal"; r["outcome"] = outcome
    var next = value, j = try journal(value["journal"])
    j["phase"] = "failed"; next["journal"] = j; next["recovery"] = r
    return try publishRequest(root, dir, value, next)
  }
  private func recoveryResultFile(_ dir: URL, _ bytes: Data) throws {
    let final = dir.appendingPathComponent("result.bin"), pending = dir.appendingPathComponent("result.bin.pending")
    if FileManager.default.fileExists(atPath: final.path) {
      try checked(!FileManager.default.fileExists(atPath: pending.path))
      try atomic(dir, "result.bin", bytes); return
    }
    if FileManager.default.fileExists(atPath: pending.path) {
      let info = try fileStat(pending.path)
      try checked((info.st_mode & S_IFMT) == S_IFREG && info.st_nlink == 1 && info.st_size >= 0 && info.st_size <= maxResult)
      let pendingBytes = info.st_size > 0 ? try read(pending, maxResult) : Data()
      if pendingBytes == bytes {
        let fd = open(pending.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        try checked(fd >= 0)
        do {
          _ = try regular(fd)
          try checked(fsync(fd) == 0 && fcntl(fd, F_FULLFSYNC) == 0)
          try checked(renameatx_np(AT_FDCWD, pending.path, AT_FDCWD, final.path, UInt32(RENAME_EXCL)) == 0)
          try fence(dir)
          try checked(fcntl(fd, F_FULLFSYNC) == 0)
        } catch { _ = close(fd); throw error }
        try checked(close(fd) == 0)
        return
      }
      try checked(unlink(pending.path) == 0); try fence(dir)
    }
    try atomic(dir, "result.bin", bytes)
  }
  private func retainRecovery(_ root: URL, _ input: [String: Any]) throws -> [String: Any] {
    try keys(input, ["id", "nonce", "revision", "delivery", "bytes"])
    let (dir, initial) = try selectedRequest(root, input)
    var value = initial, r = try recoveryRequest(value)
    let d = try delivery(input["delivery"]), bytes = try decode(input, "bytes", maxResult)
    try checked(!["prepared", "terminal"].contains(string(r, "state")))
    try checked(integer(d, "length") == bytes.count && string(d, "digest") == hash(bytes))
    _ = try SplotchAIImageDecoder.decode(bytes, string(d, "mime"))
    try checked(same(confirm(dir, latest(dir)), value))
    let known: [String: Any] = ["kind": "known", "expiresAt": try integer(d, "expiresAt"), "provenance": "validated-recovery-response"]
    try checked(string(object(r["expiry"]), "kind") == "unknown" || same(object(r["expiry"]), known))
    if r["delivery"] != nil { try checked(same(object(r["delivery"]), d)) }
    else {
      r["expiry"] = known; r["delivery"] = d; r["state"] = "delivery-pinned"
      var pinned = value; pinned["recovery"] = r
      _ = try publishRequest(root, dir, value, pinned)
      value = try confirm(dir, latest(dir)); r = try recoveryRequest(value)
    }
    if try ["retained", "acknowledged"].contains(string(r, "state")) {
      try checked(read(dir.appendingPathComponent("result.bin"), maxResult) == bytes)
      return ["receipt": try receipt(confirm(dir, value))]
    }
    var storedBytes: Int64 = 0
    for name in ["result.bin", "result.bin.pending"] {
      let file = dir.appendingPathComponent(name)
      if FileManager.default.fileExists(atPath: file.path) {
        let info = try fileStat(file.path)
        try checked((info.st_mode & S_IFMT) == S_IFREG && info.st_nlink == 1 && info.st_size >= 0 && info.st_size <= maxResult)
        storedBytes += info.st_size
      }
    }
    try quota(root, max(0, bytes.count - Int(storedBytes)) + maxJournal, dir)
    try recoveryResultFile(dir, bytes)
    try checked(read(dir.appendingPathComponent("result.bin"), maxResult) == bytes)
    var next = value, j = try journal(value["journal"])
    r["state"] = "retained"; j["phase"] = "result"; j["result"] = ["uri": dir.appendingPathComponent("result.bin").absoluteString, "mime": try string(d, "mime")]
    next["recovery"] = r; next["journal"] = j; next["result"] = metadata(bytes)
    return try publishRequest(root, dir, value, next)
  }
  private func acknowledgeRecovery(_ root: URL, _ input: [String: Any]) throws -> [String: Any] {
    try keys(input, ["id", "nonce", "revision", "confirmation"])
    let (dir, value) = try selectedRequest(root, input)
    var r = try recoveryRequest(value)
    try checked(["retained", "acknowledged"].contains(string(r, "state")))
    let d = try delivery(r["delivery"]), confirmation = try object(input["confirmation"])
    try keys(confirmation, ["status", "body"]); try checked(integer(confirmation, "status") == 200)
    let body = try object(confirmation["body"])
    try keys(body, ["ok", "protocol", "id", "phase", "expiresAt", "deliveryDigest", "deliveryReceipt"])
    guard let ok = body["ok"] as? NSNumber else { throw failure() }
    try checked(CFGetTypeID(ok) == CFBooleanGetTypeID() && ok.boolValue)
    try checked(string(body, "protocol") == string(r, "protocol") && string(body, "id") == string(r, "id") && string(body, "phase") == "acknowledged" && integer(body, "expiresAt") == integer(d, "expiresAt") && string(body, "deliveryDigest") == string(d, "digest") && string(body, "deliveryReceipt") == string(d, "receipt"))
    let bytes = try read(dir.appendingPathComponent("result.bin"), maxResult)
    try checked(hash(bytes) == string(d, "digest") && bytes.count == integer(d, "length"))
    _ = try SplotchAIImageDecoder.decode(bytes, string(d, "mime"))
    try checked(same(confirm(dir, latest(dir)), value))
    r["state"] = "acknowledged"; var next = value; next["recovery"] = r
    return try publishRequest(root, dir, value, next)
  }
  private func confirmedAttempts(_ root: URL) throws -> [[String: Any]] {
    let values = try attempts(root).map { try confirm($0, latest($0)) }
    if try values.contains(where: { try integer($0, "schema") == 3 }) {
      let active = try values.filter { try integer($0, "schema") != 2 && unresolved($0) }
      try checked(active.count <= 1)
    }
    return values
  }
  private func dispatch(_ root: URL, _ kind: String, _ input: [String: Any]) throws -> [String: Any] {
    switch kind {
    case "prepareRecoverySendFromHeld": return try prepareRecoverySend(root, input)
    case "retainRecoveryResult": return try retainRecovery(root, input)
    case "recordAck": return try acknowledgeRecovery(root, input)
    case "recordRecoveryTerminal": return try recoveryTerminal(root, input)
    case "readRecoveryAttempt":
      try keys(input, ["id"])
      let id = try integer(input, "id")
      let all = try confirmedAttempts(root)
      guard let value = try all.first(where: { try integer(object($0["journal"]), "id") == id }) else { return ["receipt": NSNull()] }
      try checked([2, 3].contains(integer(value, "schema")))
      return ["receipt": try receipt(value)]
    case "markRecoverySubmission", "readRecoveryUpload", "recordRecoveryAdmission":
      try keys(input, kind == "recordRecoveryAdmission" ? ["id", "nonce", "revision", "status"] : ["id", "nonce", "revision"])
      let (dir, value) = try selectedRequest(root, input)
      var r = try recoveryRequest(value)
      if kind == "readRecoveryUpload" {
        try checked(string(r, "state") == "submission-uncertain")
        let bytes = try read(dir.appendingPathComponent("upload.bin"), maxUpload)
        let meta = try object(value["upload"])
        try checked(integer(meta, "bytes") == bytes.count && string(meta, "sha256") == hash(bytes))
        _ = try SplotchAIImageDecoder.decode(bytes, "image/png")
        try checked(same(confirm(dir, latest(dir)), value))
        return ["receipt": try receipt(value), "upload": bytes.base64EncodedString()]
      }
      if kind == "recordRecoveryAdmission" { return try recoveryAdmission(root, dir, value, object(input["status"])) }
      try checked(["prepared", "submission-uncertain"].contains(string(r, "state")))
      r["state"] = "submission-uncertain"; var next = value; next["recovery"] = r
      return try publishRequest(root, dir, value, next)
    case "read":
      try keys(input, [])
      let all = try confirmedAttempts(root).sorted {
        try integer(object($0["journal"]), "id") > integer(object($1["journal"]), "id")
      }
      return ["receipt": try all.first.map { try receipt($0) as Any } ?? NSNull()]
    case "pictures":
      try keys(input, [])
      let all = try confirmedAttempts(root)
      return ["pictures": try all.filter { !isNull($0, "result") }.map { try object(object($0["journal"])["result"]) }]
    case "readPreparedUpload":
      try keys(input, ["id", "nonce", "revision"])
      let dir = root.appendingPathComponent("attempt-\(try integer(input, "id"))")
      try checked(attempts(root).contains(dir))
      let pinned = try confirm(dir, latest(dir))
      try checked(string(input, "nonce") == string(pinned, "nonce") && integer(input, "revision") == integer(pinned, "revision"))
      try checked(integer(pinned, "schema") == 1 && !isNull(pinned, "upload"))
      let bytes = try read(dir.appendingPathComponent("upload.bin"), maxUpload)
      let meta = try object(pinned["upload"])
      try checked(integer(meta, "bytes") == bytes.count && string(meta, "sha256") == hash(bytes))
      return ["receipt": try receipt(pinned), "upload": bytes.base64EncodedString()]
    case "prepare", "importLegacy", "prepareRecovery":
      try keys(input, kind == "prepareRecovery" ? ["journal", "originalModel", "upload", "credential"] : kind == "prepare" ? ["journal", "originalModel", "upload"] : ["journal", "originalModel"])
      let j = try journal(input["journal"])
      try checked(isNull(j, "result") && (kind != "prepare" || (string(j, "phase") == "sent" && isNull(j, "jobId"))))
      if kind == "prepareRecovery" {
        try checked(string(j, "phase") == "unknown" && isNull(j, "jobId"))
        let credential = try object(input["credential"])
        try keys(credential, ["kind", "reference"])
        try checked(["free", "managed", "byok"].contains(string(credential, "kind")) && matches(string(credential, "reference"), "[a-f0-9]{64}"))
      }
      let all = try attempts(root)
      try checked(all.count < maxAttempts)
      for dir in all { try checked(!unresolved(latest(dir))) }
      let original = Data(try string(input, "originalModel").utf8)
      try originalModel(original, kind == "importLegacy")
      let upload = kind != "importLegacy" ? try decode(input, "upload", maxUpload) : nil
      try quota(root, original.count + (upload?.count ?? 0) + maxResult + maxJournal * 2)
      let dir = root.appendingPathComponent("attempt-\(try integer(j, "id"))")
      try checked(!FileManager.default.fileExists(atPath: dir.path)); try directory(dir, root)
      try atomic(dir, "original.bin", original)
      if let upload { try atomic(dir, "upload.bin", upload) }
      var entropy = [UInt8](repeating: 0, count: 32)
      try checked(SecRandomCopyBytes(kSecRandomDefault, entropy.count, &entropy) == errSecSuccess)
      let nonce = entropy.map { String(format: "%02x", $0) }.joined()
      var value: [String: Any] = ["schema": kind == "prepareRecovery" ? 2 : 1, "nonce": nonce, "revision": 1, "journal": j,
        "original": metadata(original), "upload": upload.map { metadata($0) as Any } ?? NSNull(), "result": NSNull()]
      if kind == "prepareRecovery" {
        let created = try integer(j, "createdAt", 0)
        let envelope = Data("[\"splotch-ai-recovery-v1\",\"\(nonce)\",\(created)]".utf8)
        value["recovery"] = ["version": 2, "protocol": "splotch-ai-recovery-v1", "id": hash(envelope),
          "credential": try object(input["credential"]), "expiry": ["kind": "unknown"], "intent": "prepared"]
        _ = try recovery(value)
      }
      return try publish(dir, value)
    case "commitRecoveryIntent", "recordRecoveryStatus":
      try keys(input, kind == "commitRecoveryIntent" ? ["id", "nonce", "revision"] : ["id", "nonce", "revision", "status"])
      let dir = root.appendingPathComponent("attempt-\(try integer(input, "id"))")
      try checked(attempts(root).contains(dir))
      var value = try latest(dir)
      try checked(integer(value, "schema") == 2 && string(input, "nonce") == string(value, "nonce") && integer(input, "revision") == integer(value, "revision"))
      let before = value
      var r = try recovery(value)
      if kind == "commitRecoveryIntent" { r["intent"] = "committed" }
      else {
        try checked(string(r, "intent") == "committed")
        let status = try object(input["status"])
        try keys(status, ["kind", "protocol", "id", "expiresAt", "phase", "pollAfterMs", "headerExpiresAt"])
        try checked(string(status, "kind") == "status" && string(status, "protocol") == string(r, "protocol") && string(status, "id") == string(r, "id"))
        try checked(["preparing", "funded", "pending", "working", "image", "delivery", "refusal", "error", "acknowledged"].contains(string(status, "phase")))
        try checked(integer(status, "pollAfterMs") == recoveryPollAfterMs)
        let expiry = try integer(status, "expiresAt")
        try checked(string(status, "headerExpiresAt") == String(expiry))
        let known: [String: Any] = ["kind": "known", "expiresAt": expiry, "provenance": "admitted-status-202"]
        let previous = try object(r["expiry"])
        try checked(string(previous, "kind") == "unknown" || same(previous, known))
        r["expiry"] = known
      }
      value["recovery"] = r
      _ = try recovery(value); try recoveryProgress(before, value)
      if same(before, value) { return ["receipt": try receipt(confirm(dir, value))] }
      for candidate in try attempts(root) {
        let existing = try latest(candidate)
        if try integer(existing, "schema") == 3 {
          try checked(integer(object(object(existing["recovery"])["sourceHeld"]), "id") != integer(input, "id"))
        }
      }
      try checked(integer(value, "revision") < safeInteger)
      try quota(root, maxJournal)
      value["revision"] = try integer(value, "revision") + 1
      return try publish(dir, value)
    case "write", "retain":
      try keys(input, kind == "write" ? ["id", "nonce", "revision", "journal"] : ["id", "nonce", "revision", "bytes", "mime"])
      let dir = root.appendingPathComponent("attempt-\(try integer(input, "id"))")
      try checked(attempts(root).contains(dir))
      var value = try latest(dir)
      try checked(integer(value, "schema") == 1)
      try checked(string(input, "nonce") == string(value, "nonce"))
      var previous = try journal(value["journal"])
      if kind == "write" {
        try checked(integer(input, "revision") == integer(value, "revision"))
        let next = try journal(input["journal"])
        for key in ["version", "id", "createdAt", "style", "originalId"] { try checked(NSDictionary(dictionary: [key: next[key]!]).isEqual(to: [key: previous[key]!])) }
        try checked(isNull(previous, "jobId") || string(previous, "jobId") == string(next, "jobId"))
        let transitions = ["sent": ["sent", "pending", "unknown", "failed"], "pending": ["pending", "unknown", "failed"],
          "unknown": ["unknown", "pending", "failed"], "failed": ["failed", "pending"], "result": ["result"]]
        try checked(transitions[string(previous, "phase")]?.contains(string(next, "phase")) == true)
        try checked(isNull(previous, "result") == isNull(next, "result"))
        if !isNull(previous, "result") { try checked(same(object(previous["result"]), object(next["result"]))) }
        if same(previous, next) { return ["receipt": try receipt(confirm(dir, value))] }
        try quota(root, maxJournal)
        value["journal"] = next; value["revision"] = try integer(value, "revision") + 1
        return try publish(dir, value)
      }
      let bytes = try decode(input, "bytes", maxResult)
      let mime = try string(input, "mime")
      try checked(["image/png", "image/jpeg", "image/webp"].contains(mime))
      if !isNull(value, "result") {
        try checked(string(object(value["result"]), "sha256") == hash(bytes) && string(object(previous["result"]), "mime") == mime)
        try atomic(dir, "result.bin", bytes)
        return ["receipt": try receipt(confirm(dir, value))]
      }
      try checked(integer(input, "revision") == integer(value, "revision"))
      try quota(root, bytes.count + maxJournal, dir)
      try atomic(dir, "result.bin", bytes)
      previous["phase"] = "result"; previous["result"] = ["uri": dir.appendingPathComponent("result.bin").absoluteString, "mime": mime]
      value["journal"] = previous; value["result"] = metadata(bytes); value["revision"] = try integer(value, "revision") + 1
      return try publish(dir, value)
    default: throw failure()
    }
  }
  func execute(_ kind: String, _ payload: String, _ completion: @escaping (Result<String, Error>) -> Void) {
    queue.async {
      do {
        try self.checked(payload.utf8.count <= self.maxModel + ((self.maxUpload + 2) / 3) * 4 + self.maxJournal)
        guard let parent = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw self.failure() }
        if !FileManager.default.fileExists(atPath: parent.path) {
          try self.checked(mkdir(parent.path, 0o700) == 0)
          try self.fence(parent.deletingLastPathComponent())
        }
        let parentInfo = try self.fileStat(parent.path)
        try self.checked((parentInfo.st_mode & S_IFMT) == S_IFDIR)
        try self.fence(parent)
        let root = parent.appendingPathComponent("splotch-ai-journal-v1")
        try self.directory(root, parent)
        let descriptor = open(root.appendingPathComponent("owner.lock").path, O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
        try self.checked(descriptor >= 0)
        let response: String
        do {
          _ = try self.regular(descriptor)
          try self.checked(flock(descriptor, LOCK_EX) == 0)
          try self.checked(fsync(descriptor) == 0 && fcntl(descriptor, F_FULLFSYNC) == 0)
          try self.fence(root)
          let input = try self.object(JSONSerialization.jsonObject(with: Data(payload.utf8)))
          let output = try self.data(self.dispatch(root, kind, input))
          try self.checked(output.count <= (["readPreparedUpload", "readRecoveryUpload"].contains(kind) ? self.maxUploadReply : self.maxJournal))
          try self.checked(flock(descriptor, LOCK_UN) == 0)
          guard let text = String(data: output, encoding: .utf8) else { throw self.failure() }
          response = text
        } catch { _ = close(descriptor); throw error }
        try self.checked(close(descriptor) == 0)
        completion(.success(response))
      } catch { completion(.failure(error)) }
    }
  }
}
