import AVFoundation
import React
import UIKit

private let clearAudioActivity = Notification.Name("SplotchClearAudioActivity")

private final class ClearNoteBank {
  let id: String
  private let buffers: [AVAudioPCMBuffer]
  private var engine: AVAudioEngine?
  private var voices = [UUID: AVAudioPlayerNode]()

  init(_ id: String, _ buffers: [AVAudioPCMBuffer]) {
    self.id = id
    self.buffers = buffers
  }

  private func activity(_ active: Bool) {
    NotificationCenter.default.post(name: clearAudioActivity, object: nil,
      userInfo: ["id": id, "active": active])
  }

  func play(_ index: Int, volume: Float) throws {
    guard buffers.indices.contains(index), volume.isFinite, volume > 0, volume <= 1 else {
      throw NSError(domain: "CLEAR_NOTE_UNAVAILABLE", code: 1)
    }
    let graph = engine ?? AVAudioEngine()
    engine = graph
    let node = AVAudioPlayerNode()
    let voice = UUID()
    graph.attach(node)
    graph.connect(node, to: graph.mainMixerNode, format: buffers[index].format)
    node.volume = volume
    let wasIdle = voices.isEmpty
    voices[voice] = node
    if wasIdle { activity(true) }
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      if !graph.isRunning {
        graph.prepare()
        try graph.start()
      }
      node.scheduleBuffer(buffers[index], completionCallbackType: .dataPlayedBack) { [weak self] _ in
        DispatchQueue.main.async { self?.finish(voice) }
      }
      node.play()
    } catch {
      stop()
      throw error
    }
  }

  private func finish(_ voice: UUID) {
    guard let node = voices.removeValue(forKey: voice), let graph = engine else { return }
    node.stop()
    graph.disconnectNodeOutput(node)
    graph.detach(node)
    if voices.isEmpty {
      graph.stop()
      engine = nil
      activity(false)
    }
  }

  func stop() {
    let active = !voices.isEmpty
    voices.values.forEach { $0.stop() }
    engine?.stop()
    voices.removeAll()
    engine = nil
    if active { activity(false) }
  }
}

@objc(SplotchClearSound)
final class SplotchClearSound: NSObject, RCTInvalidating {
  private var banks = [String: ClearNoteBank]()
  private var reservations = Set<String>()
  private var preparing = Set<String>()
  private var observers = [NSObjectProtocol]()
  private var invalidated = false

  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  override init() {
    super.init()
    for name in [UIApplication.willResignActiveNotification,
                 AVAudioSession.mediaServicesWereResetNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil,
        queue: .main) { [weak self] _ in self?.disposeAll() })
    }
    observers.append(NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] notification in
      guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: value) == .began else { return }
      self?.stop()
    })
  }

  @objc(create:rejecter:)
  func create(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard !invalidated, UIApplication.shared.applicationState == .active else {
      reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.", nil)
      return
    }
    let id = UUID().uuidString
    reservations.insert(id)
    resolve(id)
  }

  @objc(prepare:uris:resolver:rejecter:)
  func prepare(_ id: String, uris: [String], resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard !invalidated, reservations.contains(id), !preparing.contains(id), banks[id] == nil,
          !uris.isEmpty else {
      reject("CLEAR_NOTE_UNAVAILABLE", "Clear notes are unavailable.", nil)
      return
    }
    preparing.insert(id)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      do {
        let buffers = try uris.map { uri -> AVAudioPCMBuffer in
          guard let url = URL(string: uri), url.isFileURL else {
            throw NSError(domain: "CLEAR_NOTE_UNAVAILABLE", code: 1)
          }
          let file = try AVAudioFile(forReading: url)
          guard file.length > 0, file.length <= Int64(AVAudioFrameCount.max),
                file.processingFormat.channelCount == 1,
                let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                  frameCapacity: AVAudioFrameCount(file.length)) else {
            throw NSError(domain: "CLEAR_NOTE_UNAVAILABLE", code: 1)
          }
          try file.read(into: buffer)
          return buffer
        }
        DispatchQueue.main.async {
          guard let self else {
            reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.", nil)
            return
          }
          guard !self.invalidated, self.reservations.contains(id),
                UIApplication.shared.applicationState == .active else {
            self.dispose(id)
            reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.", nil)
            return
          }
          self.preparing.remove(id)
          self.banks[id] = ClearNoteBank(id, buffers)
          resolve(true)
        }
      } catch {
        DispatchQueue.main.async {
          self?.preparing.remove(id)
          self?.reservations.remove(id)
          reject("CLEAR_NOTE_UNAVAILABLE", "Clear notes are unavailable.", error)
        }
      }
    }
  }

  @objc(play:index:volume:resolver:rejecter:)
  func play(_ id: String, index: Int, volume: Double,
            resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard !invalidated, UIApplication.shared.applicationState == .active,
          let bank = banks[id] else {
      reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.", nil)
      return
    }
    do {
      try bank.play(index, volume: Float(volume))
      resolve(true)
    } catch {
      reject("CLEAR_NOTE_UNAVAILABLE", "Clear note did not play.", error)
    }
  }

  @objc func dispose(_ id: String) {
    reservations.remove(id)
    preparing.remove(id)
    banks.removeValue(forKey: id)?.stop()
  }

  private func stop() { banks.values.forEach { $0.stop() } }

  private func disposeAll() {
    reservations.removeAll()
    preparing.removeAll()
    stop()
    banks.removeAll()
  }

  @objc func invalidate() {
    DispatchQueue.main.async { [self] in
      invalidated = true
      disposeAll()
      observers.forEach { NotificationCenter.default.removeObserver($0) }
      observers.removeAll()
    }
  }
}
