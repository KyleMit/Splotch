import React
import UIKit

private let millisecondsPerSecond = 1000.0
private let hitTestAlphaThreshold: CGFloat = 0.01

@objc(SplotchPaperInputView)
final class SplotchPaperInputView: RCTView {
  @objc var onPaperInput: RCTDirectEventBlock?
  private struct Contact {
    let identifier: String
    let startedAt: TimeInterval
    let touch: UITouch
  }
  private var contacts: [ObjectIdentifier: Contact] = [:]
  private var nextIdentifier = 0
  private var sequence = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    isMultipleTouchEnabled = true
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard isUserInteractionEnabled, !isHidden, alpha >= hitTestAlphaThreshold,
      self.point(inside: point, with: event) else { return nil }
    return self
  }

  // A sample, a contact and a packet as src/drawing/paperInput.ts reads them. The probe build's
  // replay (SplotchPaperReplay.swift) sends its packets through these three as well.
  func samplePayload(at point: CGPoint, timestampMs: Double) -> [String: Any] {
    ["pageX": point.x, "pageY": point.y, "timestamp": timestampMs]
  }

  func contactPayload(identifier: String, startedAtMs: Double, tool: String, samples: [[String: Any]]) -> [String: Any] {
    ["identifier": identifier, "startedAt": startedAtMs, "tool": tool, "samples": samples]
  }

  @discardableResult
  func dispatch(_ phase: String, changed: [String], contacts: [[String: Any]]) -> Bool {
    guard let window else { return false }
    onPaperInput?(["sequence": sequence, "phase": phase,
      "changed": changed, "contacts": contacts,
      "viewport": ["width": window.bounds.width, "height": window.bounds.height,
        "bottomInset": window.safeAreaInsets.bottom]])
    sequence += 1
    return onPaperInput != nil
  }

  private func sample(_ touch: UITouch, in window: UIWindow) -> [String: Any] {
    samplePayload(at: touch.location(in: window), timestampMs: touch.timestamp * millisecondsPerSecond)
  }

  private func tool(_ touch: UITouch) -> String {
    switch touch.type {
    case .direct: return "touch"
    case .pencil: return "pen"
    case .indirectPointer: return "mouse"
    default: return "unknown"
    }
  }

  private func send(_ phase: String, changed: Set<UITouch>, event: UIEvent?) {
    guard let window else { return }
    let changedIds = Set(changed.map(ObjectIdentifier.init))
    let identifiers = changedIds.compactMap { contacts[$0]?.identifier }
    guard !identifiers.isEmpty else { return }
    let payload = contacts.map { key, contact -> [String: Any] in
      let history = phase == "move" && changedIds.contains(key)
        ? event?.coalescedTouches(for: contact.touch) ?? [contact.touch] : [contact.touch]
      var samples = history.filter { $0.timestamp >= contact.startedAt }.map { sample($0, in: window) }
      if history.last !== contact.touch { samples.append(sample(contact.touch, in: window)) }
      return contactPayload(identifier: contact.identifier, startedAtMs: contact.startedAt * millisecondsPerSecond,
        tool: tool(contact.touch), samples: samples)
    }
    dispatch(phase, changed: identifiers, contacts: payload)
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    for touch in touches {
      contacts[ObjectIdentifier(touch)] = Contact(identifier: String(nextIdentifier), startedAt: touch.timestamp, touch: touch)
      nextIdentifier += 1
    }
    send("start", changed: touches, event: event)
    super.touchesBegan(touches, with: event)
  }
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    send("move", changed: touches, event: event)
    super.touchesMoved(touches, with: event)
  }
  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    send("end", changed: touches, event: event)
    for touch in touches { contacts.removeValue(forKey: ObjectIdentifier(touch)) }
    super.touchesEnded(touches, with: event)
  }
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    send("cancel", changed: touches, event: event)
    for touch in touches { contacts.removeValue(forKey: ObjectIdentifier(touch)) }
    super.touchesCancelled(touches, with: event)
  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { contacts.removeAll() }
  }
}

@objc(SplotchPaperInputManager)
final class SplotchPaperInputManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { SplotchPaperInputView(frame: .zero) }
}
