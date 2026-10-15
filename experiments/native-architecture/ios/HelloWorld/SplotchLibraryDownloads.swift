import Foundation

private struct SplotchLibraryJob: Codable {
  let marker: String
  let identity: String
  let allowMetered: Bool
  let token: String
  var nextFileIndex: Int
}

final class SplotchLibraryDownloads: NSObject, URLSessionDownloadDelegate {
  static let shared = SplotchLibraryDownloads()
  private static let sessionPrefix = "art.splotch.migration.probe.library."
  private static let storageReserveBytes: Int64 = 8388608
  private let queue = DispatchQueue(label: "art.splotch.library-downloads", qos: .utility)
  private lazy var delegateQueue: OperationQueue = {
    let operations = OperationQueue()
    operations.maxConcurrentOperationCount = 1
    operations.underlyingQueue = queue
    return operations
  }()
  private lazy var wifiSession = makeSession(allowMetered: false)
  private lazy var meteredSession = makeSession(allowMetered: true)
  private var job: SplotchLibraryJob?
  private var pack: SplotchLibraryPack?
  private var completions: [(Result<Void, Error>) -> Void] = []
  private var backgroundCompletions: [String: () -> Void] = [:]

  static func handles(_ identifier: String) -> Bool { identifier.hasPrefix(sessionPrefix) }
  private func jobURL() throws -> URL { try SplotchLibraryFiles.root().appendingPathComponent("jobs/current.json") }
  private func sessionIdentifier(_ allowMetered: Bool) -> String { Self.sessionPrefix + (allowMetered ? "metered" : "wifi") }
  private func makeSession(allowMetered: Bool) -> URLSession {
    let configuration = URLSessionConfiguration.background(withIdentifier: sessionIdentifier(allowMetered))
    configuration.isDiscretionary = true
    configuration.sessionSendsLaunchEvents = true
    configuration.waitsForConnectivity = true
    configuration.allowsExpensiveNetworkAccess = allowMetered
    configuration.allowsConstrainedNetworkAccess = false
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
  }

  func install(marker: String, identity: String, allowMetered: Bool, completion: @escaping (Result<Void, Error>) -> Void) {
    queue.async {
      let pack: SplotchLibraryPack
      do { pack = try SplotchLibraryFiles.parse(marker: marker, identity: identity) }
      catch { completion(.failure(error)); return }
      do {
        if let active = self.job, active.marker == marker, active.identity == identity, active.allowMetered == allowMetered {
          self.completions.append(completion)
          return
        }
        self.cancelCurrent()
        self.job = SplotchLibraryJob(marker: marker, identity: identity, allowMetered: allowMetered, token: UUID().uuidString, nextFileIndex: 0)
        self.pack = pack
        self.completions.append(completion)
        try self.persist()
        try SplotchLibraryFiles.pruneSupersededStages(pack)
        self.startNextFile()
      } catch { self.fail(error) }
    }
  }

  func resumePendingDownload() {
    queue.async {
      guard self.job == nil else { return }
      do {
        let url = try self.jobURL()
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let job = try JSONDecoder().decode(SplotchLibraryJob.self, from: Data(contentsOf: url))
        let pack = try SplotchLibraryFiles.parse(marker: job.marker, identity: job.identity)
        guard job.nextFileIndex >= 0, job.nextFileIndex <= pack.files.count else { throw SplotchLibraryError.invalidPack }
        try SplotchLibraryFiles.pruneSupersededStages(pack)
        self.job = job
        self.pack = pack
        let session = job.allowMetered ? self.meteredSession : self.wifiSession
        session.getAllTasks { tasks in
          self.queue.async {
            guard self.job?.token == job.token else { return }
            if !tasks.contains(where: { $0.taskDescription == "\(job.token):\(job.nextFileIndex)" }) { self.startNextFile() }
          }
        }
      } catch { self.cancelCurrent() }
    }
  }

  func cancelAll(completion: @escaping (Error?) -> Void) {
    queue.async {
      self.cancelCurrent()
      do {
        let pending = try self.jobURL()
        guard !FileManager.default.fileExists(atPath: pending.path) else { throw SplotchLibraryError.cancelled }
        completion(nil)
      } catch { completion(error) }
    }
  }

  private func cancelCurrent() {
    job = nil
    pack = nil
    if let url = try? jobURL() { try? FileManager.default.removeItem(at: url) }
    settle(.failure(SplotchLibraryError.cancelled))
    for session in [wifiSession, meteredSession] {
      session.getAllTasks { tasks in
        self.queue.async {
          for task in tasks where !(self.job.map { task.taskDescription?.hasPrefix($0.token + ":") == true } ?? false) { task.cancel() }
        }
      }
    }
  }

