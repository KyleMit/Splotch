import android.content.res.Configuration;
import android.os.LocaleList;
import java.lang.reflect.Method;
public class ConfigLocale {
  public static void main(String[] args) throws Exception {
    Configuration config = new Configuration();
    config.setLocales(LocaleList.forLanguageTags(args[0]));
    Configuration.class.getField("userSetLocale").setBoolean(config, true);
    Object manager = Class.forName("android.app.ActivityManager").getMethod("getService").invoke(null);
    Method update = manager.getClass().getMethod("updatePersistentConfiguration", Configuration.class);
    update.invoke(manager, config);
    System.out.println("Requested system locales: " + config.getLocales().toLanguageTags());
  }
}
