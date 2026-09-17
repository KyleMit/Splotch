import Capacitor
import CryptoKit
import Foundation

fileprivate struct ColoringPackFile: Codable {
    let path: String
    let downloadPath: String
    let bytes: Int64
    let sha256: String
}

fileprivate struct ColoringPackBook: Codable {
    let id: String
    // The manifest's marker value for this book: every file's path, byte length, and SHA-256.
    // A book's marker is trusted only while its contents equal this (ADR-0103).
    let marker: String
    let files: [ColoringPackFile]
}

// A job written before storage was keyed by resolution has no `resolution` or `marker`, so it
// fails to decode and is discarded; the next scan adopts the files it had written.
fileprivate struct ColoringPackJob: Codable {
    let resolution: String
    let appVersion: String
    let baseURL: String
    let book: ColoringPackBook
    let allowMetered: Bool
    var nextFileIndex: Int
}

final class ColoringPackDownloadCoordinator: NSObject, URLSessionDownloadDelegate {
    static let shared = ColoringPackDownloadCoordinator()

    private let queue = DispatchQueue(label: "art.splotch.coloring-packs")
    private lazy var delegateQueue: OperationQueue = {
        let operationQueue = OperationQueue()
        operationQueue.maxConcurrentOperationCount = 1
        operationQueue.underlyingQueue = queue
        return operationQueue
    }()
    private lazy var wifiSession = makeSession(allowMetered: false)
    private lazy var meteredSession = makeSession(allowMetered: true)
    private var currentJob: ColoringPackJob?
    private var completion: ((Result<URL, Error>) -> Void)?
    private var backgroundCompletions: [String: () -> Void] = [:]

    private override init() {
        super.init()
    }

    fileprivate func install(job: ColoringPackJob, completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async {
            do {
                let directory = Self.bookDirectory(resolution: job.resolution, bookID: job.book.id)
                if Self.markerMatches(directory, marker: job.book.marker) {
                    completion(.success(directory))
                    return
                }
                if let active = self.currentJob,
                   active.resolution == job.resolution,
                   active.book.id == job.book.id {
                    self.completion = completion
                    return
                }
                if self.currentJob != nil {
                    completion(.failure(ColoringPackError.downloadInProgress))
                    return
                }
                try Self.withdrawMarker(directory)
                self.currentJob = job
                self.completion = completion
                try self.persist(job)
                self.startNextFile()
            } catch {
                completion(.failure(error))
            }
        }
    }

    func resumePendingDownload() {
        queue.async {
            guard self.currentJob == nil else { return }
            guard FileManager.default.fileExists(atPath: Self.jobURL.path) else { return }
            let job: ColoringPackJob
            do {
                job = try self.loadJob()
            } catch {
                try? FileManager.default.removeItem(at: Self.jobURL)
                self.cancelAllTasks()
                return
            }
            let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            guard job.appVersion == appVersion else {
                try? FileManager.default.removeItem(at: Self.jobURL)
                self.cancelAllTasks()
                return
            }
            self.currentJob = job
            let session = job.allowMetered ? self.meteredSession : self.wifiSession
            session.getAllTasks { tasks in
                self.queue.async {
                    if tasks.isEmpty { self.startNextFile() }
                }
            }
        }
    }

    // Removes every stored book whatever layout or resolution wrote it, and the pending job. The
    // root itself stays: it carries the backup exclusion.
    func remove(completion: @escaping (Error?) -> Void) {
        queue.async {
            self.cancelAllTasks()
            self.currentJob = nil
            self.completion = nil
            do {
                for child in Self.children(of: Self.rootDirectory) {
                    for book in Self.children(of: child) { try Self.withdrawMarker(book) }
                    try FileManager.default.removeItem(at: child)
                }
                completion(nil)
            } catch {
                completion(error)
            }
        }
    }

