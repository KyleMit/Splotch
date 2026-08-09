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
    let files: [ColoringPackFile]
}

fileprivate struct ColoringPackJob: Codable {
    let version: String
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
                if Self.markerURL(version: job.version, bookID: job.book.id).isFileURL,
                   FileManager.default.fileExists(atPath: Self.markerURL(version: job.version, bookID: job.book.id).path) {
                    completion(.success(Self.bookDirectory(version: job.version, bookID: job.book.id)))
                    return
                }
                if let active = self.currentJob,
                   active.version == job.version,
                   active.book.id == job.book.id {
                    self.completion = completion
                    return
                }
                if self.currentJob != nil {
                    completion(.failure(ColoringPackError.downloadInProgress))
                    return
                }
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
                try? FileManager.default.removeItem(at: Self.versionDirectory(job.version))
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

    func remove(version: String, completion: @escaping (Error?) -> Void) {
        queue.async {
            self.cancelAllTasks()
            self.currentJob = nil
            self.completion = nil
            do {
                let directory = Self.versionDirectory(version)
                if FileManager.default.fileExists(atPath: directory.path) {
                    try FileManager.default.removeItem(at: directory)
                }
                if FileManager.default.fileExists(atPath: Self.jobURL.path) {
                    try FileManager.default.removeItem(at: Self.jobURL)
                }
                completion(nil)
            } catch {
                completion(error)
            }
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

    private func startNextFile() {
        guard let job = currentJob else { return }
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
        let prefix = "/coloring/\(job.book.id)/"
        guard file.path.hasPrefix(prefix) else { throw ColoringPackError.invalidPath }
        let relativePath = String(file.path.dropFirst(prefix.count))
        guard !relativePath.contains("..") else { throw ColoringPackError.invalidPath }
        let destination = Self.bookDirectory(version: job.version, bookID: job.book.id)
            .appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let attributes = try FileManager.default.attributesOfItem(atPath: location.path)
        guard (attributes[.size] as? NSNumber)?.int64Value == file.bytes,
              try sha256(location) == file.sha256 else {
            throw ColoringPackError.verificationFailed
        }
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: location, to: destination)
    }

    private func finish(_ job: ColoringPackJob) {
        do {
            let directory = Self.bookDirectory(version: job.version, bookID: job.book.id)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data(job.book.id.utf8).write(to: Self.markerURL(version: job.version, bookID: job.book.id), options: .atomic)
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

    private func sha256(_ url: URL) throws -> String {
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

    static func bookDirectory(version: String, bookID: String) -> URL {
        versionDirectory(version).appendingPathComponent(bookID, isDirectory: true)
    }

    static func markerURL(version: String, bookID: String) -> URL {
        bookDirectory(version: version, bookID: bookID).appendingPathComponent(".installed")
    }

    static func versionDirectory(_ version: String) -> URL {
        rootDirectory.appendingPathComponent(version, isDirectory: true)
    }

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
        rootDirectory.appendingPathComponent("jobs/current.json")
    }
}

private enum ColoringPackError: Error {
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
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        guard let version = safeComponent(call.getString("version")),
              let bookIDs = call.getArray("bookIds", String.self) else {
            call.reject("Invalid coloring-pack status request")
            return
        }
        let coloringRoot = ColoringPackDownloadCoordinator.rootDirectory
        if let directories = try? FileManager.default.contentsOfDirectory(
            at: coloringRoot,
            includingPropertiesForKeys: [.isDirectoryKey]
        ) {
            for directory in directories where directory.lastPathComponent != version && directory.lastPathComponent != "jobs" {
                try? FileManager.default.removeItem(at: directory)
            }
        }
        let installed = bookIDs.compactMap { bookID -> [String: String]? in
            guard safeComponent(bookID) != nil else { return nil }
            let marker = ColoringPackDownloadCoordinator.markerURL(version: version, bookID: bookID)
            guard FileManager.default.fileExists(atPath: marker.path) else { return nil }
            return [
                "id": bookID,
                "rootPath": ColoringPackDownloadCoordinator.bookDirectory(version: version, bookID: bookID).absoluteString
            ]
        }
        call.resolve(["installed": installed])
    }

    @objc func install(_ call: CAPPluginCall) {
        guard let version = safeComponent(call.getString("version")),
              let appVersion = safeComponent(call.getString("appVersion")),
              let baseURL = call.getString("baseUrl"),
              let bookObject = call.getObject("book"),
              let bookData = try? JSONSerialization.data(withJSONObject: bookObject),
              let book = try? JSONDecoder().decode(ColoringPackBook.self, from: bookData),
              safeComponent(book.id) != nil else {
            call.reject("Invalid coloring-pack install request")
            return
        }
        let job = ColoringPackJob(
            version: version,
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
        guard let version = safeComponent(call.getString("version")) else {
            call.reject("Invalid coloring-pack version")
            return
        }
        ColoringPackDownloadCoordinator.shared.remove(version: version) { error in
            if let error {
                call.reject("Downloaded pictures could not be removed", nil, error)
            } else {
                call.resolve()
            }
        }
    }

    private func safeComponent(_ value: String?) -> String? {
        guard let value,
              !value.isEmpty,
              value.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else { return nil }
        return value
    }
}
