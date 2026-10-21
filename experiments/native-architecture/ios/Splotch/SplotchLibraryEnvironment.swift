import Foundation
import Network
import React

@objc(SplotchLibraryEnvironment)
class SplotchLibraryEnvironment: NSObject, RCTInvalidating {
  private let networkWaitSeconds = 3.0
  private let queue = DispatchQueue(label: "art.splotch.offline-library", qos: .utility)
  private let monitor = NWPathMonitor()
  private var currentPath: NWPath?
  private var privateRoot: URL?
  private var pendingEnvironment: [UUID: (NWPath?) -> Void] = [:]

  override init() {
    super.init()
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      self.currentPath = path
      let waiting = Array(self.pendingEnvironment.values)
      self.pendingEnvironment.removeAll()
      waiting.forEach { $0(path) }
    }
    monitor.start(queue: queue)
  }

  deinit { monitor.cancel() }

  @objc func invalidate() {
    monitor.pathUpdateHandler = nil
    monitor.cancel()
    queue.async { [weak self] in
      guard let self else { return }
      let waiting = Array(self.pendingEnvironment.values)
      self.pendingEnvironment.removeAll()
      waiting.forEach { $0(nil) }
    }
  }

  private func root() throws -> URL {
    if let directory = privateRoot { return directory }
    let directory = try SplotchLibraryFiles.root()
    privateRoot = directory
    return directory
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(environment:rejecter:)
  func environment(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      do {
        let directory = try self.root()
        let finish: (NWPath?) -> Void = { path in
          resolve(["rootUri": directory.absoluteString,
                   "online": path?.status == .satisfied,
                   "metered": path.map { $0.isExpensive } ?? true])
        }
        if let path = self.currentPath { finish(path); return }
        let identity = UUID()
        self.pendingEnvironment[identity] = finish
        self.queue.asyncAfter(deadline: .now() + self.networkWaitSeconds) {
          self.pendingEnvironment.removeValue(forKey: identity)?(nil)
        }
      } catch { reject("library_unavailable", "Coloring storage is unavailable", error) }
    }
  }

  @objc(verify:bytes:sha256:resolver:rejecter:)
  func verify(_ uri: String, bytes: Double, sha256: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      do {
        let directory = try self.root().resolvingSymlinksInPath().standardizedFileURL
        guard let url = URL(string: uri), url.isFileURL,
              url.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(directory.path + "/"),
              bytes > 0, bytes <= Double(SplotchLibraryFiles.maxFileBytes), bytes.rounded() == bytes,
              sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
          throw NSError(domain: "SplotchLibrary", code: 1)
        }
        let properties = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard properties.isRegularFile == true, properties.fileSize == Int(bytes) else { resolve(false); return }
        resolve(try SplotchLibraryFiles.sha256(url) == sha256)
      } catch { reject("library_verify", "Coloring verification failed", error) }
    }
  }

  @objc(install:identity:allowMetered:resolver:rejecter:)
  func install(_ marker: String, identity: String, allowMetered: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    SplotchLibraryDownloads.shared.install(marker: marker, identity: identity, allowMetered: allowMetered) { result in
      switch result {
      case .success: resolve(true)
      case .failure(let error):
        let code = (error as? SplotchLibraryError) == .storageFull ? "library_storage_full" : "library_download"
        reject(code, "Coloring download did not complete", error)
      }
    }
  }

  @objc(cancelAll:rejecter:)
  func cancelAll(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    SplotchLibraryDownloads.shared.cancelAll { error in
      if let error { reject("library_cancel", "Coloring download cancellation failed", error) }
      else { resolve(true) }
    }
  }
}