    // Reconciles storage with the manifest on the download queue, so it never interleaves with a
    // file being published, and reports which books are installed. Each book keeps the files that
    // still match, adopts matching files from any other directory (an earlier version-scoped
    // layout or the other resolution), and is marked only after every file is verified. Books the
    // manifest no longer lists are deleted, and so is every other directory once drained.
    fileprivate func reconcile(
        resolution: String,
        books: [ColoringPackBook],
        completion: @escaping ([String: URL]) -> Void
    ) {
        queue.async {
            let namespace = Self.rootDirectory.appendingPathComponent(resolution, isDirectory: true)
            let sources = Self.children(of: Self.rootDirectory).filter {
                $0.lastPathComponent != resolution && $0.lastPathComponent != Self.jobsDirectoryName
            }
            var installed: [String: URL] = [:]
            for book in books {
                let directory = namespace.appendingPathComponent(book.id, isDirectory: true)
                // A failure on one book (a full disk, say) leaves that book unmarked rather than
                // failing the scan, which would hide every installed book on every launch.
                if (try? self.reconcile(book: book, directory: directory, sources: sources)) == true {
                    installed[book.id] = directory
                }
            }
            let listedBookIDs = Set(books.map(\.id))
            for directory in Self.children(of: namespace) where !listedBookIDs.contains(directory.lastPathComponent) {
                try? Self.withdrawMarker(directory)
                try? FileManager.default.removeItem(at: directory)
            }
            for source in sources {
                try? FileManager.default.removeItem(at: source)
            }
            completion(installed)
        }
    }

    private func reconcile(book: ColoringPackBook, directory: URL, sources: [URL]) throws -> Bool {
        let marker = Self.markerURL(directory)
        if FileManager.default.fileExists(atPath: marker.path) {
            if Self.markerMatches(directory, marker: book.marker) {
                try Self.removeUnlistedFiles(in: directory, book: book)
                return true
            }
            try Self.withdrawMarker(directory)
        }
        var complete = true
        for file in book.files {
            let target = try Self.destination(of: file, in: directory, bookID: book.id)
            if try Self.fileMatches(target, file) { continue }
            if FileManager.default.fileExists(atPath: target.path) {
                try FileManager.default.removeItem(at: target)
            }
            if !(try adopt(file, bookID: book.id, into: target, from: sources)) { complete = false }
        }
        try Self.removeUnlistedFiles(in: directory, book: book)
        if complete {
            try Data(book.marker.utf8).write(to: marker, options: .atomic)
        }
        return complete
    }

