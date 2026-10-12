#!/bin/zsh
# Runs the pre-registered order (or the labels given) for the issue 2072 120 Hz confirmation.
#   run-set.sh <out-dir> <label-arm>...   e.g. run-set.sh scored c1-ctl t1-trt ...
set -u
S=<serial>
E=$HOME/.splotch-rig/evidence/android-2072-120hz
DRIVER=<home>/Code/Splotch/.claude/worktrees/android-2072-120hz-trt/docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush/run-session-android.mjs
OUT=$E/$1; shift
mkdir -p $OUT
for la in "$@"; do
  arm=${la##*-}
  case $arm in trt) port=4191;; ctl) port=4192;; *) echo "bad arm $la"; exit 2;; esac
  peak=$(adb -s $S shell settings get system peak_refresh_rate | tr -d '\r')
  min=$(adb -s $S shell settings get system min_refresh_rate | tr -d '\r')
  hz=$(adb -s $S shell dumpsys display | grep -o 'renderFrameRate [0-9.]*' | head -1)
  wake=$(adb -s $S shell dumpsys power | grep -o 'mWakefulness=[A-Za-z]*' | head -1)
  adb -s $S forward tcp:9232 localabstract:chrome_devtools_remote >/dev/null
  tabs=$(curl -s http://127.0.0.1:9232/json/list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).filter(x=>x.type==="page");console.log(t.length+" pages, devEngine="+t.filter(x=>x.url.includes("/dev/engine")).length)})')
  adb -s $S forward --remove tcp:9232
  load=$(sysctl -n vm.loadavg)
  echo "$(date +%H:%M:%S) $la pre: peak=$peak min=$min $hz $wake tabs[$tabs] load$load" | tee -a $OUT/prechecks.log
  HARNESS_URL=http://<lan-ip>:$port/dev/engine OUT_DIR=$OUT ANDROID_SERIAL=$S CDP_PORT=9231 \
    node $DRIVER $la restamp paced '{"undoGapMs":700,"margin":24}' 2>&1 | tail -3 | tee -a $OUT/driver.log
  echo "$(date +%H:%M:%S) $la exit=${pipestatus[1]}" | tee -a $OUT/driver.log
  sleep 5
done
