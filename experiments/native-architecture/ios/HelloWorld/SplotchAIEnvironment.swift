import Foundation
import UIKit
import Security
import CryptoKit
import React
import ImageIO
import UniformTypeIdentifiers

@objc(SplotchAIEnvironment)
final class SplotchAIEnvironment: NSObject {
  private let journal = SplotchAIJournal()
  @objc(aiStorage:payload:resolver:rejecter:)
  func aiStorage(_ kind: String, payload: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    journal.execute(kind, payload) { result in
      switch result {
      case .success(let value): resolve(value)
      case .failure: reject("AI_DURABILITY_UNAVAILABLE", "AI storage was not confirmed. Nothing new was sent.", nil)
      }
    }
  }
  private let service = "art.splotch.ai-credentials-v1"
  private let maxBytes = 8192
  private let maxCredentialBytes = 2048
  private let referenceBytes = 32
  private let protectedPrefix = "SPLOTCH-AI-VAULT-2\n"
  private let queue = DispatchQueue(label: "art.splotch.ai-credentials")
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc var methodQueue: DispatchQueue { queue }
  private func query(_ name: String) throws -> [String: Any] {
    guard name == "gemini-api-key" || name == "managed-access-code" || name == "free-generation-identity" else { throw failure() }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: name, kSecAttrSynchronizable as String: false]
  }
  private func failure() -> NSError { NSError(domain: "AI_SECURE_UNAVAILABLE", code: 1) }
  private func readStored(_ name: String) throws -> String? {
    var request = try query(name)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data, data.count <= maxBytes,
      let value = String(data: data, encoding: .utf8), !value.isEmpty else { throw failure() }
    return value
  }
  private func protectedRecord(_ name: String) throws -> [String: String]? {
    guard let stored = try readStored(name), stored.hasPrefix(protectedPrefix) else { return nil }
    let bytes = Data(stored.dropFirst(protectedPrefix.count).utf8)
    guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      Set(object.keys) == Set(["version", "reference", "value"]),
      let version = object["version"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 2,
      let reference = object["reference"] as? String, reference.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
      let value = object["value"] as? String, !value.isEmpty else { throw failure() }
    return ["reference": reference, "value": value]
  }
  private func read(_ name: String) throws -> String? {
    guard let stored = try readStored(name) else { return nil }
    if stored.hasPrefix(protectedPrefix) {
      guard let confirmed = try protectedRecord(name), let value = confirmed["value"] else { throw failure() }
      return value
    }
    return stored
  }
  private func installationValue() throws -> String {
    let raw = Thread.isMainThread ? UIDevice.current.identifierForVendor?.uuidString : DispatchQueue.main.sync { UIDevice.current.identifierForVendor?.uuidString }
    guard let raw, !raw.isEmpty else { throw failure() }
    return SHA256.hash(data: Data("splotch-free-generation-v1:\(raw)".utf8)).map { String(format: "%02x", $0) }.joined()
  }
  private func writeProtected(_ name: String, _ value: String) throws -> String {
    var bytes = [UInt8](repeating: 0, count: referenceBytes)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw failure() }
    let reference = bytes.map { String(format: "%02x", $0) }.joined()
    let previous = try protectedRecord(name)
    guard previous?["reference"] != reference else { throw failure() }
    let object: [String: Any] = ["version": 2, "reference": reference, "value": value]
    let encoded = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    var data = Data(protectedPrefix.utf8); data.append(encoded)
    guard data.count <= maxBytes else { throw failure() }
    let request = try query(name)
    let attributes: [String: Any] = [kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecAttrSynchronizable as String: false]
    var status = SecItemUpdate(request as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound { status = SecItemAdd(request.merging(attributes) { _, new in new } as CFDictionary, nil) }
    guard status == errSecSuccess, let confirmed = try protectedRecord(name),
      confirmed["reference"] == reference, confirmed["value"] == value else { throw failure() }
    return reference
  }
  @objc(pinCredentialReference:resolver:rejecter:)
  func pinCredentialReference(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      let value: String?
      if name == "free-generation-identity" { value = try self.installationValue() }
      else { value = try self.read(name) }
      guard let value, !value.isEmpty else { throw self.failure() }
      if let current = try self.protectedRecord(name), current["value"] == value { return current["reference"] }
      return try self.writeProtected(name, value)
    }
  }
  @objc(readReferencedCredential:reference:resolver:rejecter:)
  func readReferencedCredential(_ name: String, reference: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      guard reference.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
        let current = try self.protectedRecord(name), current["reference"] == reference,
        let value = current["value"] else { throw self.failure() }
      if name == "free-generation-identity" { guard value == (try self.installationValue()) else { throw self.failure() } }
      return value
    }
  }
  private func guarded(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock, _ operation: () throws -> Any?) {
    do { resolve(try operation()) }
    catch { reject("AI_SECURE_UNAVAILABLE", "Secure AI storage is unavailable.", nil) }
  }
  @objc(installationId:rejecter:)
  func installationId(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guarded(resolve, reject) { try self.installationValue() }
  }
  @objc(readCredential:resolver:rejecter:)
  func readCredential(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      guard name == "gemini-api-key" || name == "managed-access-code" else { throw self.failure() }
      return try self.read(name)
    }
  }
  @objc(writeCredential:value:resolver:rejecter:)
  func writeCredential(_ name: String, value: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      guard name == "gemini-api-key" || name == "managed-access-code", !value.isEmpty,
        value.utf8.count <= self.maxCredentialBytes else { throw self.failure() }
      _ = try self.writeProtected(name, value)
      return true
    }
  }
  @objc(writeReferencedCredential:value:resolver:rejecter:)
  func writeReferencedCredential(_ name: String, value: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      guard name == "gemini-api-key" || name == "managed-access-code", !value.isEmpty,
        value.utf8.count <= self.maxCredentialBytes else { throw self.failure() }
      return try self.writeProtected(name, value)
    }
  }
  @objc(removeCredential:resolver:rejecter:)
  func removeCredential(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      guard name == "gemini-api-key" || name == "managed-access-code" else { throw self.failure() }
      let status = SecItemDelete(try self.query(name) as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound,
        try self.read(name) == nil else { throw self.failure() }
      return true
    }
  }
  @objc(decodeImage:mime:width:height:purpose:resolver:rejecter:)
  func decodeImage(_ base64: String, mime: String, width: Double, height: Double, purpose: String,
    resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      guard ["result", "original"].contains(purpose), purpose != "original" || mime == "image/png" else { throw failure() }
      let maxPixels = purpose == "original" ? SplotchAIImageDecoder.maxOriginalPixels : SplotchAIImageDecoder.maxImagePixels
      let maxDimension = purpose == "original" ? maxPixels : SplotchAIImageDecoder.maxImageDimension
      guard width.isFinite, height.isFinite, width.rounded() == width, height.rounded() == height,
        width >= 1, height >= 1, width <= Double(maxDimension), height <= Double(maxDimension),
        width * height <= Double(maxPixels), base64.count <= ((SplotchAIImageDecoder.maxImageBytes + 2) / 3) * 4,
        let bytes = Data(base64Encoded: base64), bytes.base64EncodedString() == base64 else { throw failure() }
      let result = try (purpose == "original" ? SplotchAIImageDecoder.decodeOriginal(bytes) : SplotchAIImageDecoder.decode(bytes, mime))
      guard result["width"] == Int(width), result["height"] == Int(height) else { throw failure() }
      resolve(result)
    } catch { reject("AI_IMAGE_REJECTED", "AI picture decoding failed.", nil) }
  }
}

