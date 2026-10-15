import CryptoKit
import Foundation

struct SplotchLibraryFile: Codable, Equatable {
  let path: String
  let downloadPath: String
  let bytes: Int64
  let sha256: String
}

struct SplotchLibraryPack: Codable {
  let id: String
  let revision: String
  let bytes: Int64
  let files: [SplotchLibraryFile]
}

enum SplotchLibraryFiles {
  static let maxFileBytes: Int64 = 2097152
  private static let maxPackBytes: Int64 = 16777216
  private static let packFileCount = 74
  private static let hashBufferBytes = 65536

  static func root() throws -> URL {
    var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("splotch-offline-library-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    return directory
  }

  static func parse(marker: String, identity: String) throws -> SplotchLibraryPack {
    let pack = try JSONDecoder().decode(SplotchLibraryPack.self, from: Data(marker.utf8))
    let files = try JSONDecoder().decode([SplotchLibraryFile].self, from: Data(identity.utf8))
    guard pack.id.range(of: "^[a-z]+$", options: .regularExpression) != nil,
          pack.revision.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
          SHA256.hash(data: Data(identity.utf8)).map({ String(format: "%02x", $0) }).joined() == pack.revision,
          files == pack.files, files.count == packFileCount,
          Set(files.map(\.path)).count == files.count else { throw SplotchLibraryError.invalidPack }
    var total: Int64 = 0
    for file in files {
      let compactFill = file.path.range(of: "\\.(light|night)\\.webp$", options: .regularExpression) != nil &&
        file.downloadPath == file.path.replacingOccurrences(of: "/coloring/", with: "/coloring/max-1152px/")
      guard file.path.range(of: "^/coloring/\(pack.id)/[a-z0-9.-]+$", options: .regularExpression) != nil,
            !file.path.contains(".."), file.downloadPath == file.path || compactFill,
            file.bytes > 0, file.bytes <= maxFileBytes,
            file.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw SplotchLibraryError.invalidPack }
      total += file.bytes
    }
    guard total == pack.bytes, total > 0, total <= maxPackBytes else { throw SplotchLibraryError.invalidPack }
    return pack
  }

  static func directory(_ pack: SplotchLibraryPack) -> String { "\(pack.id)-\(pack.revision)" }
  static func stage(_ pack: SplotchLibraryPack) throws -> URL {
    try root().appendingPathComponent("transfers", isDirectory: true).appendingPathComponent(directory(pack), isDirectory: true)
  }
  static func pruneSupersededStages(_ pack: SplotchLibraryPack) throws {
    let staging = try stage(pack)
    let transfers = staging.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: transfers, withIntermediateDirectories: true)
    for sibling in try FileManager.default.contentsOfDirectory(at: transfers, includingPropertiesForKeys: nil)
      where sibling.lastPathComponent.hasPrefix(pack.id + "-") && sibling.lastPathComponent != staging.lastPathComponent {
      try FileManager.default.removeItem(at: sibling)
    }
  }
  static func destination(_ file: SplotchLibraryFile, in directory: URL) -> URL {
    directory.appendingPathComponent("files", isDirectory: true).appendingPathComponent(URL(fileURLWithPath: file.path).lastPathComponent)
  }
  static func matches(_ url: URL, file: SplotchLibraryFile) throws -> Bool {
    guard FileManager.default.fileExists(atPath: url.path) else { return false }
    let properties = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard properties.isRegularFile == true, properties.fileSize == Int(file.bytes) else { return false }
    return try sha256(url) == file.sha256
  }
  static func sha256(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while let data = try handle.read(upToCount: hashBufferBytes), !data.isEmpty { digest.update(data: data) }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }
}

enum SplotchLibraryError: Error, Equatable {
  case invalidPack
  case cancelled
  case verificationFailed
  case storageFull
}
