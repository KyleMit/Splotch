import java.lang.reflect.Method;

public final class QaPermissionFlags {
  private static final String PACKAGE = "art.splotch.migration.probe";
  private static final String[] PERMISSIONS = {
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_EXTERNAL_STORAGE"
  };
  private static final int USER_FLAGS_MASK = 3;
  private static final int USER = 0;

  public static void main(String[] args) throws Exception {
    int sdk = Class.forName("android.os.Build$VERSION").getField("SDK_INT").getInt(null);
    if (sdk != 28) throw new IllegalStateException("API 28 only");
    Method owner = Class.forName("android.app.ActivityThread").getDeclaredMethod("getPackageManager");
    owner.setAccessible(true);
    Object manager = owner.invoke(null);
    Method read = manager.getClass().getDeclaredMethod("getPermissionFlags", String.class, String.class, int.class);
    Method update = manager.getClass().getDeclaredMethod("updatePermissionFlags", String.class, String.class, int.class, int.class, int.class);
    Method check = manager.getClass().getDeclaredMethod("checkPermission", String.class, String.class, int.class);
    read.setAccessible(true);
    update.setAccessible(true);
    check.setAccessible(true);
    boolean clear = args.length == 1 && args[0].equals("clear-user");
    for (String permission : PERMISSIONS) {
      int before = (Integer) read.invoke(manager, permission, PACKAGE, USER);
      if (clear) {
        if ((Integer) check.invoke(manager, permission, PACKAGE, USER) != -1) {
          throw new IllegalStateException("Permission must already be revoked");
        }
        update.invoke(manager, permission, PACKAGE, USER_FLAGS_MASK, 0, USER);
      }
      int after = (Integer) read.invoke(manager, permission, PACKAGE, USER);
      int granted = (Integer) check.invoke(manager, permission, PACKAGE, USER);
      System.out.println("{\"sdk\":" + sdk + ",\"permission\":\"" + permission + "\",\"beforeFlags\":" + before + ",\"afterFlags\":" + after + ",\"permissionCheck\":" + granted + ",\"clearedUserFlags\":" + clear + "}");
      if (clear && (after != (before & ~USER_FLAGS_MASK) || granted != -1)) {
        throw new IllegalStateException("Permission restoration mismatch");
      }
    }
  }
}
