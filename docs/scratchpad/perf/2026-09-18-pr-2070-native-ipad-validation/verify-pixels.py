# Pixel identity (pixelCheck runs), the bounded magic-brush check, and per-run
# correctness/memory for every scored run. Reads decompressed raw run JSON.
#   python3 verify-pixels.py <runs-root>
import glob, itertools, json, os, sys

root = sys.argv[1]

def load(sub):
    return {os.path.basename(f)[:-5]: json.load(open(f))['result'] for f in sorted(glob.glob(f'{root}/{sub}/*.json'))}

print('## Pixel identity (crayon, pixelCheck runs)')
px = load('pixels')
for k, r in px.items():
    print(f"{k}: entry={r['entry']} tilesBeforeUndo={r['tilesBeforeUndo']} ghostHashesPresent={sum(u['pixels']['ghost'] is not None for u in r['undos'])}/20")
for (ka, a), (kb, b) in itertools.combinations(px.items(), 2):
    g = sum(x['pixels']['ghost'] == y['pixels']['ghost'] for x, y in zip(a['undos'], b['undos']))
    t = sum(x['pixels']['tiles'] == y['pixels']['tiles'] for x, y in zip(a['undos'], b['undos']))
    print(f"{ka} vs {kb}: sameStart={a['tilesBeforeUndo'] == b['tilesBeforeUndo']} ghosts {g}/20 tiles {t}/20")

print('\n## Magic brush (bounded structural check; gradient is Math.random-picked)')
for k, r in load('magic').items():
    print(f"{k}: brush={r['committedBrush']} entry={r['entry']} tilesBeforeUndo={r['tilesBeforeUndo']} "
          f"ghostsSeen={sum(u['ghosts'] > 0 for u in r['undos'])}/{len(r['undos'])} "
          f"depth={r['historyBeforeUndo']['snapshots']}->{r['historyAfterUndo']['historyLength']} "
          f"ink={r['nonTransparentAfterUndo']} ghostElementsAfterTail={r['ghostElementsAfterTail']}")

print('\n## Correctness and memory, every run')
for sub in ['smoke', 'initial', 'confirmation', 'pixels', 'magic']:
    for k, r in load(sub).items():
        hb, ha, w = r['historyBeforeUndo'], r['historyAfterUndo'], r['workAfter']
        print(f"{sub}/{k}: {r['committedBrush']} undos={len(r['undos'])} ghosts={sum(u['ghosts'] > 0 for u in r['undos'])} "
              f"depth={hb['snapshots']}->{ha['historyLength']} rasterBytes={hb['rasterBytes']} baseRasterBytes={ha['baseRasterBytes']} "
              f"liveBackingBytes={w['totalLiveBackingBytes']} leak={r['ghostElementsAfterTail']} ink={r['nonTransparentAfterUndo']} "
              f"vp={r['viewport']['W']}x{r['viewport']['H']}@{r['viewport']['dpr']} {r['viewport']['orientation']}")
