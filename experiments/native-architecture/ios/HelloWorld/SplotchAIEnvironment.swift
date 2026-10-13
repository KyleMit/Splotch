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
  private let maxImageBytes = 16 * 1024 * 1024
  private let maxImageDimension = 4096
  private let maxImagePixels = 4 * 1024 * 1024
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
  @objc(decodeImage:mime:width:height:resolver:rejecter:)
  func decodeImage(_ base64: String, mime: String, width: Double, height: Double,
    resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      let result = try autoreleasepool { () throws -> [String: Int] in
        guard ["image/png", "image/jpeg", "image/webp"].contains(mime), width.isFinite, height.isFinite,
          width.rounded() == width, height.rounded() == height, width >= 1, height >= 1,
          width <= Double(self.maxImageDimension), height <= Double(self.maxImageDimension),
          width * height <= Double(self.maxImagePixels), base64.count <= ((self.maxImageBytes + 2) / 3) * 4,
          let data = Data(base64Encoded: base64), !data.isEmpty, data.count <= self.maxImageBytes,
          let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
          CGImageSourceGetCount(source) == 1, CGImageSourceGetStatus(source) == .statusComplete,
          let type = CGImageSourceGetType(source), let expected = UTType(mimeType: mime),
          type as String == expected.identifier,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let w = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let h = properties[kCGImagePropertyPixelHeight] as? NSNumber,
          w.doubleValue == width, h.doubleValue == height else { throw self.failure() }
        let options = [kCGImageSourceShouldCache: true, kCGImageSourceShouldCacheImmediately: true] as CFDictionary
        guard let image = CGImageSourceCreateImageAtIndex(source, 0, options), image.width == Int(width),
          image.height == Int(height), image.bitsPerComponent == 8, image.bitsPerPixel <= 32,
          image.bytesPerRow <= self.maxImageDimension * 4, image.bytesPerRow * image.height <= self.maxImagePixels * 4,
          let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
            bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
          else { throw self.failure() }
        context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
        context.flush()
        guard CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete else { throw self.failure() }
        return ["width": image.width, "height": image.height]
      }
      resolve(result)
    } catch { reject("AI_IMAGE_REJECTED", "AI picture decoding failed.", nil) }
  }
}
