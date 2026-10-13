import React
import UIKit

// Whether Guided Access holds the app, so Settings can confirm the lock and show how to leave it,
// as the shipping DeviceLockPlugin.swift does. UIAccessibility is UIKit state, read on the main
// queue: off it the flag can read false.
@objc(SplotchDeviceLock)
class SplotchDeviceLock: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(isLocked:rejecter:)
  func isLocked(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { resolve(UIAccessibility.isGuidedAccessEnabled) }
  }
}
