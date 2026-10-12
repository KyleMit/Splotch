#!/bin/zsh
# One session per arm with GPU-process memory sampled every 5 s; prints the per-run max.
# ANDROID_SERIAL, LAN_IP, CTL_PORT (main), TRT_PORT (treatment), OUT_DIR. The mem
# lines are copied into memory/ with a header.
cd "$(git rev-parse --show-toplevel)"/docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush
E=${OUT_DIR:?}
mkdir -p $E
GPU=$(adb -s $ANDROID_SERIAL shell pidof com.android.chrome:privileged_process0 | tr -d '\r')
for arm in ${=ORDER:-ctl trt trt ctl}; do
  port=${CTL_PORT:?}; [[ $arm == trt ]] && port=${TRT_PORT:?}
  i=$((i+1)); label=m$i-$arm
  ( while true; do adb -s $ANDROID_SERIAL shell dumpsys meminfo $GPU | tr -d '\r' | awk -v t=$(date +%s) '/TOTAL PSS:/{pss=$3} /GL mtrack:/{gl=$3} /Graphics:/{gr=$2} END{print t, pss, gl, gr}'; sleep 5; done ) > $E/$label.mem &
  sampler=$!
  HARNESS_URL=http://$LAN_IP:$port/dev/engine OUT_DIR=$E ANDROID_SERIAL=$ANDROID_SERIAL node run-session-android.mjs $label restamp paced '{"undoGapMs":700,"margin":24}' 2>&1 | tail -1 | cut -c1-60
  kill $sampler
  awk -v l=$label 'BEGIN{m=0;g=0;r=0} {if($2>m)m=$2; if($3>g)g=$3; if($4>r)r=$4} END{print l, "maxTotalPssKB", m, "maxGlMtrackKB", g, "maxGraphicsKB", r, "samples", NR}' $E/$label.mem
done
echo MEM-DONE
