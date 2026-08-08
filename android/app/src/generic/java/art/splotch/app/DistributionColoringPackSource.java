package art.splotch.app;

import android.content.Context;

import org.json.JSONArray;

import java.io.File;

final class DistributionColoringPackSource implements ColoringPackSource {
    @Override
    public File installed(Context context, String version, String bookId) {
        return null;
    }

    @Override
    public boolean install(
            Context context,
            String version,
            String bookId,
            JSONArray files,
            boolean allowMetered,
            Callback callback) {
        return false;
    }

    @Override
    public void remove(Context context) {}

    @Override
    public void close() {}
}