enum SplotchAIImageDecoder {
  static let maxImageBytes = 16 * 1024 * 1024
  static let maxImageDimension = 4096
  static let maxImagePixels = 4 * 1024 * 1024
  static let maxOriginalPixels = 16 * 1024 * 1024
  private static let maxPngChunks = 4096
  private static let maxJpegSegments = 1024
  private static let maxWebpChunks = 8
  private static let crcTable: [UInt32] = (0..<256).map { value in
    var crc = UInt32(value)
    for _ in 0..<8 { crc = crc & 1 == 1 ? 0xedb88320 ^ (crc >> 1) : crc >> 1 }
    return crc
  }
  private static func require(_ condition: Bool) throws {
    if !condition { throw NSError(domain: "AI_IMAGE_REJECTED", code: 1) }
  }
  private static func structure(_ bytes: Data, _ mime: String) throws {
    let b = [UInt8](bytes)
    func text(_ start: Int, _ count: Int) -> String { String(bytes: b[start..<(start + count)], encoding: .ascii) ?? "" }
    func be(_ start: Int) -> UInt32 { b[start..<(start + 4)].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) } }
    func le(_ start: Int) -> UInt32 { UInt32(b[start]) | UInt32(b[start + 1]) << 8 | UInt32(b[start + 2]) << 16 | UInt32(b[start + 3]) << 24 }
    if mime == "image/png" {
      try require(b.count >= 33 && Array(b.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10])
      var offset = 8, chunks = 0, dataSeen = false, ended = false
      while offset < b.count {
        chunks += 1
        try require(chunks <= maxPngChunks && offset <= b.count - 12 && !ended)
        let length = Int(be(offset)), type = text(offset + 4, 4)
        try require(length <= b.count - offset - 12)
        let end = offset + length + 12
        var crc: UInt32 = 0xffffffff
        for index in (offset + 4)..<(end - 4) {
          crc = crcTable[Int((crc ^ UInt32(b[index])) & 255)] ^ (crc >> 8)
        }
        try require(crc ^ 0xffffffff == be(end - 4))
        if chunks == 1 {
          try require(type == "IHDR" && length == 13 && b[offset + 16] == 8 && [2, 6].contains(b[offset + 17]) && b[offset + 18] == 0 && b[offset + 19] == 0 && b[offset + 20] == 0)
        } else if type == "IDAT" { dataSeen = true }
        else if type == "IEND" { try require(length == 0 && dataSeen && end == b.count); ended = true }
        else { try require(!dataSeen && ["cHRM", "gAMA", "sRGB", "sBIT", "pHYs", "PLTE"].contains(type)) }
        offset = end
      }
      try require(ended)
    } else if mime == "image/jpeg" {
      try require(b.count >= 4 && b[0] == 255 && b[1] == 0xd8)
      var offset = 2, segments = 0, entropy = false, scanned = false, ended = false
      while offset < b.count {
        try require(offset + 1 < b.count && b[offset] == 255)
        let marker = b[offset + 1]; offset += 2
        if entropy && (marker == 0 || (0xd0...0xd7).contains(marker)) {
          while offset < b.count && b[offset] != 255 { offset += 1 }
          continue
        }
        entropy = false
        if marker == 0xd9 { try require(scanned && offset == b.count); ended = true; break }
        segments += 1
        try require(segments <= maxJpegSegments && offset + 1 < b.count)
        let length = Int(b[offset]) * 256 + Int(b[offset + 1])
        try require(length >= 2 && length <= b.count - offset)
        try require([0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda, 0xfe].contains(marker) || (0xe0...0xef).contains(marker))
        offset += length
        if marker == 0xda { entropy = true; scanned = true }
        while entropy && offset < b.count && b[offset] != 255 { offset += 1 }
      }
      try require(ended)
    } else {
      try require(mime == "image/webp" && b.count >= 20 && text(0, 4) == "RIFF" && text(8, 4) == "WEBP" && Int(le(4)) == b.count - 8)
      var offset = 12, seen = Set<String>(), picture = false
      while offset < b.count {
        try require(offset <= b.count - 8 && seen.count < maxWebpChunks)
        let type = text(offset, 4), length = Int(le(offset + 4))
        try require(!seen.contains(type) && length <= b.count - offset - 8)
        let end = offset + length + 8
        try require(end + (length & 1) <= b.count && (length & 1 == 0 || b[end] == 0))
        if type == "VP8X" { try require(offset == 12 && length == 10 && b[offset + 8] & 0xc3 == 0) }
        else if type == "VP8 " || type == "VP8L" { try require(!picture && length > 0); picture = true }
        else { try require(["ALPH", "ICCP", "EXIF", "XMP "].contains(type)) }
        seen.insert(type); offset = end + (length & 1)
      }
      try require(picture)
    }
  }
  static func decode(_ data: Data, _ mime: String) throws -> [String: Int] {
    try decode(data, mime, maxPixels: maxImagePixels, maxDimension: maxImageDimension)
  }
  static func decodeOriginal(_ data: Data) throws -> [String: Int] {
    try decode(data, "image/png", maxPixels: maxOriginalPixels, maxDimension: maxOriginalPixels)
  }
  private static func decode(_ data: Data, _ mime: String, maxPixels: Int, maxDimension: Int) throws -> [String: Int] {
    try autoreleasepool {
      try require(!data.isEmpty && data.count <= maxImageBytes && ["image/png", "image/jpeg", "image/webp"].contains(mime))
      try structure(data, mime)
      guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
        CGImageSourceGetCount(source) == 1, CGImageSourceGetStatus(source) == .statusComplete,
        let type = CGImageSourceGetType(source), let expected = UTType(mimeType: mime), type as String == expected.identifier,
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let w = properties[kCGImagePropertyPixelWidth] as? NSNumber,
        let h = properties[kCGImagePropertyPixelHeight] as? NSNumber else { throw NSError(domain: "AI_IMAGE_REJECTED", code: 1) }
      let width = w.doubleValue, height = h.doubleValue
      try require(width.isFinite && height.isFinite && width.rounded() == width && height.rounded() == height && width >= 1 && height >= 1 && width <= Double(maxDimension) && height <= Double(maxDimension) && width * height <= Double(maxPixels))
      let options = [kCGImageSourceShouldCache: true, kCGImageSourceShouldCacheImmediately: true] as CFDictionary
      guard let image = CGImageSourceCreateImageAtIndex(source, 0, options), image.width == Int(width), image.height == Int(height),
        image.bitsPerComponent == 8, image.bitsPerPixel <= 32, image.bytesPerRow <= maxDimension * 4,
        image.bytesPerRow * image.height <= maxPixels * 4,
        let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
          bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
        else { throw NSError(domain: "AI_IMAGE_REJECTED", code: 1) }
      context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
      context.flush()
      try require(CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete)
      return ["width": image.width, "height": image.height]
    }
  }
}
