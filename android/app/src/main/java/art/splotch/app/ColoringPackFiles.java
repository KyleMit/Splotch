package art.splotch.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

final class ColoringPackFiles {
    private static final int BUFFER_BYTES = 64 * 1024;

    private ColoringPackFiles() {}

    static void verifyDirectory(File bookDirectory, String bookId, JSONArray files) throws Exception {
        String bookPrefix = "/coloring/" + bookId + "/";
        for (int index = 0; index < files.length(); index++) {
            JSONObject entry = files.getJSONObject(index);
            String path = entry.getString("path");
            if (!path.startsWith(bookPrefix)) throw new IllegalArgumentException("Invalid coloring path");
            File file = resolvedFile(bookDirectory, path.substring(bookPrefix.length()));
            if (!matches(file, entry.getLong("bytes"), entry.getString("sha256"))) {
                throw new IllegalStateException("Coloring asset verification failed");
            }
        }
    }

    static File resolvedFile(File bookDirectory, String relativePath) throws Exception {
        File file = new File(bookDirectory, relativePath);
        if (!file.getCanonicalPath().startsWith(bookDirectory.getCanonicalPath() + File.separator)) {
            throw new IllegalArgumentException("Coloring path escaped its book directory");
        }
        return file;
    }

    static boolean matches(File file, long expectedBytes, String expectedDigest) throws Exception {
        if (!file.isFile() || file.length() != expectedBytes) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[BUFFER_BYTES];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return digestHex(digest).equals(expectedDigest);
    }

    static String digestHex(MessageDigest digest) {
        byte[] bytes = digest.digest();
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }
}
