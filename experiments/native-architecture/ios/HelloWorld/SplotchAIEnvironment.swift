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
  private let maxImageBytes = 16 * 1024 * 1024
  private let maxImageDimension = 4096
  private let maxImagePixels = 4 * 1024 * 1024
  private let queue = DispatchQueue(label: "art.splotch.ai-credentials")
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc var methodQueue: DispatchQueue { queue }
  private func query(_ name: String) throws -> [String: Any] {
    guard name == "gemini-api-key" || name == "managed-access-code" else { throw failure() }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: name, kSecAttrSynchronizable as String: false]
  }
  private func failure() -> NSError { NSError(domain: "AI_SECURE_UNAVAILABLE", code: 1) }
  private func read(_ name: String) throws -> String? {
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
  private func guarded(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock, _ operation: () throws -> Any?) {
    do { resolve(try operation()) }
    catch { reject("AI_SECURE_UNAVAILABLE", "Secure AI storage is unavailable.", nil) }
  }
  @objc(installationId:rejecter:)
  func installationId(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let raw = UIDevice.current.identifierForVendor?.uuidString, !raw.isEmpty else {
        reject("AI_ID_UNAVAILABLE", "Installation grant unavailable.", nil); return
      }
      resolve(SHA256.hash(data: Data("splotch-free-generation-v1:\(raw)".utf8)).map { String(format: "%02x", $0) }.joined())
    }
  }
  @objc(readCredential:resolver:rejecter:)
  func readCredential(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) { try self.read(name) }
  }
  @objc(writeCredential:value:resolver:rejecter:)
  func writeCredential(_ name: String, value: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
      let data = Data(value.utf8)
      guard !data.isEmpty, data.count <= self.maxBytes else { throw self.failure() }
      let request = try self.query(name)
      let attributes: [String: Any] = [kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAttrSynchronizable as String: false]
      var status = SecItemUpdate(request as CFDictionary, attributes as CFDictionary)
      if status == errSecItemNotFound {
        status = SecItemAdd(request.merging(attributes) { _, new in new } as CFDictionary, nil)
      }
      guard status == errSecSuccess, try self.read(name) == value else { throw self.failure() }
      return true
    }
  }
  @objc(removeCredential:resolver:rejecter:)
  func removeCredential(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guarded(resolve, reject) {
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
