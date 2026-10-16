import Foundation

private struct SplotchLibraryJob: Codable {
  let marker: String
  let identity: String
  let allowMetered: Bool
  let token: String
  // Retained for serial-job compatibility; verified files determine scheduled work.
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
  private var verifiedFileIndices = Set<Int>()
  private var taskIdentifiers: [Int: Int] = [:]
  private var reconcilingTasks = false
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
        self.cancelCurrent { _ in }
        self.job = SplotchLibraryJob(marker: marker, identity: identity, allowMetered: allowMetered, token: UUID().uuidString, nextFileIndex: 0)
        self.pack = pack
        self.completions.append(completion)
        try self.persist()
        try SplotchLibraryFiles.pruneSupersededStages(pack)
        self.startTransfers()
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
        self.startTransfers()
      } catch { self.cancelCurrent { _ in } }
    }
  }

  func cancelAll(completion: @escaping (Error?) -> Void) {
    queue.async { self.cancelCurrent(completion: completion) }
  }

  private func clearActiveTransfer() {
    job = nil
    pack = nil
    verifiedFileIndices.removeAll()
    taskIdentifiers.removeAll()
    reconcilingTasks = false
  }

  private func cancelCurrent(completion: @escaping (Error?) -> Void) {
    clearActiveTransfer()
    if let url = try? jobURL() { try? FileManager.default.removeItem(at: url) }
    let cancellationError: Error?
    do {
      let pending = try jobURL()
      guard !FileManager.default.fileExists(atPath: pending.path) else { throw SplotchLibraryError.cancelled }
      cancellationError = nil
    } catch { cancellationError = error }
    settle(.failure(SplotchLibraryError.cancelled))
    cancelStaleTasks { completion(cancellationError) }
  }

  private func cancelStaleTasks(completion: @escaping () -> Void) {
    let pending = DispatchGroup()
    for session in [wifiSession, meteredSession] {
      pending.enter()
      session.getAllTasks { tasks in
        self.queue.async {
          for task in tasks where !(self.job.map { task.taskDescription?.hasPrefix($0.token + ":") == true } ?? false) { task.cancel() }
          pending.leave()
        }
      }
    }
    pending.notify(queue: queue, execute: completion)
  }

  private func persist() throws {
    guard let job else { return }
    let url = try jobURL()
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(job).write(to: url, options: .atomic)
  }

  private func prepareFiles() throws {
    guard job != nil, let pack else { return }
    let staging = try SplotchLibraryFiles.stage(pack)
    let current = try SplotchLibraryFiles.root().appendingPathComponent(SplotchLibraryFiles.directory(pack))
    verifiedFileIndices.removeAll()
    taskIdentifiers.removeAll()
    for (index, file) in pack.files.enumerated() {
      let target = SplotchLibraryFiles.destination(file, in: staging)
      var verified = try SplotchLibraryFiles.matches(target, file: file)
      if !verified {
        let previous = SplotchLibraryFiles.destination(file, in: current)
        if try SplotchLibraryFiles.matches(previous, file: file) {
          try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
          if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
          try FileManager.default.copyItem(at: previous, to: target)
          verified = true
        }
      }
      if verified { verifiedFileIndices.insert(index) }
    }
    try persistVerifiedProgress()
  }

  private func persistVerifiedProgress() throws {
    guard var job, let pack else { return }
    job.nextFileIndex = 0
    while job.nextFileIndex < pack.files.count && verifiedFileIndices.contains(job.nextFileIndex) {
      job.nextFileIndex += 1
    }
    self.job = job
    try persist()
  }

  private func startTransfers() {
    guard let job, let pack else { return }
    do {
      try prepareFiles()
      if verifiedFileIndices.count == pack.files.count { try finish(); return }
      let session = job.allowMetered ? meteredSession : wifiSession
      reconcilingTasks = true
      session.getAllTasks { tasks in
        self.queue.async {
          guard self.job?.token == job.token else { return }
          do {
            try self.enqueueMissingFiles(tasks, session: session)
            self.reconcilingTasks = false
          } catch { self.fail(error) }
        }
      }
    } catch { fail(error) }
  }

  private func enqueueMissingFiles(_ tasks: [URLSessionTask], session: URLSession) throws {
    guard let job, let pack else { return }
    let remainingBytes = pack.files.enumerated().reduce(Int64(0)) { total, item in
      total + (verifiedFileIndices.contains(item.offset) ? 0 : item.element.bytes)
    }
    let properties = try FileManager.default.attributesOfFileSystem(forPath: SplotchLibraryFiles.root().path)
    if let free = properties[.systemFreeSize] as? NSNumber, free.int64Value < remainingBytes + Self.storageReserveBytes { throw SplotchLibraryError.storageFull }
    var retained: [Int: URLSessionTask] = [:]
    for task in tasks {
      guard let index = fileIndex(task), !verifiedFileIndices.contains(index), retained[index] == nil,
            task.state == .running || task.state == .suspended,
            task.originalRequest?.url?.absoluteString == "https://splotch.art" + pack.files[index].downloadPath else {
        task.cancel()
        continue
      }
      retained[index] = task
    }
    for index in pack.files.indices where !verifiedFileIndices.contains(index) {
      let task: URLSessionTask
      if let existing = retained[index] { task = existing }
      else {
        guard let url = URL(string: "https://splotch.art" + pack.files[index].downloadPath) else { throw SplotchLibraryError.invalidPack }
        task = session.downloadTask(with: url)
        task.taskDescription = "\(job.token):\(index)"
      }
      taskIdentifiers[index] = task.taskIdentifier
      if task.state == .suspended { task.resume() }
    }
  }

  private func fileIndex(_ task: URLSessionTask) -> Int? {
    guard let job, let pack, let description = task.taskDescription,
          description.hasPrefix(job.token + ":"),
          let index = Int(description.dropFirst(job.token.count + 1)), pack.files.indices.contains(index),
          description == "\(job.token):\(index)" else { return nil }
    return index
  }

  private func registerReconcilingTask(_ task: URLSessionTask, completed: Bool) {
    guard reconcilingTasks, let pack, let index = fileIndex(task),
          !verifiedFileIndices.contains(index), completed || taskIdentifiers[index] == nil,
          task.originalRequest?.url?.absoluteString == "https://splotch.art" + pack.files[index].downloadPath else { return }
    taskIdentifiers[index] = task.taskIdentifier
  }

  private func currentFile(_ task: URLSessionTask) -> (index: Int, file: SplotchLibraryFile)? {
    guard let pack, let index = fileIndex(task), !verifiedFileIndices.contains(index),
          taskIdentifiers[index] == task.taskIdentifier else { return nil }
    return (index, pack.files[index])
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    registerReconcilingTask(downloadTask, completed: false)
    guard let current = currentFile(downloadTask), totalBytesWritten > current.file.bytes else { return }
    downloadTask.cancel()
    fail(SplotchLibraryError.verificationFailed)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    registerReconcilingTask(downloadTask, completed: true)
    guard let pack, let current = currentFile(downloadTask) else { return }
    let file = current.file
    do {
      guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200,
            downloadTask.response?.url?.absoluteString == "https://splotch.art" + file.downloadPath,
            try SplotchLibraryFiles.matches(location, file: file) else { throw SplotchLibraryError.verificationFailed }
      let target = SplotchLibraryFiles.destination(file, in: try SplotchLibraryFiles.stage(pack))
      try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
      try FileManager.default.moveItem(at: location, to: target)
      verifiedFileIndices.insert(current.index)
      taskIdentifiers.removeValue(forKey: current.index)
      try persistVerifiedProgress()
      if verifiedFileIndices.count == pack.files.count { try finish() }
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
    clearActiveTransfer()
    cancelStaleTasks {}
    settle(.success(()))
  }

  private func fail(_ error: Error) {
    clearActiveTransfer()
    cancelStaleTasks {}
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