  private func persist() throws {
    guard let job else { return }
    let url = try jobURL()
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(job).write(to: url, options: .atomic)
  }

  private func startNextFile() {
    guard var job, let pack else { return }
    do {
      let staging = try SplotchLibraryFiles.stage(pack)
      let current = try SplotchLibraryFiles.root().appendingPathComponent(SplotchLibraryFiles.directory(pack))
      while job.nextFileIndex < pack.files.count {
        let file = pack.files[job.nextFileIndex]
        let target = SplotchLibraryFiles.destination(file, in: staging)
        if !(try SplotchLibraryFiles.matches(target, file: file)) {
          let previous = SplotchLibraryFiles.destination(file, in: current)
          if try SplotchLibraryFiles.matches(previous, file: file) {
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            try FileManager.default.copyItem(at: previous, to: target)
          } else { break }
        }
        job.nextFileIndex += 1
      }
      self.job = job
      try persist()
      if job.nextFileIndex == pack.files.count { try finish(); return }
      let file = pack.files[job.nextFileIndex]
      let properties = try FileManager.default.attributesOfFileSystem(forPath: SplotchLibraryFiles.root().path)
      if let free = properties[.systemFreeSize] as? NSNumber, free.int64Value < file.bytes + Self.storageReserveBytes { throw SplotchLibraryError.storageFull }
      guard let url = URL(string: "https://splotch.art" + file.downloadPath) else { throw SplotchLibraryError.invalidPack }
      let task = (job.allowMetered ? meteredSession : wifiSession).downloadTask(with: url)
      task.taskDescription = "\(job.token):\(job.nextFileIndex)"
      task.resume()
    } catch { fail(error) }
  }

  private func currentFile(_ task: URLSessionTask) -> SplotchLibraryFile? {
    guard let job, let pack, job.nextFileIndex < pack.files.count,
          task.taskDescription == "\(job.token):\(job.nextFileIndex)" else { return nil }
    return pack.files[job.nextFileIndex]
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard let file = currentFile(downloadTask), totalBytesWritten > file.bytes else { return }
    downloadTask.cancel()
    fail(SplotchLibraryError.verificationFailed)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard var job, let pack, let file = currentFile(downloadTask) else { return }
    do {
      guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200,
            downloadTask.response?.url?.absoluteString == "https://splotch.art" + file.downloadPath,
            try SplotchLibraryFiles.matches(location, file: file) else { throw SplotchLibraryError.verificationFailed }
      let target = SplotchLibraryFiles.destination(file, in: try SplotchLibraryFiles.stage(pack))
      try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
      try FileManager.default.moveItem(at: location, to: target)
      job.nextFileIndex += 1
      self.job = job
      try persist()
      startNextFile()
    } catch { fail(error) }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error, currentFile(task) != nil { fail(error) }
  }

  private func finish() throws {
    guard let job, let pack else { return }
    let staging = try SplotchLibraryFiles.stage(pack)
    for file in pack.files {
      if !(try SplotchLibraryFiles.matches(SplotchLibraryFiles.destination(file, in: staging), file: file)) { throw SplotchLibraryError.verificationFailed }
    }
    try Data(job.identity.utf8).write(to: staging.appendingPathComponent("identity.json"), options: .atomic)
    try Data(job.marker.utf8).write(to: staging.appendingPathComponent("installed.json"), options: .atomic)
    let directory = try SplotchLibraryFiles.root().appendingPathComponent(SplotchLibraryFiles.directory(pack))
    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    try FileManager.default.moveItem(at: staging, to: directory)
    try FileManager.default.removeItem(at: jobURL())
    self.job = nil
    self.pack = nil
    settle(.success(()))
  }

  private func fail(_ error: Error) {
    job = nil
    pack = nil
    settle(.failure(error))
  }
  private func settle(_ result: Result<Void, Error>) {
    let waiting = completions
    completions.removeAll()
    waiting.forEach { $0(result) }
  }

  func acceptBackgroundEvents(identifier: String, completion: @escaping () -> Void) {
    queue.async {
      self.backgroundCompletions[identifier] = completion
      _ = identifier == self.sessionIdentifier(true) ? self.meteredSession : self.wifiSession
    }
  }
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    guard let identifier = session.configuration.identifier,
          let completion = backgroundCompletions.removeValue(forKey: identifier) else { return }
    DispatchQueue.main.async(execute: completion)
  }
}
