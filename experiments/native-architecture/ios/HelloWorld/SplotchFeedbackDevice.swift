import React
import UIKit

@objc(SplotchFeedbackDevice)
final class SplotchFeedbackDevice: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func constantsToExport() -> [AnyHashable: Any]! {
    var system = utsname()
    uname(&system)
    let machine = withUnsafeBytes(of: &system.machine) { bytes in
      String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
    }
    let model = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? machine
    return ["os": "ios \(UIDevice.current.systemVersion)", "model": model]
  }
}