    private func adopt(_ file: ColoringPackFile, bookID: String, into target: URL, from sources: [URL]) throws -> Bool {
        for source in sources {
            let sourceBook = source.appendingPathComponent(bookID, isDirectory: true)
            let candidate = try Self.destination(of: file, in: sourceBook, bookID: bookID)
            guard FileManager.default.fileExists(atPath: candidate.path) else { continue }
            guard try Self.fileMatches(candidate, file) else {
                try? FileManager.default.removeItem(at: candidate)
                continue
            }
            try FileManager.default.createDirectory(
                at: target.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.moveItem(at: candidate, to: target)
            return true
        }
        return false
    }

    func cancel(completion: @escaping () -> Void) {
        queue.async {
            self.cancelAllTasks()
            self.currentJob = nil
            let callback = self.completion
            self.completion = nil
            try? FileManager.default.removeItem(at: Self.jobURL)
            callback?(.failure(ColoringPackError.cancelled))
            completion()
        }
    }

    func acceptBackgroundEvents(identifier: String, completion: @escaping () -> Void) {
        queue.async {
            self.backgroundCompletions[identifier] = completion
            if identifier == self.sessionIdentifier(allowMetered: true) {
                _ = self.meteredSession
            } else {
                _ = self.wifiSession
            }
        }
    }

    private func makeSession(allowMetered: Bool) -> URLSession {
        let configuration = URLSessionConfiguration.background(
            withIdentifier: sessionIdentifier(allowMetered: allowMetered)
        )
        configuration.isDiscretionary = true
        configuration.sessionSendsLaunchEvents = true
        configuration.waitsForConnectivity = true
        configuration.allowsExpensiveNetworkAccess = allowMetered
        configuration.allowsConstrainedNetworkAccess = false
        return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    }

    private func cancelAllTasks() {
        wifiSession.getAllTasks { tasks in tasks.forEach { $0.cancel() } }
        meteredSession.getAllTasks { tasks in tasks.forEach { $0.cancel() } }
    }

    private func sessionIdentifier(allowMetered: Bool) -> String {
        "art.splotch.app.coloring-packs.\(allowMetered ? "metered" : "wifi")"
    }

    // An unchanged file is kept, so an app update or an interrupted install transfers only the
    // files the manifest changed or that never arrived.
    private func startNextFile() {
        guard var job = currentJob else { return }
        do {
            let directory = Self.bookDirectory(resolution: job.resolution, bookID: job.book.id)
            let skipped = job.nextFileIndex
            while job.nextFileIndex < job.book.files.count {
                let file = job.book.files[job.nextFileIndex]
                guard try Self.fileMatches(Self.destination(of: file, in: directory, bookID: job.book.id), file) else { break }
                job.nextFileIndex += 1
            }
            if job.nextFileIndex != skipped {
                currentJob = job
                try persist(job)
            }
        } catch {
            fail(error)
            return
        }
        if job.nextFileIndex >= job.book.files.count {
            finish(job)
            return
        }
        let downloadPath = job.book.files[job.nextFileIndex].downloadPath
        guard downloadPath.hasPrefix("/coloring/"), !downloadPath.contains(".."),
              let baseURL = URL(string: job.baseURL),
              let url = URL(string: downloadPath, relativeTo: baseURL) else {
            fail(ColoringPackError.invalidURL)
            return
        }
        let task = (job.allowMetered ? meteredSession : wifiSession).downloadTask(with: url)
        task.taskDescription = String(job.nextFileIndex)
        task.resume()
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard var job = currentJob,
              let description = downloadTask.taskDescription,
              let index = Int(description),
              index == job.nextFileIndex else { return }
        do {
            let file = job.book.files[index]
            try publish(location: location, file: file, job: job)
            job.nextFileIndex += 1
            currentJob = job
            try persist(job)
            startNextFile()
        } catch {
            fail(error)
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error, currentJob != nil { fail(error) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        guard let identifier = session.configuration.identifier,
              let completion = backgroundCompletions.removeValue(forKey: identifier) else { return }
        DispatchQueue.main.async(execute: completion)
    }

    private func publish(location: URL, file: ColoringPackFile, job: ColoringPackJob) throws {
        let destination = try Self.destination(
            of: file,
            in: Self.bookDirectory(resolution: job.resolution, bookID: job.book.id),
            bookID: job.book.id
        )
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
        guard (attributes[.size] as? NSNumber)?.int64Value == file.bytes,
              try Self.sha256(location) == file.sha256 else {
            throw ColoringPackError.verificationFailed
        }
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: location, to: destination)
    }

    private func finish(_ job: ColoringPackJob) {
        do {
            let directory = Self.bookDirectory(resolution: job.resolution, bookID: job.book.id)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // A size check only: each file was hashed as it was published, and a scan deletes only
            // files that fail the manifest.
            for file in job.book.files {
                let destination = try Self.destination(of: file, in: directory, bookID: job.book.id)
                guard Self.fileSize(destination) == file.bytes else { throw ColoringPackError.verificationFailed }
            }
            try Data(job.book.marker.utf8).write(to: Self.markerURL(directory), options: .atomic)
            try? FileManager.default.removeItem(at: Self.jobURL)
            currentJob = nil
            let callback = completion
            completion = nil
            callback?(.success(directory))
        } catch {
            fail(error)
        }
    }

    private func fail(_ error: Error) {
        currentJob = nil
        let callback = completion
        completion = nil
        callback?(.failure(error))
    }

    private func persist(_ job: ColoringPackJob) throws {
        try FileManager.default.createDirectory(
            at: Self.jobURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try JSONEncoder().encode(job).write(to: Self.jobURL, options: .atomic)
    }

    private func loadJob() throws -> ColoringPackJob {
        try JSONDecoder().decode(ColoringPackJob.self, from: Data(contentsOf: Self.jobURL))
    }

    private static func sha256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while true {
            let data = try handle.read(upToCount: 64 * 1024) ?? Data()
            if data.isEmpty { break }
            digest.update(data: data)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func fileSize(_ url: URL) -> Int64? {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              (attributes[.type] as? FileAttributeType) == .typeRegular else { return nil }
        return (attributes[.size] as? NSNumber)?.int64Value
    }

    private static func fileMatches(_ url: URL, _ file: ColoringPackFile) throws -> Bool {
        guard fileSize(url) == file.bytes else { return false }
        return try sha256(url) == file.sha256
    }

    private static func destination(of file: ColoringPackFile, in bookDirectory: URL, bookID: String) throws -> URL {
        let prefix = "/coloring/\(bookID)/"
        guard file.path.hasPrefix(prefix) else { throw ColoringPackError.invalidPath }
        let relativePath = String(file.path.dropFirst(prefix.count))
        guard !relativePath.contains("..") else { throw ColoringPackError.invalidPath }
        return bookDirectory.appendingPathComponent(relativePath)
    }

    private static func removeUnlistedFiles(in directory: URL, book: ColoringPackBook) throws {
        var listed = Set([markerURL(directory).standardizedFileURL.path])
        for file in book.files {
            listed.insert(try destination(of: file, in: directory, bookID: book.id).standardizedFileURL.path)
        }
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey]
        ) else { return }
        let unlisted = enumerator.compactMap { $0 as? URL }.filter {
            (try? $0.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true
                && !listed.contains($0.standardizedFileURL.path)
        }
        for url in unlisted {
            try FileManager.default.removeItem(at: url)
        }
    }

    private static func children(of directory: URL) -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    }

    fileprivate static func markerMatches(_ bookDirectory: URL, marker: String) -> Bool {
        guard let data = try? Data(contentsOf: markerURL(bookDirectory)) else { return false }
        return String(decoding: data, as: UTF8.self) == marker
    }

    // Every write or delete of a book's file withdraws the marker first, so an interruption never
    // leaves a marker vouching for bytes that are no longer there.
    private static func withdrawMarker(_ bookDirectory: URL) throws {
        let marker = markerURL(bookDirectory)
        if FileManager.default.fileExists(atPath: marker.path) {
            try FileManager.default.removeItem(at: marker)
        }
    }

    static func bookDirectory(resolution: String, bookID: String) -> URL {
        rootDirectory
            .appendingPathComponent(resolution, isDirectory: true)
            .appendingPathComponent(bookID, isDirectory: true)
    }

    private static func markerURL(_ bookDirectory: URL) -> URL {
        bookDirectory.appendingPathComponent(".installed")
    }

    static let jobsDirectoryName = "jobs"

    static let rootDirectory: URL = {
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let root = applicationSupport.appendingPathComponent("coloring", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var mutableRoot = root
        try? mutableRoot.setResourceValues(resourceValues)
        return root
    }()

    static var jobURL: URL {
        rootDirectory.appendingPathComponent(jobsDirectoryName, isDirectory: true)
            .appendingPathComponent("current.json")
    }
}

private enum ColoringPackError: Error {
    case cancelled
    case downloadInProgress
    case invalidURL
    case invalidPath
    case verificationFailed
}

@objc(ColoringPacksPlugin)
public class ColoringPacksPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ColoringPacksPlugin"
    public let jsName = "ColoringPacks"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "install", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        guard let resolution = safeResolution(call.getString("resolution")),
              let bookObjects = call.getArray("books"),
              let booksData = try? JSONSerialization.data(withJSONObject: bookObjects),
              let books = try? JSONDecoder().decode([ColoringPackBook].self, from: booksData),
              books.allSatisfy({ safeBookID($0.id) != nil }) else {
            call.reject("Invalid coloring-pack status request")
            return
        }
        ColoringPackDownloadCoordinator.shared.reconcile(resolution: resolution, books: books) { installed in
            call.resolve([
                "installed": books.compactMap { book -> [String: String]? in
                    guard let directory = installed[book.id] else { return nil }
                    return ["id": book.id, "rootPath": directory.absoluteString]
                }
            ])
        }
    }

    @objc func install(_ call: CAPPluginCall) {
        guard let resolution = safeResolution(call.getString("resolution")),
              let appVersion = safeComponent(call.getString("appVersion")),
              let baseURL = call.getString("baseUrl"),
              let bookObject = call.getObject("book"),
              let bookData = try? JSONSerialization.data(withJSONObject: bookObject),
              let book = try? JSONDecoder().decode(ColoringPackBook.self, from: bookData),
              safeBookID(book.id) != nil else {
            call.reject("Invalid coloring-pack install request")
            return
        }
        let job = ColoringPackJob(
            resolution: resolution,
            appVersion: appVersion,
            baseURL: baseURL,
            book: book,
            allowMetered: call.getBool("allowMetered") ?? false,
            nextFileIndex: 0
        )
        ColoringPackDownloadCoordinator.shared.install(job: job) { result in
            switch result {
            case .success(let directory):
                call.resolve(["id": book.id, "rootPath": directory.absoluteString])
            case .failure(let error):
                call.reject("Coloring-pack download did not complete", nil, error)
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        ColoringPackDownloadCoordinator.shared.remove { error in
            if let error {
                call.reject("Downloaded pictures could not be removed", nil, error)
            } else {
                call.resolve()
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        ColoringPackDownloadCoordinator.shared.cancel {
            call.resolve()
        }
    }

    private func safeResolution(_ value: String?) -> String? {
        guard let value,
              value != ColoringPackDownloadCoordinator.jobsDirectoryName,
              value.range(of: "^[a-z]+$", options: .regularExpression) != nil else { return nil }
        return value
    }

    private func safeBookID(_ value: String?) -> String? {
        guard let value, value.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil else { return nil }
        return value
    }

    private func safeComponent(_ value: String?) -> String? {
        guard let value,
              !value.isEmpty,
              value.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else { return nil }
        return value
    }
}
