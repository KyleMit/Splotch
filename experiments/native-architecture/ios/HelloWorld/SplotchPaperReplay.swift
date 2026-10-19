import React
import UIKit

// The perf probe's open-loop replay (src/drawing/perfReplay.ts; DEVELOPMENT.md, "Replay"). Only
// a probe build's JavaScript calls this module, so a launch argument alone replays nothing. Once
// the paper input view is laid out and settled, every packet goes out on the main queue at its
// scheduled time through the view's own payload builder, whatever the app is doing.

private let paperPollInterval = DispatchTimeInterval.milliseconds(100)
private let paperWaitLimit = DispatchTimeInterval.seconds(60)
private let nanosecondsPerMillisecond = 1_000_000.0
private let microsecondsPerMillisecond = 1000.0
// Keeps replayed contacts apart from the view's own touch identifiers.
private let replayIdentifierPrefix = "replay-"
private let replayTool = "touch"

private struct ReplaySample: Decodable {
  let dt: Double
  let x: Double
  let y: Double
}

private struct ReplayContact: Decodable {
  let id: String
  let samples: [ReplaySample]
}

private struct ReplayPacket: Decodable {
  let t: Double
  let phase: String
  let changed: [String]
  let contacts: [ReplayContact]
}

// sampleTimeMs in src/drawing/replayTrace.ts: a sample listed again in a later packet lands on
// exactly the time it had before, so its contact's samples never go backward.
private func sampleTimeMs(_ t: Double, _ dt: Double) -> Double {
  ((t + dt) * microsecondsPerMillisecond).rounded() / microsecondsPerMillisecond
}

private func laidOutPaper(in view: UIView) -> SplotchPaperInputView? {
  if let paper = view as? SplotchPaperInputView, paper.window != nil, !paper.isHidden,
    !paper.bounds.isEmpty { return paper }
  for subview in view.subviews {
    if let paper = laidOutPaper(in: subview) { return paper }
  }
  return nil
}

private func laidOutPaper() -> SplotchPaperInputView? {
  for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
    for window in scene.windows {
      if let paper = laidOutPaper(in: window) { return paper }
    }
  }
  return nil
}

private final class ReplayRun {
  private let packets: [ReplayPacket]
  private weak var paper: SplotchPaperInputView?
  private let startNs = DispatchTime.now().uptimeNanoseconds
  private let finish: ([String: Any]) -> Void
  private let timer = DispatchSource.makeTimerSource(flags: .strict, queue: .main)
  private var next = 0
  private var delivered = 0
  private var latenessMs: [Double] = []
  private var lastEmissionNs: UInt64 = 0
  private var startedAtMs: [String: Double] = [:]

  init(packets: [ReplayPacket], paper: SplotchPaperInputView, finish: @escaping ([String: Any]) -> Void) {
    self.packets = packets
    self.paper = paper
    self.finish = finish
  }

  func begin() {
    timer.setEventHandler { [weak self] in self?.emitDue() }
    arm()
    timer.resume()
  }

  private func deadline(_ index: Int) -> UInt64 {
    startNs + UInt64((packets[index].t * nanosecondsPerMillisecond).rounded())
  }

  private func arm() {
    timer.schedule(deadline: DispatchTime(uptimeNanoseconds: deadline(next)), leeway: .nanoseconds(0))
  }

  // Emits every packet whose time has come, late ones back to back, then sleeps until the next.
  private func emitDue() {
    while next < packets.count {
      let now = DispatchTime.now().uptimeNanoseconds
      let due = deadline(next)
      guard due <= now else { return arm() }
      latenessMs.append(Double(now - due) / nanosecondsPerMillisecond)
      if emit(packets[next]) { delivered += 1 }
      lastEmissionNs = now
      next += 1
    }
    timer.cancel()
    finish(["packets": packets.count, "delivered": delivered, "traceMs": packets.last?.t ?? 0,
      "durationMs": Double(lastEmissionNs - startNs) / nanosecondsPerMillisecond, "latenessMs": latenessMs])
  }

  // Sample times are the replay's start on the UITouch.timestamp clock plus the trace's own, so a
  // late packet carries the times it was due at, as a late touch event carries its digitizer's.
  private func emit(_ packet: ReplayPacket) -> Bool {
    let baseMs = Double(startNs) / nanosecondsPerMillisecond
    for contact in packet.contacts where startedAtMs[contact.id] == nil {
      startedAtMs[contact.id] = baseMs + sampleTimeMs(packet.t, contact.samples[0].dt)
    }
    guard let paper, let window = paper.window else { return false }
    let size = paper.bounds.size
    let contacts = packet.contacts.map { contact in
      paper.contactPayload(identifier: replayIdentifierPrefix + contact.id,
        startedAtMs: startedAtMs[contact.id] ?? baseMs, tool: replayTool,
        samples: contact.samples.map { sample in
          paper.samplePayload(at: paper.convert(CGPoint(x: sample.x * size.width, y: sample.y * size.height), to: window),
            timestampMs: baseMs + sampleTimeMs(packet.t, sample.dt))
        })
    }
    return paper.dispatch(packet.phase, changed: packet.changed.map { replayIdentifierPrefix + $0 }, contacts: contacts)
  }
}

@objc(SplotchPaperReplay)
final class SplotchPaperReplay: NSObject {
  private var run: ReplayRun?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(requestedTrace:resolver:rejecter:)
  func requestedTrace(_ launchKey: String, resolver resolve: RCTPromiseResolveBlock,
                      rejecter _: RCTPromiseRejectBlock) {
    // `-SplotchReplay <name>` after the bundle id (simctl, Xcode) lands in UserDefaults; devicectl
    // takes the trace from DEVICECTL_CHILD_SplotchReplay in its environment instead.
    resolve(UserDefaults.standard.string(forKey: launchKey) ?? ProcessInfo.processInfo.environment[launchKey])
  }

  @objc(start:packets:settleMs:resolver:rejecter:)
  func start(_ name: String, packets json: String, settleMs: Double,
             resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let packets: [ReplayPacket]
    do {
      packets = try JSONDecoder().decode([ReplayPacket].self, from: Data(json.utf8))
    } catch {
      return reject("replay_trace", "Trace \(name) does not decode: \(error)", error)
    }
    guard !packets.isEmpty else { return reject("replay_trace", "Trace \(name) has no packets", nil) }
    DispatchQueue.main.async {
      guard self.run == nil else { return reject("replay_busy", "A replay is already running", nil) }
      self.awaitPaper(until: .now() + paperWaitLimit) {
        self.begin(packets, settle: .milliseconds(Int(settleMs)), resolve, reject)
      } missing: {
        reject("replay_paper", "No laid-out paper input view appeared", nil)
      }
    }
  }

  private func awaitPaper(until limit: DispatchTime, then ready: @escaping () -> Void,
                          missing: @escaping () -> Void) {
    if laidOutPaper() != nil { return ready() }
    if DispatchTime.now() >= limit { return missing() }
    DispatchQueue.main.asyncAfter(deadline: .now() + paperPollInterval) {
      self.awaitPaper(until: limit, then: ready, missing: missing)
    }
  }

  private func begin(_ packets: [ReplayPacket], settle: DispatchTimeInterval,
                     _ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.asyncAfter(deadline: .now() + settle) {
      guard self.run == nil else { return reject("replay_busy", "A replay is already running", nil) }
      guard let paper = laidOutPaper() else {
        return reject("replay_paper", "The paper input view went away while settling", nil)
      }
      let run = ReplayRun(packets: packets, paper: paper) { report in
        self.run = nil
        resolve(report)
      }
      self.run = run
      run.begin()
    }
  }
}
