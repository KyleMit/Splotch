# Scores runs-confirm/ against the pre-registered confirmation rules in ACCEPTANCE.md.
import glob, json, sys

GATE = 33.5
BEAT = 17
COMMIT_TOL = 3
d = sys.argv[1] if len(sys.argv) > 1 else 'runs-confirm'
runs = []
for f in sorted(glob.glob(f'{d}/*.json')):
    j = json.load(open(f))
    if '-warm-' in j['label']:
        continue
    runs.append(j)

def intervals(s, a, b):
    return [(s[i - 1], s[i]) for i in range(1, len(s)) if s[i] > a and s[i - 1] < b]

def maxgap(s, a, b):
    return max((y - x for x, y in intervals(s, a, b)), default=0)

def q(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, max(0, int(len(v) * p + 0.9999) - 1))]

rows = []
for j in runs:
    r = j['result']
    s, p, u, m = r['stamps'], r['phases'], r['undos'], r['measures']
    first = u[0]['at']
    commits = [x[2] for x in m if x[0] == 'engine.commit']
    folds = [x[2] for x in m if x[0] == 'engine.fold']
    # non-overlapping undo windows: an interval belongs to the undo whose call precedes its START
    calls = [x['at'] for x in u] + [p['undoEnd']]
    per = []
    for k, x in enumerate(u):
        a, b = calls[k], calls[k + 1]
        own = intervals(s, a, b)
        # drop the interval that contains the next call (it belongs to the next undo)
        own = [iv for iv in own if not (iv[0] < b < iv[1])] or own[:1]
        call_iv = next((iv for iv in own if iv[0] <= a < iv[1]), own[0])
        per.append({
            'worst': max(y - x0 for x0, y in own),
            'call': call_iv[1] - call_iv[0],
            'post': max((y - x0 for x0, y in own if x0 >= a), default=0),
            'engine': x['engineMs'],
            'next': x['nextFrameMs'],
        })
    rows.append({
        'label': j['label'], 'arm': j['arm'], 'entry': r['entry'], 'digest': j.get('appDigest'),
        'draw': maxgap(s, 0, p['drawEnd']),
        'settle': max((y - x for x, y in intervals(s, p['presented'], first) if y <= first), default=0),
        'tail': maxgap(s, p['undoEnd'], p['end']),
        'commitMax': max(commits), 'commitP95': q(commits, .95), 'foldTotal': round(sum(folds), 1),
        'undoOver': sum(z['worst'] > GATE for z in per), 'undoWorst': max(z['worst'] for z in per),
        'callP50': q([z['call'] for z in per], .5), 'postP95': q([z['post'] for z in per], .95),
        'engP95': q([z['engine'] for z in per], .95), 'engMax': max(z['engine'] for z in per),
        'nextP95': q([z['next'] for z in per], .95), 'nextMax': max(z['next'] for z in per),
        'undos': len(u), 'ghosts': sum(z['ghosts'] > 0 for z in u),
        'depth': (r['historyBeforeUndo']['snapshots'], r['historyAfterUndo']['historyLength']),
        'mem': (r['historyBeforeUndo']['rasterBytes'], r['historyAfterUndo']['baseRasterBytes'], r['workAfter']['totalLiveBackingBytes']),
        'leak': r['ghostElementsAfterTail'], 'ink': r['nonTransparentAfterUndo'],
    })

for x in rows:
    print({k: (round(v, 1) if isinstance(v, float) else v) for k, v in x.items()})

C = [x for x in rows if x['arm'] == 'control']
T = [x for x in rows if x['arm'] == 'treatment']
print('\nscored runs: control', len(C), 'treatment', len(T))
print('criterion 4 (exception = >control max + tol in >=2 treatment runs):')
for key, tol in [('draw', BEAT), ('settle', BEAT), ('tail', BEAT), ('commitMax', COMMIT_TOL), ('commitP95', COMMIT_TOL)]:
    lim = max(x[key] for x in C) + tol
    hits = [round(x[key], 1) for x in T if x[key] > lim]
    print(f'  {key}: control max {round(max(x[key] for x in C),1)} limit {round(lim,1)} treatment {[round(x[key],1) for x in T]} -> {"EXCEPTION" if len(hits) >= 2 else "ok"}')
print('fold totals: control', [x['foldTotal'] for x in C], 'treatment', [x['foldTotal'] for x in T])
print('criterion 2: over-gate per run control', [x['undoOver'] for x in C], 'treatment', [x['undoOver'] for x in T],
      '| worst control', max(x['undoWorst'] for x in C), 'treatment', max(x['undoWorst'] for x in T))
print('criterion 3 (treatment): engine P95 max', max(x['engP95'] for x in T), 'next P95 max', max(x['nextP95'] for x in T), 'next max', max(x['nextMax'] for x in T))
print('   (control):             engine P95 max', max(x['engP95'] for x in C), 'next P95 max', max(x['nextP95'] for x in C), 'next max', max(x['nextMax'] for x in C))
print('call-frame p50 per run control', [round(x['callP50']) for x in C], 'treatment', [round(x['callP50']) for x in T])
print('post-action frame p95 per run control', [round(x['postP95']) for x in C], 'treatment', [round(x['postP95']) for x in T])
print('criterion 1/5:', sorted({(x['arm'], x['undos'], x['ghosts'], x['depth'], x['mem'], x['leak'], x['ink'], x['entry']) for x in rows}))
