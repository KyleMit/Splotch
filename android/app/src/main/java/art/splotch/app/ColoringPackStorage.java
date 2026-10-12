package art.splotch.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Installed coloring books live under {@code noBackupFilesDir/coloring/<resolution>/<bookId>}. The
 * namespace is deliberately not scoped by app version: an app update whose pack files did not
 * change must keep every book. A book's {@code .installed} marker holds the manifest's marker value
 * for that book, which lists every file's path, byte length, and SHA-256, so a marker is trusted
 * only while it equals the current manifest's value (ADR-0103).
 */
final class ColoringPackStorage {
    static final String JOBS_DIRECTORY = "jobs";
    private static final String MARKER_NAME = ".installed";
    private static final String PARTIAL_SUFFIX = ".part";
    private static final int HASH_BUFFER_BYTES = 64 * 1024;

    // The scan and the download worker both write book files and markers, and the worker keeps
    // running after the WebView that started it is gone, so every step that reads a marker to act
    // on it or changes a book's files holds this lock. Network transfer stays outside it.
    static final Object LOCK = new Object();

    private ColoringPackStorage() {}

    static File root(Context context) {
        return new File(context.getNoBackupFilesDir(), "coloring");
    }

    static File jobsDirectory(Context context) {
        return new File(root(context), JOBS_DIRECTORY);
    }

    static File bookDirectory(Context context, String resolution, String bookId) {
        return new File(new File(root(context), resolution), bookId);
    }

    static String validBookId(String bookId) {
        if (bookId == null || !bookId.matches("[a-z0-9-]+")) {
            throw new IllegalArgumentException("Invalid book id");
        }
        return bookId;
    }

    static File markerFile(File bookDirectory) {
        return new File(bookDirectory, MARKER_NAME);
    }

    static boolean markerMatches(File bookDirectory, String marker) {
        File file = markerFile(bookDirectory);
        try {
            return file.isFile() && readText(file).equals(marker);
        } catch (Exception error) {
            return false;
        }
    }

    // Every write or delete of a book's file withdraws the marker first, so an interruption never
    // leaves a marker vouching for bytes that are no longer there.
    static void withdrawMarker(File bookDirectory) {
        deleteFile(markerFile(bookDirectory));
    }

    static File bookFile(File bookDirectory, String path) throws Exception {
        String prefix = "/coloring/" + bookDirectory.getName() + "/";
        if (!path.startsWith(prefix)) throw new IllegalArgumentException("Invalid coloring path");
        File file = new File(bookDirectory, path.substring(prefix.length()));
        if (!file.getCanonicalPath().startsWith(bookDirectory.getCanonicalPath() + File.separator)) {
            throw new IllegalArgumentException("Coloring path escaped its book directory");
        }
        return file;
    }

    static File partialFile(File destination) {
        return new File(destination.getPath() + PARTIAL_SUFFIX);
    }

