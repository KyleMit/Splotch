import java.lang.reflect.Method;
import android.graphics.Rect;
public class ConfigWindow {
 public static void main(String[] args) throws Exception {
  Object manager=Class.forName("android.app.ActivityTaskManager").getMethod("getService").invoke(null);
  if(args.length==0){for(Method method:manager.getClass().getMethods())if(method.getName().matches(".*(Windowing|resizeTask|Resizeable).*"))System.out.println(method);return;}
  if(args[0].equals("mode"))manager.getClass().getMethod("setTaskWindowingMode",int.class,int.class,boolean.class).invoke(manager,Integer.parseInt(args[1]),Integer.parseInt(args[2]),true);
  if(args[0].equals("remove"))System.out.println(manager.getClass().getMethod("removeTask",int.class).invoke(manager,Integer.parseInt(args[1])));
  if(args[0].equals("resize"))manager.getClass().getMethod("resizeTask",int.class,Rect.class,int.class).invoke(manager,Integer.parseInt(args[1]),new Rect(Integer.parseInt(args[2]),Integer.parseInt(args[3]),Integer.parseInt(args[4]),Integer.parseInt(args[5])),0);
 }
}
