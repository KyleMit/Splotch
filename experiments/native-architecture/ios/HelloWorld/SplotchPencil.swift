import React
import UIKit

// UIKit delivers the Apple Pencil double-tap only to a UIPencilInteraction, never as a touch, so
// the drawing screen hears it through this emitter. The interaction lives on the key window while
// JavaScript listens, and every tap is reported rather than honoring preferredTapAction, matching
// the shipping PencilEraserPlugin.
@objc(SplotchPencil)
class SplotchPencil: RCTEventEmitter, UIPencilInteractionDelegate {
  private let doubleTapEvent = "pencilDoubleTap"
  private var interaction: UIPencilInteraction?

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [doubleTapEvent] }

  override func startObserving() {
    DispatchQueue.main.async { [weak self] in self?.attach() }
  }

  override func stopObserving() {
    DispatchQueue.main.async { [weak self] in self?.detach() }
  }

  private func attach() {
    guard interaction == nil, let window = keyWindow() else { return }
    let pencil = UIPencilInteraction()
    pencil.delegate = self
    window.addInteraction(pencil)
    interaction = pencil
  }

  private func detach() {
    if let pencil = interaction { pencil.view?.removeInteraction(pencil) }
    interaction = nil
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
  }

  func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
    sendEvent(withName: doubleTapEvent, body: nil)
  }
}