    static boolean matches(File file, JSONObject entry) throws Exception {
        if (!file.isFile() || file.length() != entry.getLong("bytes")) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[HASH_BUFFER_BYTES];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest()).equals(entry.getString("sha256"));
    }

    // Hashes the whole book rather than trusting each file's publish: a replaced worker from an
    // earlier manifest can publish between this worker's check of a file and its commit.
    static boolean hasEveryMatchingFile(File bookDirectory, JSONArray files) throws Exception {
        for (int index = 0; index < files.length(); index++) {
            JSONObject entry = files.getJSONObject(index);
            if (!matches(bookFile(bookDirectory, entry.getString("path")), entry)) return false;
        }
        return true;
    }

    /**
     * Reconciles storage with the manifest and returns the ids of the books that are installed.
     * Each book keeps the files that still match, adopts matching files from any other directory
     * (an earlier version-scoped layout or the other resolution), and is marked only after every
     * file is verified. Books the manifest no longer lists are deleted, and so is every other
     * directory once it has been drained.
     */
    static List<String> reconcile(Context context, String resolution, JSONArray books)
            throws Exception {
        synchronized (LOCK) {
            File root = root(context);
            File namespace = new File(root, resolution);
            List<File> sources = drainSources(root, resolution);
            Set<String> listedBookIds = new HashSet<>();
            List<String> installed = new ArrayList<>();
            for (int index = 0; index < books.length(); index++) {
                JSONObject book = books.getJSONObject(index);
                String bookId = validBookId(book.getString("id"));
                listedBookIds.add(bookId);
                if (tryReconcileBook(new File(namespace, bookId), sources, book)) installed.add(bookId);
            }
            tryRun(() -> removeUnlistedBooks(namespace, listedBookIds));
            for (File source : sources) tryRun(() -> deleteRecursively(source));
            return installed;
        }
    }

    // A failure on one book (a full disk, say) leaves that book unmarked rather than failing the
    // scan: a scan that threw would hide every installed book, on every launch it kept failing.
    private static boolean tryReconcileBook(File bookDirectory, List<File> sources, JSONObject book) {
        try {
            return reconcileBook(bookDirectory, sources, book);
        } catch (Exception error) {
            return false;
        }
    }

    private static void tryRun(Runnable cleanup) {
        try {
            cleanup.run();
        } catch (RuntimeException ignored) {
            // Retried by the next scan.
        }
    }

    private static boolean reconcileBook(File bookDirectory, List<File> sources, JSONObject book)
            throws Exception {
        String marker = book.getString("marker");
        JSONArray files = book.getJSONArray("files");
        if (markerFile(bookDirectory).isFile()) {
            if (markerMatches(bookDirectory, marker)) {
                removeUnlistedFiles(bookDirectory, listedFiles(bookDirectory, files));
                return true;
            }
            withdrawMarker(bookDirectory);
        }

        boolean complete = true;
        for (int index = 0; index < files.length(); index++) {
            JSONObject entry = files.getJSONObject(index);
            File target = bookFile(bookDirectory, entry.getString("path"));
            if (matches(target, entry)) continue;
            deleteFile(target);
            if (!adopt(sources, bookDirectory.getName(), entry, target)) complete = false;
        }
        removeUnlistedFiles(bookDirectory, listedFiles(bookDirectory, files));
        if (complete) writeTextAtomically(markerFile(bookDirectory), marker);
        return complete;
    }

    private static boolean adopt(List<File> sources, String bookId, JSONObject entry, File target)
            throws Exception {
        for (File source : sources) {
            File candidate = bookFile(new File(source, bookId), entry.getString("path"));
            if (!candidate.isFile()) continue;
            if (!matches(candidate, entry)) {
                deleteFile(candidate);
                continue;
            }
            File parent = target.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return false;
            if (candidate.renameTo(target)) return true;
        }
        return false;
    }

    private static List<File> drainSources(File root, String resolution) {
        List<File> sources = new ArrayList<>();
        File[] children = root.listFiles();
        if (children == null) return sources;
        for (File child : children) {
            if (!child.getName().equals(resolution) && !child.getName().equals(JOBS_DIRECTORY)) {
                sources.add(child);
            }
        }
        return sources;
    }

    private static Set<File> listedFiles(File bookDirectory, JSONArray files) throws Exception {
        Set<File> listed = new HashSet<>();
        listed.add(markerFile(bookDirectory));
        for (int index = 0; index < files.length(); index++) {
            listed.add(bookFile(bookDirectory, files.getJSONObject(index).getString("path")));
        }
        return listed;
    }

    // A `.part` file belongs to a transfer the worker may be streaming right now; the worker
    // removes its own partials.
    private static void removeUnlistedFiles(File directory, Set<File> listed) {
        File[] children = directory.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                removeUnlistedFiles(child, listed);
            } else if (!listed.contains(child) && !child.getName().endsWith(PARTIAL_SUFFIX)) {
                deleteFile(child);
            }
        }
    }

    private static void removeUnlistedBooks(File namespace, Set<String> listedBookIds) {
        File[] children = namespace.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (listedBookIds.contains(child.getName())) continue;
            if (child.isDirectory()) withdrawMarker(child);
            deleteRecursively(child);
        }
    }

    static void removeAll(Context context) {
        synchronized (LOCK) {
            File[] children = root(context).listFiles();
            if (children == null) return;
            for (File child : children) {
                if (child.isDirectory()) {
                    File[] books = child.listFiles();
                    if (books != null) for (File book : books) withdrawMarker(book);
                }
                deleteRecursively(child);
            }
        }
    }

    static String readText(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count == -1) break;
                offset += count;
            }
            return new String(bytes, 0, offset, StandardCharsets.UTF_8);
        }
    }

    static void writeTextAtomically(File file, String text) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create " + parent.getName());
        }
        File temporary = new File(file.getPath() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(text.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        if (!temporary.renameTo(file)) {
            deleteFile(temporary);
            throw new IllegalStateException("Could not write " + file.getName());
        }
    }

    private static void deleteFile(File file) {
        if (file.exists() && !file.delete()) {
            throw new IllegalStateException("Could not remove " + file.getName());
        }
    }

    static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        deleteFile(file);
    }

    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }
}
