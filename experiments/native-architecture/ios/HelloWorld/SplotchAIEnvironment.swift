import Foundation
import UIKit
import Security
import CryptoKit
import React

@objc(SplotchAIEnvironment)
final class SplotchAIEnvironment: NSObject {
  private let service = "art.splotch.ai-credentials-v1"
  private let maxBytes = 8192
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
}
