import Foundation
import os

// One perf-probe line (src/drawing/perfProbe.native.ts) to the unified log, readable from a
// host. A Release build drops JavaScript's console, and the line carries no private data, so it is
// public.
private let perfLog = Logger(subsystem: Bundle.main.bundleIdentifier ?? "SplotchPerf", category: "SplotchPerf")

@objc(SplotchPerfLog)
final class SplotchPerfLog: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(write:)
  func write(_ line: String) {
    perfLog.notice("\(line, privacy: .public)")
  }
}
