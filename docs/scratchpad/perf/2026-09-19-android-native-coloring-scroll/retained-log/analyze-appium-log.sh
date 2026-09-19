#!/bin/sh
# Re-derives the coloring-android-r1 retained-log findings. Input: the raw Appium log
# (LOCAL ONLY: it contains the device serial). Usage: ./analyze-appium-log.sh ~/.splotch-rig/appium-4725.log
set -e
F=$(mktemp); sed -E 's/\x1b\[[0-9;]*m//g' "$1" > "$F"
echo '## dialog swipe outcome per session (gesture 540,1667 -> 540,772)'
awk '/Session created with session id/ {sess++}
/--> POST/ && /"x":540,"y":1667/ {sw=1; nulls=0; line=NR; next}
sw && /status 200: \{"value":null\}/ {nulls++}
sw && /status 200: \{"value":[0-9.]+\}/ {res="SCROLLED"}
sw && res=="SCROLLED" && /status 200: \{"value":\{"actionAt"/ { match($0, /"armedEvents":\[[^]]*\]/); print "S" sess " L" line " SCROLLED nullPolls=" nulls " " substr($0,RSTART,260); sw=0; res=""; next }
sw && /DELETE \/session/ {print "S" sess " L" line " TIMEOUT nullPolls=" nulls; sw=0}' "$F"
echo '## open-coloring-book record per sweep: first-tile tap, scroll-cue mutation, dialog mutation'
awk '/Session created with session id/ {sess++}
/begin\(\\"open coloring book\\"/ {armed=1; next}
armed && /status 200: \{"value":\{"actionAt"/ { cue=($0 ~ /scroll-cue/)?"cue:YES":"cue:no"; dlg=($0 ~ /"targets":\[[^]]*dialog#coloring-book-dialog/)?"dialog-mutated:YES":"dialog-mutated:no";
 match($0, /"type":"pointerup","x":[0-9.]+,"y":[0-9.]+/); print "S" sess " tap " substr($0,RSTART+18,RLENGTH-18) " " cue " " dlg; armed=0 }' "$F"
rm -f "$F"
F=$(mktemp); sed -E 's/\x1b\[[0-9;]*m//g' "$1" > "$F"
echo '## per dialog swipe: full gesture, WebView rect, dialog CSS geometry, driver response'
awk '/Session created with session id/ {sess++}
/status 200: \{"sessionId".*"value":\{"height":[0-9]+,"width":[0-9]+,"x":[0-9]+,"y":[0-9]+\}\}/ { match($0, /"value":\{[^}]*\}/); rect=substr($0,RSTART+8,RLENGTH-8) }
/status 200: \{"value":\{"canvas":/ { match($0, /"canvas":\{[^}]*\}/); canvas=substr($0,RSTART+9,RLENGTH-9); match($0, /"viewport":\{[^}]*\}/); vp=substr($0,RSTART+11,RLENGTH-11) }
/--> POST/ && /\/actions / && /"x":540,"y":1667/ { match($0, /"actions":\[\{"type":"pointerMove".*\]\}\]\}/); g=substr($0,RSTART,RLENGTH); gsub(/"type":|"origin":"viewport",|"button":0|[{}"\[\]]/,"",g); pend=1; next }
pend && /<-- POST .*\/actions / { n=split($0,a," "); print "S" sess " gesture=" g " webview=" rect " dialog=" canvas " viewport=" vp " response=" a[n-4]; pend=0 }' "$F"
rm -f "$F"
