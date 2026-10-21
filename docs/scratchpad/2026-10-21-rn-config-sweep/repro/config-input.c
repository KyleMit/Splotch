#include <linux/uinput.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/ioctl.h>
static void event(int fd,int type,int code,int value){struct input_event e={0};e.type=type;e.code=code;e.value=value;if(write(fd,&e,sizeof(e))!=sizeof(e)){perror("event");exit(2);}}
static void sync_events(int fd){event(fd,EV_SYN,SYN_REPORT,0);}
int main(int argc,char **argv){
 if(argc<3)return 2;
 int keyboard=strcmp(argv[1],"keyboard")==0;
 int fd=open("/dev/uinput",O_WRONLY|O_NONBLOCK);if(fd<0){perror("open uinput");return 2;}
 struct uinput_user_dev device={0};snprintf(device.name,sizeof(device.name),"Config Sweep %s",keyboard?"Keyboard":"Touchscreen");device.id.bustype=BUS_USB;device.id.vendor=0x18d1;device.id.product=0x4f03;device.id.version=1;
 ioctl(fd,UI_SET_EVBIT,EV_KEY);
 FILE *file=NULL;int width=0,height=0;
 if(keyboard){for(int key=1;key<256;key++)ioctl(fd,UI_SET_KEYBIT,key);}
 else{
  file=fopen(argv[2],"r");if(!file||fscanf(file,"%d %d",&width,&height)!=2)return 2;
  ioctl(fd,UI_SET_KEYBIT,BTN_TOUCH);ioctl(fd,UI_SET_KEYBIT,BTN_TOOL_FINGER);ioctl(fd,UI_SET_EVBIT,EV_ABS);ioctl(fd,UI_SET_PROPBIT,INPUT_PROP_DIRECT);
  int axes[]={ABS_MT_SLOT,ABS_MT_TRACKING_ID,ABS_MT_POSITION_X,ABS_MT_POSITION_Y,ABS_MT_TOUCH_MAJOR,ABS_MT_TOOL_TYPE};
  for(int i=0;i<6;i++)ioctl(fd,UI_SET_ABSBIT,axes[i]);
  device.absmax[ABS_MT_SLOT]=9;device.absmax[ABS_MT_TRACKING_ID]=65535;device.absmax[ABS_MT_POSITION_X]=width-1;device.absmax[ABS_MT_POSITION_Y]=height-1;device.absmax[ABS_MT_TOUCH_MAJOR]=255;device.absmax[ABS_MT_TOOL_TYPE]=2;
 }
 if(write(fd,&device,sizeof(device))!=sizeof(device)||ioctl(fd,UI_DEV_CREATE)<0){perror("create uinput");return 2;}
 puts("virtual device registered");fflush(stdout);usleep(1500000);
 if(keyboard)sleep(atoi(argv[2]));
 else{int x1,y1,x2,y2,tid=20;while(fscanf(file,"%d %d %d %d",&x1,&y1,&x2,&y2)==4){
  event(fd,EV_ABS,ABS_MT_SLOT,0);event(fd,EV_ABS,ABS_MT_TRACKING_ID,tid++);event(fd,EV_ABS,ABS_MT_TOOL_TYPE,0);event(fd,EV_ABS,ABS_MT_POSITION_X,x1);event(fd,EV_ABS,ABS_MT_POSITION_Y,y1);event(fd,EV_ABS,ABS_MT_TOUCH_MAJOR,10);event(fd,EV_KEY,BTN_TOUCH,1);event(fd,EV_KEY,BTN_TOOL_FINGER,1);sync_events(fd);
  for(int step=1;step<=30;step++){usleep(16000);event(fd,EV_ABS,ABS_MT_SLOT,0);event(fd,EV_ABS,ABS_MT_POSITION_X,x1+(x2-x1)*step/30);event(fd,EV_ABS,ABS_MT_POSITION_Y,y1+(y2-y1)*step/30);sync_events(fd);}
  usleep(30000);event(fd,EV_ABS,ABS_MT_TRACKING_ID,-1);event(fd,EV_KEY,BTN_TOUCH,0);event(fd,EV_KEY,BTN_TOOL_FINGER,0);sync_events(fd);usleep(150000);
 }fclose(file);usleep(500000);}
 ioctl(fd,UI_DEV_DESTROY);close(fd);return 0;
}
