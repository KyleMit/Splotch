"""Build protocol-mapping.csv from requirements.csv and the execution plan's decisions.

Usage, from the repository root:
  python3 -I docs/scratchpad/2026-10-18-device-parity/build-protocol-mapping.py [--check]

--check exits 1 when the committed CSV differs from what this script builds.
"""
import csv
import io
import json
import os
import re
import subprocess
import sys
from collections import Counter, OrderedDict

LEDGER = os.path.dirname(os.path.abspath(__file__))
REPO = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=LEDGER, capture_output=True, text=True, check=True).stdout.strip()
TESTFILES = [
    path for path in subprocess.run(['git', 'ls-files'], cwd=REPO, capture_output=True, text=True, check=True).stdout.splitlines()
    if re.search(r'\.test\.(mjs|ts|tsx|js)$', path) and path.startswith(('tools/', 'experiments/native-architecture/', 'web/src/'))
]

SIM = ['iphone-notch', 'ipad-mini', 'ipad-13']
EMU = ['android-api34', 'android-api36', 'android-api36-tablet']
WEB = ['rn-web-chromium']
ROUTINE = SIM + EMU + WEB
IPAD_SIM = ['ipad-mini', 'ipad-13']
PHYS = ['physical-ipad', 'physical-galaxy']

PROTOCOLS = OrderedDict([
    # id: (family, title, targets, arms)
    ('DS-1', ('A drawing screen', 'Drawing-screen chrome visual matrix', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('DS-2', ('A drawing screen', 'Drawing-screen chrome interaction and motion', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('DS-3', ('A drawing screen', 'Ink, brushes, Undo and Clear output', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('PHY-1', ('A drawing screen', 'Physical drawing sanity and input fidelity', PHYS, 'rn|ref160')),
    ('OV-1', ('B overlays', 'Overlay visual matrix', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('OV-2', ('B overlays', 'Settings, Parent Center and gate behavior', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('A11Y-1', ('C accessibility', 'OS text size, Button Size and Reduce Motion', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('A11Y-2', ('C accessibility', 'Accessibility tree: names, roles, states, targets, focus', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('KEY-1', ('C accessibility', 'Hardware-keyboard input', IPAD_SIM + ['android-api36-tablet'] + WEB, 'native rn|ref160; web rn-web|web-prod')),
    ('PHY-6', ('C accessibility', 'Assistive speech (VoiceOver, TalkBack)', PHYS, 'rn|ref160')),
    ('SAVE-1', ('D save and clear', 'Save Picture, polaroid, failure banner and Auto-Save on Delete', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('SAVE-2', ('D save and clear', 'Older-Android storage', ['android-api24', 'android-api26', 'android-api29'], 'rn|ref160')),
    ('PHY-3', ('D save and clear', 'Photos permission round trip', ['physical-ipad'], 'rn|ref160')),
    ('COL-1', ('E coloring books', 'Coloring library, downloads and network policy', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('LIFE-1', ('F lifecycle', 'Restart, cold launch, Back, orientation and recovery', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('PHY-4', ('F lifecycle', 'Background, resume, idle and system navigation', PHYS, 'rn|ref160')),
    ('AI-1', ('G AI Art', 'AI flow through deterministic fixtures', ROUTINE, 'native rn|ref160; web rn-web|web-prod')),
    ('AI-2', ('G AI Art', 'Live generation and picture report (human session)', ['ipad-mini', 'android-api36', 'rn-web-chromium'], 'rn')),
    ('PHY-2', ('H physical media', 'Audio and haptics', PHYS, 'rn|ref160')),
    ('PHY-5', ('H physical media', 'Performance, refresh and thermal', PHYS, 'rn|ref160')),
    ('INFO-1', ('I pages and web', 'Information pages', SIM + EMU, 'rn|ref160')),
    ('WEB-1', ('I pages and web', 'RN web platform behavior', ['rn-web-chromium', 'rn-web-firefox', 'rn-web-edge', 'rn-web-safari'], 'rn-web|web-prod')),
    ('AC-1', ('J automated', 'Two-sided automated contract confirmation', ['ci-exact-head'], 'contract')),
])

ANDROID_TARGETS = {'android-api34', 'android-api36', 'android-api36-tablet', 'android-api24', 'android-api26', 'android-api29', 'physical-galaxy'}
IOS_TARGETS = {'iphone-notch', 'ipad-mini', 'ipad-13', 'physical-ipad'}
WEB_TARGETS = {'rn-web-chromium', 'rn-web-firefox', 'rn-web-edge', 'rn-web-safari'}

SETTLED = {
    'data-loss': 'settled: accepted cutover data loss (no import or migration of shipping storage)',
    'palette-trim': 'settled: bottom-inset landscape palette trim',
    'retint': 'settled: X46 theme retint of drawn Black ink (ADR-0178)',
    'restoration': 'settled: drawing restoration removed (picture lives in memory, as shipping)',
    'caps': 'settled: stroke and point caps removed (no per-picture limit, as shipping)',
    'damaged-reset': 'settled: gated damaged-settings reset',
}

OUT = {
    'hosted': 'out of scope: retained SvelteKit hosted route or page document (admin, beta enrollment, design styleguide, informational page shell, share cards), not RN product UI; see docs/migration/WEB-CONTRACT.md "Retained hosted boundaries"',
    'server': 'out of scope: hosted API server behavior; RN does not change the server, whose wire contracts web/src tests own',
    'harness': 'out of scope: shipping test-harness or instrumentation seam with no user-visible behavior',
    'internal': 'out of scope: shipping implementation module RN replaces; its user-visible behavior is mapped through the behavior rows',
    'bundle': 'out of scope: shipping SvelteKit bundle structure; RN web startup is governed by ADR-0179',
    'scribble-native': 'out of scope on native: WebView-only iPadOS Scribble guard (RN native has no WebView); RN-web Safari residue is L0028 under PHY-1',
}

PHYSICAL = {'PHY-1', 'PHY-2', 'PHY-3', 'PHY-4', 'PHY-5', 'PHY-6'}

def test_index():
    idx = {}
    for path in TESTFILES:
        base = path.rsplit('/', 1)[-1]
        stem = re.sub(r'\.test\.(mjs|ts|tsx|js)$', '', base)
        idx.setdefault(stem, []).append(path)
    return idx

TESTS = test_index()
RN_ONLY = re.compile(r"RN[- ]only|RN-side only|does not read shipping|asserts the opposite|asserts RN|pins the opposite|asserts .*opposite|RN only|\(RN\)|\(legacy|legacy screen|RN behaviour", re.I)

def resolve_tests(text):
    found = []
    if not text:
        return found
    for tok in re.findall(r"[A-Za-z0-9_.*/-]+", text):
        tok = re.sub(r'^(mig/|tests/|tools/migration/tests/|tools/tests/)', '', tok)
        tok = re.sub(r'\.test\.(mjs|ts|tsx|js)$', '', tok)
        tok = tok.split(':')[0]
        for stem in (tok, tok.replace('/', '-')):
            if stem in TESTS:
                for p in TESTS[stem]:
                    if p not in found:
                        found.append(p)
                break
    return found

A = {
    'T1-1': ['DS-1'], 'T1-2': ['DS-1'], 'T1-3': ['DS-1', 'DS-2'], 'T1-4': ['DS-1'],
    'T1-5': ['DS-1'], 'T1-6': ['DS-1', 'DS-3'], 'T1-7': ['OV-1'], 'T1-8': ['OV-1'],
    'T1-9': ['OV-1', 'COL-1'], 'T1-10': ['OV-1'], 'T1-11': ['OV-1', 'OV-2', 'AC-1'],
    'T1-12': ['AI-1', 'AI-2'], 'T1-13': ['DS-2'], 'T1-14': ['SAVE-1', 'PHY-3'],
    'T2-1': ['OV-1'], 'T2-2': ['OV-1'], 'T2-3': ['OV-1'], 'T2-4': ['OV-1'], 'T2-5': ['OV-1'],
    'T2-6': ['OV-1'], 'T2-7': ['OV-1', 'AI-2'], 'T2-8': ['OV-1'], 'T2-9': ['OV-1'], 'T2-10': ['OV-1'],
    'T2-11': ['OV-1', 'OV-2'], 'T2-12': ['AI-1'], 'T2-13': ['AI-1'], 'T2-14': ['AI-1'],
    'T2-15': ['AI-1', 'AI-2'], 'T2-16': ['LIFE-1'], 'T2-17': ['A11Y-1'], 'T2-18': ['A11Y-1'],
    'T2-19': ['A11Y-1'], 'T2-20': ['A11Y-1'], 'T2-21': ['A11Y-1'], 'T2-22': ['A11Y-1'],
    'T2-23': ['PHY-6'], 'T2-24': ['PHY-6'], 'T2-25': ['WEB-1'], 'T2-26': ['WEB-1'],
    'P1': ['LIFE-1'], 'P2': ['PHY-1'], 'P3': ['DS-2'], 'P4': ['DS-3', 'PHY-4'], 'P5': ['DS-3', 'COL-1'],
    'P6': ['PHY-1'], 'P7': ['COL-1', 'PHY-4'], 'P8': ['SAVE-2'], 'P9': ['PHY-3'], 'P10': ['PHY-2'],
    'P11': ['PHY-2'], 'P12': ['AI-1', 'AC-1'], 'P13': ['AI-2'], 'P14': ['OV-2'], 'P15': ['KEY-1'],
    'P16': ['LIFE-1'], 'P17': ['PHY-4'], 'P18': ['PHY-4'], 'P19': ('settled', 'data-loss'),
}
A_TESTS = {
    'T1-11': ['native-parent-gate-card', 'native-parent-center-parity', 'native-parent-center-mash'],
    'P12': ['native-ai-transport', 'native-ai-generation', 'native-ai-durability'],
}
A_NOTES = {
    'T1-14': 'Photos-denied banner visual on simulators via simctl privacy revoke; Android API 34/36 has no save permission to deny; deny-Settings-grant round trip is PHY-3',
    'T2-7': 'saved-key state needs an owner-entered key or access code in the human session (capture suspended during entry)',
    'T2-23': 'VoiceOver speech on the physical iPad; simulators have no VoiceOver',
    'T2-24': 'TalkBack speech on the physical Galaxy',
    'P4': 'style, resize and rotation on simulators; system-bar reveal is an edge gesture (PHY-4)',
    'P7': 'foreground downloads on simulators and emulators; background continuation is physical (#2927 settled the iOS 26.5 simulator limitation)',
    'P10': 'needs a physical iPhone ring/silent switch; none is available',
    'P12': 'offline subcase on Android emulators and RN web; iOS simulators share the host network',
    'P15': 'driver key events on iPad simulators (UIKit hardware-key path) and Android emulator; owner targets policy supersedes the earlier blocked-without-hardware stance',
}
A_BLOCKED = {'P10': 'no physical iPhone with a ring/silent switch'}

X = {
    'X1': ('settled', 'data-loss'), 'X2': ['AI-1'], 'X3': ['AI-1', 'AI-2'], 'X4': ['PHY-1'],
    'X5': ['DS-2', 'SAVE-1'], 'X6': ('settled', 'restoration', ['LIFE-1']), 'X7': ('settled', 'caps', ['DS-3']),
    'X8': ['SAVE-2'], 'X9': ['SAVE-1'], 'X10': ['SAVE-1'], 'X11': ['DS-3'], 'X12': ['DS-3'],
    'X13': ['DS-3'], 'X14': ['AI-1'], 'X15': ['AI-1'], 'X16': ['OV-2'], 'X17': ['OV-2', 'OV-1'],
    'X18': ['COL-1'], 'X19': ['WEB-1', 'COL-1'], 'X20': ['COL-1', 'PHY-4'], 'X21': ['LIFE-1'],
    'X22': ['WEB-1'], 'X23': ['PHY-2'], 'X24': ['PHY-2'], 'X25': ['DS-2'], 'X26': ['DS-1', 'DS-2'],
    'X27': ['DS-2'], 'X28': ['AI-1'], 'X29': ['AI-1', 'PHY-4'], 'X30': ['AI-1'], 'X31': ['AI-1', 'WEB-1'],
    'X32': ['PHY-1'], 'X33': ['OV-2'], 'X34': ['OV-2', 'LIFE-1', 'KEY-1'], 'X35': ['INFO-1'],
    'X36': ['OV-2'], 'X37': ['A11Y-1'], 'X38': ['OV-2', 'KEY-1'], 'X39': ['A11Y-1', 'PHY-1'],
    'X40': ['OV-2', 'AI-1'], 'X41': ['OV-2'], 'X42': ['DS-2'], 'X43': ['SAVE-1'],
    'X44': ('settled', 'palette-trim', ['DS-1']), 'X45': ['DS-1'], 'X46': ('settled', 'retint', ['DS-1']),
    'X47': ['DS-3'], 'X48': ['DS-3', 'PHY-1'], 'X49': ['KEY-1'], 'X50': ['COL-1'], 'X51': ['COL-1', 'WEB-1'],
    'X52': ['COL-1', 'OV-1'], 'X53': ['COL-1'], 'X54': ['LIFE-1'], 'X55': ('settled', 'damaged-reset'),
    'X56': ['PHY-4'], 'X57': ['WEB-1'], 'X58': ['LIFE-1', 'PHY-4'], 'X59': ['A11Y-2'], 'X60': ['PHY-2'],
    'X61': ['WEB-1'], 'X62': ['PHY-5', 'OV-1'], 'X63': ['LIFE-1'], 'X64': ['WEB-1'], 'X65': ['OV-2'],
}
X_NOTES = {
    'X11': 'large-resize re-adopt follows the closed #2924 disposition (settled, not reopened); erase-to-blank lock stays under DS-3',
    'X24': 'needs a physical iPhone ring/silent switch; none is available',
    'X45': 'compare Flat glass panes; the static premixed Flat fade is settled',
    'X58': 'iOS top band coloured from launch is settled; Android first frame and resume re-hide are compared',
    'X64': 'confirm the retained hosted /privacy, /changelog and /feedback routes resolve beside the RN-web drawing route',
    'X15': 'offline on Android emulators and RN web; iOS offline only in a physical window (simulators share the host network)',
    'X51': 'Data Saver on Android emulators, Save-Data on RN web; iOS Low Data Mode only in a physical window',
}
X_BLOCKED = {'X24': 'no physical iPhone with a ring/silent switch'}

B_DEFAULT = {
    ('drawing', 'engine'): ['DS-3'], ('undo, clear and save', 'engine'): ['DS-3'],
    ('palette and colour picker', 'chrome'): ['DS-2'], ('drawer, flyouts and tools', 'chrome'): ['DS-2'],
    ('undo, clear and save', 'chrome'): ['DS-2'], ('accessibility', 'chrome'): ['DS-1'],
    ('settings', 'settings'): ['OV-2'], ('parental gate and Parent Center', 'settings'): ['OV-2'],
    ('AI Art', 'ai'): ['AI-1'], ('coloring picker and pages', 'platform'): ['COL-1'],
    ('undo, clear and save', 'platform'): ['SAVE-1'], ('install, update and offline', 'platform'): ['WEB-1'],
    ('error and recovery (incl. Back)', 'platform'): ['LIFE-1'], ('drawing', 'platform'): ['PHY-4'],
    ('orientation and safe areas', 'platform'): ['LIFE-1'], ('accessibility', 'platform'): ['A11Y-2'],
    ('sounds and haptics', 'platform'): ['PHY-2'],
}
B = {
    'B0003': ['PHY-1'], 'B0004': ['PHY-1'], 'B0005': ['PHY-1'], 'B0006': ['PHY-1'], 'B0007': ['PHY-1'],
    'B0009': ['DS-3', 'WEB-1'], 'B0010': ['PHY-1'], 'B0011': ['PHY-1'], 'B0012': ['PHY-1'], 'B0013': ['PHY-1'],
    'B0014': ['LIFE-1', 'PHY-4'], 'B0016': ['PHY-4'], 'B0017': ['DS-3', 'WEB-1'], 'B0018': ['LIFE-1'],
    'B0020': ['KEY-1'], 'B0021': ['KEY-1'], 'B0022': ['DS-2'], 'B0023': ['DS-2'], 'B0024': ['PHY-1'],
    'B0026': ['PHY-1'], 'B0028': ('settled', 'caps', ['DS-3']), 'B0045': ['DS-2'], 'B0046': ['DS-2'],
    'B0047': ['OV-2'], 'B0048': ['PHY-1', 'PHY-2'], 'B0049': ['LIFE-1', 'DS-2'], 'B0050': ['LIFE-1'],
    'B0051': ['LIFE-1'], 'B0052': ['LIFE-1'], 'B0053': ('settled', 'retint', ['DS-1']), 'B0054': ['PHY-1'],
    'B0055': ['DS-2'], 'B0056': ['DS-2'], 'B0057': ['DS-2'], 'B0058': ['DS-2'], 'B0059': ['DS-2'],
    'B0060': ['SAVE-1'], 'B0061': ['DS-1'], 'B0062': ('out', 'harness'),
    'B0063': ('settled', 'restoration', ['LIFE-1']),
    'B0064': ['DS-2', 'DS-3'], 'B0065': ['DS-1', 'LIFE-1'], 'B0066': ['DS-1', 'DS-3'], 'B0067': ['DS-1'],
    'B0068': ['DS-1'], 'B0072': ['DS-2', 'DS-1'], 'B0073': ['DS-1'], 'B0074': ['DS-2', 'KEY-1'],
    'B0075': ['OV-1'], 'B0076': ['DS-2', 'KEY-1', 'LIFE-1'], 'B0078': ['PHY-1'], 'B0079': ('out', 'scribble-native'),
    'B0080': ['DS-1'], 'B0081': ['DS-2', 'DS-1'], 'B0083': ['DS-1'], 'B0085': ['DS-1', 'LIFE-1'],
    'B0086': ['DS-1'], 'B0087': ['AI-1', 'DS-1'], 'B0090': ['DS-1'], 'B0091': ['DS-2', 'KEY-1'],
    'B0092': ['PHY-1'], 'B0093': ['DS-2', 'DS-1'], 'B0096': ['LIFE-1'], 'B0097': ['DS-2', 'LIFE-1'],
    'B0098': ['DS-1'], 'B0099': ['DS-3', 'KEY-1'], 'B0102': ['DS-2', 'OV-2'], 'B0103': ('settled', 'damaged-reset'),
    'B0104': ['LIFE-1', 'DS-1'], 'B0105': ['A11Y-1'], 'B0106': ['A11Y-1'], 'B0107': ['KEY-1'],
    'B0108': ['DS-1', 'LIFE-1'], 'B0110': ['DS-1'], 'B0111': ['DS-1'], 'B0115': ['PHY-2'],
    'B0116': ['PHY-2', 'DS-2'], 'B0118': ['PHY-1'], 'B0121': ['PHY-1'], 'B0122': ['DS-2', 'SAVE-1'],
    'B0125': ['SAVE-1'], 'B0126': ['SAVE-1', 'DS-1'], 'B0127': ['DS-2'], 'B0128': ['SAVE-1'],
    'B0129': ['SAVE-1'], 'B0130': ['SAVE-1'], 'B0131': ['SAVE-2', 'SAVE-1'], 'B0132': ['SAVE-1'],
    'B0133': ['SAVE-1'], 'B0134': ['DS-1'], 'B0135': ['A11Y-2', 'OV-1'],
    'B0138': ['A11Y-2', 'OV-2'], 'B0139': ['OV-2', 'LIFE-1', 'KEY-1', 'WEB-1'], 'B0140': ['OV-1'],
    'B0141': ['OV-1'], 'B0142': ['OV-1'], 'B0144': ['OV-2', 'AI-1'], 'B0145': ['OV-2', 'A11Y-1'],
    'B0148': ['OV-2', 'OV-1'], 'B0151': ['PHY-5'], 'B0152': ['PHY-5'], 'B0153': ['OV-1'], 'B0154': ['OV-1'],
    'B0155': ['OV-1'], 'B0156': ['OV-1'], 'B0157': ['OV-1'], 'B0158': ['WEB-1'], 'B0159': ['OV-1'],
    'B0160': ['PHY-1'], 'B0161': ['PHY-1'], 'B0162': ['PHY-1'], 'B0163': ['OV-1'], 'B0167': ['A11Y-2'],
    'B0170': ['OV-1'], 'B0172': ['OV-2', 'KEY-1'], 'B0176': ['A11Y-1'], 'B0177': ['A11Y-1'],
    'B0178': ['PHY-1', 'KEY-1'], 'B0180': ['A11Y-1'], 'B0181': ['LIFE-1'], 'B0182': ['OV-2', 'A11Y-2'],
    'B0184': ['WEB-1'], 'B0187': ['OV-1'], 'B0192': ['LIFE-1'], 'B0193': ['OV-1'], 'B0194': ['LIFE-1'],
    'B0196': ['WEB-1'], 'B0197': ['OV-1'], 'B0198': ['WEB-1', 'OV-1'], 'B0199': ['WEB-1'], 'B0200': ['OV-1'],
    'B0201': ['INFO-1'], 'B0202': ['INFO-1'], 'B0206': ['KEY-1'], 'B0211': ['PHY-6', 'OV-2'],
    'B0212': ['OV-1'], 'B0217': ['A11Y-2'], 'B0218': ['A11Y-2'], 'B0222': ['WEB-1'], 'B0226': ['INFO-1'],
    'B0230': ['PHY-4'], 'B0233': ['OV-1'], 'B0237': ['KEY-1'], 'B0238': ['INFO-1'], 'B0245': ['OV-2', 'AC-1'],
    'B0246': ['INFO-1'], 'B0247': ['INFO-1'], 'B0248': ['INFO-1'], 'B0251': ['A11Y-2'],
    'B0262': ['WEB-1', 'AI-1'], 'B0263': ('settled', 'data-loss'), 'B0269': ['LIFE-1', 'AI-1'],
    'B0270': ['AI-1', 'SAVE-1'], 'B0272': ['PHY-1'], 'B0279': ['AI-1', 'AI-2'], 'B0281': ['A11Y-2'],
    'B0285': ['WEB-1', 'COL-1'], 'B0286': ['COL-1', 'WEB-1'], 'B0287': ['PHY-4', 'COL-1'],
    'B0293': ['COL-1', 'OV-1'], 'B0294': ['OV-1'], 'B0295': ['OV-1'],
    'B0297': ['PHY-3'], 'B0299': ['SAVE-2'], 'B0300': ['PHY-3', 'SAVE-2'], 'B0301': ['SAVE-1', 'PHY-6'],
    'B0302': ['SAVE-1', 'PHY-3'], 'B0305': ['WEB-1'], 'B0306': ['WEB-1'], 'B0310': ['OV-1', 'WEB-1'],
    'B0311': ['LIFE-1'], 'B0314': ['AI-1', 'WEB-1'], 'B0315': ['AI-1', 'WEB-1'],
    'B0316': ['LIFE-1', 'WEB-1'], 'B0318': ['WEB-1'], 'B0320': ['WEB-1'], 'B0321': ['WEB-1'],
    'B0326': ['PHY-4'], 'B0327': ['WEB-1'], 'B0328': ['KEY-1'], 'B0329': ['KEY-1'],
    'B0330': ['OV-2', 'WEB-1'], 'B0333': ['LIFE-1'], 'B0334': ['DS-1'], 'B0335': ['PHY-4'], 'B0336': ['DS-1'],
    'B0337': ['PHY-4', 'DS-1'], 'B0338': ['PHY-1'], 'B0340': ['WEB-1'], 'B0346': ['A11Y-1'],
    'B0347': ['A11Y-1'], 'B0348': ['A11Y-1', 'DS-2'], 'B0352': ['PHY-2'], 'B0353': ['PHY-2', 'OV-2'],
    'B0355': ['PHY-1', 'OV-2'],
}
B_NOTES = {
    'B0073': 'iPad landscape with a bottom inset shows one fewer swatch: settled bottom-inset landscape palette trim',
    'B0087': 'offline on Android emulators and RN web; iOS simulators share the host network',
    'B0255': 'offline on Android emulators and RN web; iOS simulators share the host network',
    'B0287': 'iOS 26.5 simulator background publication limitation settled by #2927; physical only',
    'B0297': 'Photos library write and permission prompt are physical-only (owner targets policy)',
    'B0319': 'drawing and Undo checks run; settings-default handling follows the settled gated damaged-settings reset',
    'B0339': 'iOS top band coloured from launch is settled; other first-frame colour compared',
    'B0352': 'needs a physical iPhone ring/silent switch; none is available',
    'B0012': 'RN-web Safari on the physical iPad; requires an Apple Pencil in the operator window',
    'B0010': 'requires an Apple Pencil in the operator window', 'B0011': 'requires an Apple Pencil in the operator window',
    'B0048': 'requires an Apple Pencil in the operator window', 'B0355': 'requires an Apple Pencil in the operator window',
}
B_BLOCKED = {'B0352': 'no physical iPhone with a ring/silent switch'}

L_NOT_NEEDED = {
    'L0009': ['PHY-5'], 'L0010': ['LIFE-1'], 'L0017': ('out', 'harness'), 'L0023': ('out', 'internal'),
    'L0024': ('out', 'internal'), 'L0025': ['DS-2'], 'L0026': ['LIFE-1'], 'L0027': ['PHY-1'], 'L0028': ['PHY-1'],
    'L0029': ('out', 'internal'), 'L0032': ['WEB-1'], 'L0037': ('out', 'internal'), 'L0053': ('out', 'internal'),
    'L0063': ['DS-3'], 'L0064': ('out', 'internal'), 'L0089': ('out', 'internal'), 'L0101': ('out', 'hosted'),
    'L0105': ['INFO-1'], 'L0109': ('out', 'server'), 'L0117': ['PHY-5'], 'L0134': ['INFO-1'],
    'L0152': ('out', 'server'), 'L0163': ('out', 'server'), 'L0182': ('out', 'internal'), 'L0183': ('out', 'internal'),
    'L0208': ('out', 'hosted'), 'L0216': ('out', 'internal'), 'L0219': ('out', 'harness'), 'L0234': ['DS-1'],
    'L0244': ('out', 'internal'), 'L0250': ('out', 'harness'), 'L0265': ('out', 'internal'),
    'L0268': ('out', 'hosted'), 'L0271': ['INFO-1'], 'L0272': ('out', 'hosted'), 'L0273': ('out', 'hosted'),
    'L0274': ('out', 'hosted'), 'L0275': ('out', 'server'),
}
L_PROTO = {
    'L0001': ['DS-3', 'PHY-1'], 'L0002': ['DS-3'], 'L0004': ['DS-2', 'LIFE-1'], 'L0005': ['DS-2', 'LIFE-1'],
    'L0006': ['WEB-1'], 'L0007': ['PHY-1', 'DS-3'], 'L0011': ['PHY-1', 'DS-3'], 'L0012': ['DS-3'],
    'L0014': ['DS-3'], 'L0015': ['DS-3'], 'L0018': ['DS-3'], 'L0019': ['DS-2'], 'L0020': ['DS-2'],
    'L0021': ['DS-3'], 'L0022': ['SAVE-1'], 'L0030': ['PHY-1'], 'L0031': ['DS-2'], 'L0033': ['DS-2'],
    'L0034': ['DS-1'], 'L0035': ['KEY-1'], 'L0038': ['DS-1'], 'L0039': ['DS-1', 'DS-2'], 'L0043': ['DS-1'],
    'L0046': ['DS-1', 'A11Y-1', 'AI-1'], 'L0047': ['DS-2'], 'L0048': ['DS-2', 'KEY-1'], 'L0050': ['DS-2'],
    'L0051': ['DS-2', 'PHY-1'], 'L0052': ['DS-2'], 'L0054': ['OV-2', 'PHY-1'], 'L0055': ['DS-2'],
    'L0056': ['DS-2'], 'L0057': ['DS-2'], 'L0058': ['DS-1'], 'L0059': ['DS-1'], 'L0060': ['DS-1', 'DS-2'],
    'L0061': ['DS-2'], 'L0062': ['A11Y-1'], 'L0065': ['SAVE-1'], 'L0066': ['DS-2'], 'L0067': ['SAVE-1'],
    'L0068': ['SAVE-1'], 'L0069': ['SAVE-1'], 'L0070': ['PHY-2'], 'L0071': ['DS-2', 'KEY-1'],
    'L0072': ['DS-1', 'DS-2'], 'L0073': ['DS-2'], 'L0074': ['DS-2'], 'L0075': ['DS-1'], 'L0076': ['DS-1', 'DS-2'],
    'L0077': ['OV-1'], 'L0078': ['WEB-1'], 'L0079': ['WEB-1'], 'L0080': ['SAVE-1'], 'L0081': ['DS-2'],
    'L0082': ['DS-2'], 'L0083': ['DS-2'], 'L0084': ['DS-2'], 'L0086': ['WEB-1'],
    'L0087': ['OV-2', 'LIFE-1'], 'L0088': ['OV-2'], 'L0090': ['OV-2'], 'L0091': ['OV-2', 'KEY-1'],
    'L0092': ['OV-2'], 'L0093': ['OV-2'], 'L0095': ['OV-2', 'LIFE-1'], 'L0096': ['INFO-1'], 'L0097': ['PHY-1'],
    'L0098': ['OV-1'], 'L0100': ['OV-2'], 'L0103': ['OV-2'], 'L0110': ['OV-1', 'OV-2'], 'L0111': ['OV-2'],
    'L0112': ['OV-2'], 'L0113': ['OV-2'], 'L0114': ['OV-1'], 'L0115': ['OV-2'], 'L0119': ['OV-2'],
    'L0120': ['OV-2', 'LIFE-1'], 'L0121': ['OV-2'], 'L0123': ['A11Y-1'], 'L0125': ['OV-2'], 'L0126': ['WEB-1'],
    'L0127': ['OV-2'], 'L0129': ['INFO-1'], 'L0130': ['INFO-1'], 'L0131': ['OV-2'], 'L0135': ['OV-2', 'KEY-1'],
    'L0137': ['LIFE-1'], 'L0138': ['AI-1'], 'L0139': ['AI-1'], 'L0140': ['AI-1'], 'L0141': ['AI-1'],
    'L0143': ['AI-1'], 'L0145': ['AI-1'], 'L0146': ['AI-1'], 'L0147': ['AI-1'], 'L0148': ['AI-1'],
    'L0149': ['AI-1', 'SAVE-1'], 'L0150': ['AI-1'], 'L0151': ['OV-2'], 'L0153': ['AI-1', 'OV-2'],
    'L0154': ['AI-1', 'WEB-1'], 'L0155': ['AI-1'], 'L0156': ['AI-1', 'WEB-1'], 'L0157': ['AI-1'],
    'L0158': ['AI-1'], 'L0159': ['AI-1'], 'L0160': ['AI-1', 'AI-2'], 'L0162': ['AI-1', 'AI-2'],
    'L0164': ['AI-1'], 'L0165': ['AI-1'], 'L0166': ['AI-1', 'PHY-1'], 'L0167': ['AI-1'], 'L0168': ['AI-1', 'PHY-4'],
    'L0170': ['COL-1'], 'L0171': ['COL-1'], 'L0172': ['COL-1'], 'L0173': ['COL-1'], 'L0174': ['COL-1'],
    'L0175': ['COL-1'], 'L0176': ['COL-1'], 'L0177': ['COL-1', 'PHY-4'], 'L0178': ['COL-1'],
    'L0180': ['WEB-1', 'COL-1'], 'L0181': ['PHY-4', 'COL-1'], 'L0184': ['COL-1', 'OV-1'], 'L0185': ['OV-1'],
    'L0186': ['OV-1'], 'L0187': ['OV-1'], 'L0188': ['COL-1'], 'L0189': ['PHY-4', 'COL-1'], 'L0190': ['PHY-4', 'COL-1'],
    'L0191': ['SAVE-1', 'SAVE-2', 'WEB-1'], 'L0192': ['SAVE-2'], 'L0193': ['WEB-1'], 'L0194': ['SAVE-1'],
    'L0195': ['SAVE-1'], 'L0196': ['WEB-1'], 'L0197': ['SAVE-1'], 'L0198': ['SAVE-1'], 'L0199': ['PHY-3'],
    'L0200': ['SAVE-1'], 'L0201': ['SAVE-1'], 'L0202': ['WEB-1'], 'L0203': ['SAVE-2'], 'L0204': ['WEB-1'],
    'L0205': ['WEB-1'], 'L0207': ['WEB-1'], 'L0209': ['WEB-1'], 'L0210': ['WEB-1'], 'L0213': ['AI-1', 'WEB-1'],
    'L0214': ['LIFE-1'], 'L0215': ['LIFE-1'], 'L0217': ['WEB-1'], 'L0218': ['PHY-5', 'OV-1'],
    'L0220': ('settled', 'damaged-reset'), 'L0221': ['WEB-1'], 'L0222': ['WEB-1'], 'L0223': ['LIFE-1'],
    'L0224': ['WEB-1'], 'L0225': ['PHY-4'], 'L0226': ['WEB-1'], 'L0227': ['WEB-1'], 'L0228': ['WEB-1'],
    'L0229': ['LIFE-1'], 'L0230': ['LIFE-1', 'WEB-1'], 'L0231': ['LIFE-1'], 'L0232': ['OV-2'], 'L0233': ['LIFE-1'],
    'L0236': ['DS-1', 'PHY-4'], 'L0238': ['WEB-1'], 'L0239': ['LIFE-1'], 'L0240': ['OV-1'], 'L0241': ['LIFE-1'],
    'L0242': ['LIFE-1'], 'L0243': ['LIFE-1'], 'L0245': ['LIFE-1'], 'L0246': ['LIFE-1'], 'L0247': ['PHY-1'],
    'L0248': ['PHY-2'], 'L0249': ['PHY-2'], 'L0251': ['PHY-2', 'OV-2'], 'L0252': ['PHY-2'], 'L0253': ['A11Y-1'],
    'L0254': ['DS-2'], 'L0255': ['OV-2'], 'L0256': ['PHY-1'], 'L0257': ['KEY-1'], 'L0258': ['A11Y-2'],
    'L0260': ['A11Y-1'], 'L0261': ['A11Y-1'], 'L0262': ('settled', 'data-loss'),
    'L0263': ('settled', 'data-loss'), 'L0264': ('settled', 'data-loss'), 'L0266': ['PHY-5', 'OV-1'],
}
L_SURFACE_DEFAULT = {'engine': ['DS-3'], 'chrome': ['DS-2'], 'settings': ['OV-2'], 'ai': ['AI-1'],
                     'platform': ['LIFE-1'], 'orchestrator': ['LIFE-1']}
EMPTY_DIVERGENCE = re.compile(r"^(—|-|none|none found|n/a|)$|^none \(same|equivalent$", re.I)
L_NOTES = {
    'L0012': 'large-resize re-adopt follows the closed #2924 disposition (settled, not reopened)',
    'L0153': 'missing Keychain migration is settled cutover data loss; unreadable-secret replacement is compared',
    'L0154': 'missing legacy plaintext migration is settled cutover data loss; Gemini purge and persistence request are compared',
}

E_SPEC = {
    'a11y': ['A11Y-2'], 'actions-panel-layout': ['DS-1'], 'ai-error': ['AI-1'], 'ai-minimize': ['AI-1'],
    'ai-report': ['AI-1'], 'ai-result-a11y': ['A11Y-2', 'AI-1'], 'ai-result-disclosure': ['AI-1'],
    'ai-result-layout': ['AI-1'], 'ai-result': ['AI-1'], 'bare-toolbar-bundle': ['WEB-1'],
    'bare-toolbar-paper': ['DS-2'], 'bare-toolbar': ['DS-1'], 'brush-ring': ['DS-2'], 'button-states': ['OV-1'],
    'capacitor-safe-area': ['DS-1'], 'changelog': ['INFO-1'], 'clear-ring': ['DS-2'], 'clear-tutorial': ['DS-2'],
    'coloring-pack-download-gate': ['COL-1'], 'coloring-pack-download': ['COL-1'], 'csp': ['WEB-1'],
    'dialog-undo': ['KEY-1'], 'drawing-motion-clear': ['DS-2'], 'drawing-motion': ['DS-2'],
    'drawing-work-counters': ('out', 'harness'), 'early-boot': ['LIFE-1'], 'engine-crayon': ['DS-3'],
    'engine-edge-swipe': ['PHY-1'], 'engine-eraser': ['DS-3'], 'engine-export': ['DS-3'],
    'engine-fallback-replay': ['LIFE-1'], 'engine-layout-resize': ['DS-3'], 'engine-lifecycle': ['WEB-1'],
    'engine-pointer-recovery': ['PHY-1'], 'engine-resize': ['DS-3'], 'engine-rotation': ['DS-3'],
    'engine-smoke': ['DS-1'], 'engine-system-bars': ['PHY-4'], 'engine-undo': ['DS-3'],
    'error-screen': ['WEB-1'], 'failure-paths': ['LIFE-1'], 'feedback': ['INFO-1'], 'first-paint': ['LIFE-1', 'DS-1'],
    'flows-actions-panel': ['DS-2'], 'flows-ai': ['AI-1'], 'flows-coloring-book-active-page': ['OV-1'],
    'flows-coloring-book-off-undo': ['COL-1'], 'flows-coloring-book-picker': ['OV-1'],
    'flows-coloring-book-theme': ['OV-1'], 'flows-coloring-book': ['COL-1'],
    'flows-coloring-scroll-cue-resize': ['OV-1'], 'flows-coloring-scroll-cue': ['OV-1'], 'flows-icons': ['DS-1'],
    'flows-magic-brush': ['DS-3'], 'flows-magic-recode': ['DS-3'], 'flows-magic-supersession': ['DS-3'],
    'flows-optional-brushes': ['DS-2'], 'flows-palette-brush': ['DS-2'], 'flows-palette-rendering': ['DS-3'],
    'flows-parent-center-warning': ['OV-2'], 'flows-parent-center': ['OV-2'], 'flows-parental-gate-escape': ['KEY-1'],
    'flows-parental-gate-lockout': ['OV-2'], 'flows-parental-gate': ['OV-2'], 'flows-resume-layout': ['PHY-4'],
    'flows-screenshot': ['SAVE-1'], 'flows-settings-report': ['OV-2'], 'flows-settings': ['OV-2'],
    'flows-tile-history': ['DS-3'], 'flows-undo-persistence': ['DS-1'], 'flows-vector-overlays': ['DS-3'],
    'generate-image': ('out', 'server'), 'halo-lift': ['DS-2'], 'install-banner-layout': ['WEB-1'],
    'install-banner': ['WEB-1'], 'install-preview': ['WEB-1'], 'multitouch': ['PHY-1'],
    'orientation-lock-fullscreen': ['WEB-1'], 'orientation-picker': ['OV-1'], 'page-short-viewport': ['INFO-1'],
    'palette-trim': ['DS-1'], 'parent-center-design': ['OV-1'], 'phone-landscape-toolbar': ['DS-1'],
    'picker-trim': ['OV-1'], 'privacy-parent-center': ['INFO-1'], 'pwa-registration': ['WEB-1'],
    'reduce-motion-scoped-cues': ['A11Y-1'], 'reduce-motion': ['A11Y-1'], 'safe-area-matrix': ['DS-1'],
    'save-failure-announcement': ['SAVE-1', 'PHY-6'], 'scroll-cue': ['OV-1'], 'scrollbar-chrome': ['WEB-1'],
    'secure-storage-connection': ['WEB-1'], 'secure-storage-hydration': ['WEB-1'],
    'settings-accessibility': ['OV-2', 'A11Y-1'], 'settings-hub': ['OV-2'], 'settings-install': ['WEB-1'],
    'settings-mount': ['OV-1'], 'settings-phone-labels': ['OV-1'], 'settings-quick-toggles': ['OV-1'],
    'settings-scroll-cue-opening': ['OV-1'], 'settings-shell': ['OV-2'], 'settings-toc': ['OV-2'],
    'settings-whats-new-outline': ['OV-1'], 'settings-zoom': ['PHY-1'], 'startup-bundle': ('out', 'bundle'),
    'store-drawing-replay': ('out', 'harness'), 'text-contrast': ('out', 'harness'), 'touch-targets': ['A11Y-2'],
    'web-back': ['WEB-1'],
    # web-only page specs
    'admin-login': ('out', 'hosted'), 'admin': ('out', 'hosted'), 'beta': ('out', 'hosted'),
    'design': ('out', 'hosted'), 'design-foundations': ('out', 'hosted'), 'design-navigation': ('out', 'hosted'),
    'proof-sheet-history': ('out', 'hosted'), 'share-cards': ('out', 'hosted'), 'helpers': ('out', 'harness'),
    'privacy': ['INFO-1'], 'page-footer': ['INFO-1'], 'brand-mark': ['INFO-1'], 'page': ('out', 'hosted'),
}
E = {
    # a11y
    'E0001': ['INFO-1'], 'E0002': ['INFO-1'], 'E0004': ['INFO-1'], 'E0003': ('out', 'hosted'),
    'E0005': ('out', 'hosted'), 'E0006': ('out', 'hosted'), 'E0007': ('out', 'hosted'), 'E0008': ('out', 'hosted'),
    'E0014': ('out', 'hosted'),
    # actions-panel-layout
    'E0020': ['AI-1', 'DS-1'], 'E0021': ['AI-1', 'DS-1'], 'E0022': ['AI-1', 'DS-1'], 'E0023': ['AI-1', 'DS-1'],
    'E0024': ['AI-1', 'DS-1'],
    # ai
    'E0057': ['AI-1', 'AI-2'], 'E0063': ['AI-1', 'AI-2'], 'E0064': ['AI-1', 'AI-2'], 'E0370': ['AI-1', 'AI-2'],
    'E0087': ['PHY-1'], 'E0080': ['PHY-5'], 'E0365': ['WEB-1', 'AI-1'], 'E0369': ('settled', 'data-loss'),
    'E0067': ['PHY-6', 'A11Y-2'], 'E0068': ['PHY-6', 'A11Y-2'],
    # bare toolbar
    'E0095': ['DS-2', 'LIFE-1'], 'E0103': ['DS-2'], 'E0105': ['DS-2'], 'E0107': ['DS-2'], 'E0104': ['WEB-1'],
    # brush ring
    'E0137': ['PHY-5'], 'E0138': ['PHY-1'], 'E0139': ['PHY-1'], 'E0140': ['PHY-1'],
    'E0144': ['A11Y-1'],
    # clear
    'E0225': ['PHY-1'],
    # coloring
    'E0372': ['COL-1'], 'E0376': ['OV-2', 'KEY-1'], 'E0377': ['OV-2'], 'E0381': ['DS-2'], 'E0382': ['DS-2'],
    'E0383': ['DS-2'], 'E0177': ['COL-1'], 'E0178': ['COL-1', 'WEB-1'],
    # drawing motion
    'E0229': ['A11Y-1', 'DS-2'], 'E0230': ['A11Y-1', 'DS-2'], 'E0238': ['A11Y-1', 'DS-2'],
    # engine
    'E0260': ['SAVE-1'], 'E0261': ('out', 'internal'), 'E0262': ('out', 'internal'), 'E0263': ['SAVE-1'],
    'E0308': ['PHY-1'], 'E0313': ['PHY-1'], 'E0495': ['PHY-1'],
    'E0272': ['DS-3', 'WEB-1'], 'E0273': ['DS-3'], 'E0282': ['WEB-1'],
    'E0283': ('out', 'internal'), 'E0288': ['PHY-1'], 'E0289': ['PHY-4'], 'E0290': ['PHY-4'], 'E0291': ['PHY-4'],
    'E0292': ['PHY-4'], 'E0269': ('out', 'harness'),
    'E0298': ['DS-3'], 'E0299': ['OV-2'], 'E0300': ['LIFE-1', 'WEB-1'], 'E0301': ['DS-2'],
    'E0325': ['LIFE-1', 'WEB-1'],
    'E0327': ['WEB-1'], 'E0328': ['WEB-1'], 'E0329': ['AI-1'], 'E0331': ['LIFE-1', 'WEB-1'],
    # flows
    'E0355': ['KEY-1', 'A11Y-2'], 'E0356': ['KEY-1', 'A11Y-2'], 'E0360': ['KEY-1', 'A11Y-2'],
    'E0361': ['DS-2', 'A11Y-2'], 'E0418': ['OV-2'], 'E0419': ['KEY-1'], 'E0420': ['KEY-1'],
    'E0423': ['PHY-1'], 'E0424': ['PHY-1'], 'E0425': ['PHY-1'], 'E0426': ['PHY-1'], 'E0427': ['PHY-1'],
    'E0431': ['WEB-1'], 'E0432': ['PHY-5'], 'E0433': ['PHY-5'],
    'E0443': ['KEY-1'], 'E0450': ['KEY-1'], 'E0456': ['KEY-1'], 'E0446': ['OV-1'], 'E0447': ['OV-1'],
    'E0453': ['OV-1'], 'E0457': ['A11Y-2'], 'E0467': ['INFO-1'], 'E0444': ['WEB-1'],
    'E0476': ['WEB-1'], 'E0477': ['A11Y-1', 'SAVE-1'],
    'E0483': ['KEY-1'], 'E0485': ['OV-1'], 'E0487': ['OV-1'], 'E0488': ['INFO-1'], 'E0489': ['INFO-1'],
    'E0494': ['OV-1'],
    'E0500': ['DS-3'], 'E0501': ['KEY-1'], 'E0502': ['DS-2', 'A11Y-1'], 'E0503': ['KEY-1'],
    'E0504': ['DS-2', 'LIFE-1'], 'E0505': ['LIFE-1', 'DS-1'], 'E0506': ('settled', 'damaged-reset'),
    'E0512': ['LIFE-1'], 'E0515': ['LIFE-1'],
    # misc
    'E0527': ['A11Y-1', 'DS-2'], 'E0554': ['WEB-1'], 'E0555': ['WEB-1'],
    'E0570': ['WEB-1'], 'E0571': ['WEB-1'], 'E0572': ['WEB-1'], 'E0574': ['WEB-1'], 'E0576': ['WEB-1'],
    'E0581': ['WEB-1'], 'E0582': ['WEB-1'],
    'E0593': ['DS-2'], 'E0595': ['KEY-1', 'DS-2'], 'E0599': ['DS-2'], 'E0600': ['DS-2'], 'E0601': ['DS-2'],
    'E0602': ['DS-2'], 'E0603': ['DS-2'], 'E0604': ['DS-2'], 'E0605': ['DS-2'], 'E0610': ['WEB-1'],
    'E0652': ['A11Y-1', 'LIFE-1'], 'E0653': ['A11Y-1', 'WEB-1'],
    'E0662': ['INFO-1'], 'E0663': ['INFO-1'], 'E0664': ['INFO-1'], 'E0674': ['INFO-1'], 'E0675': ['INFO-1'],
    'E0676': ['INFO-1'],
    'E0689': ['A11Y-2', 'OV-2'], 'E0690': ['A11Y-2', 'OV-2'], 'E0691': ['OV-2', 'OV-1'], 'E0697': ['OV-1'],
    'E0699': ['A11Y-2'], 'E0700': ['A11Y-2'],
    'E0708': ['PHY-5'], 'E0712': ['PHY-5'], 'E0713': ['PHY-5'], 'E0715': ['PHY-5'], 'E0714': ['OV-2'],
    'E0716': ['OV-2'], 'E0719': ['A11Y-2'], 'E0720': ['WEB-1'], 'E0723': ['OV-2', 'LIFE-1'],
    'E0724': ['OV-2'], 'E0725': ['WEB-1'],
    'E0730': ['PHY-5'], 'E0731': ['PHY-5'], 'E0732': ['PHY-1'], 'E0733': ['KEY-1'],
    'E0744': ['A11Y-1', 'OV-2'], 'E0757': ['OV-1'], 'E0785': ['WEB-1', 'LIFE-1'],
}
for eid in ['E0507', 'E0508', 'E0509', 'E0510', 'E0511', 'E0513', 'E0514']:
    E.setdefault(eid, ['DS-1', 'LIFE-1'])
E_NOTES = {
    'E0369': 'legacy BYO-key migration is settled cutover data loss',
    'E0506': 'per-key fallback is governed by the settled gated damaged-settings reset',
}

TARGETS_OVERRIDE = {
    'T1-14': SIM + EMU + WEB + ['physical-ipad'],
    'T2-23': ['physical-ipad'], 'T2-24': ['physical-galaxy'],
    'P10': ['physical-iphone'], 'P15': IPAD_SIM,
    'P16': EMU, 'X24': ['physical-iphone'], 'B0352': ['physical-iphone'], 'X44': IPAD_SIM,
}
NO_FILTER = {'B0270', 'B0302', 'B0334', 'B0073'}


def targets_for(protocols, text, rid=None, kind=None):
    if rid in TARGETS_OVERRIDE:
        return list(TARGETS_OVERRIDE[rid])
    ts = []
    for p in protocols:
        for t in PROTOCOLS[p][2]:
            if t not in ts:
                ts.append(t)
    if kind == 'acceptance' or rid in NO_FILTER:
        return ts
    low = text.lower()
    android = bool(re.search(r'\bandroid\b|talkback|galaxy|api ?\d\d', low))
    ios = bool(re.search(r'\bios\b|ipad|ipados|iphone|apple pencil|pencil (double|hover|stream|leaving|gesture)|down-less/merged pencil|voiceover|photos|keychain|ipados scribble|scribble guard|scribble releases', low))
    webish = bool(re.search(r'rn[- ]web|\(web\)|\bweb\b|browser|safari|firefox|chromium|desktop|pwa|service worker|install banner|tab title|/privacy|/changelog|/feedback', low))
    if android and not ios:
        sub = [t for t in ts if t in ANDROID_TARGETS or t in {'ci-exact-head'}]
        ts = sub or ts
    elif ios and not android and not webish:
        sub = [t for t in ts if t in IOS_TARGETS or t in {'ci-exact-head'}]
        ts = sub or ts
    return ts

def arms_for(protocols, targets):
    arms = []
    for p in protocols:
        a = PROTOCOLS[p][3]
        if p == 'AC-1':
            cand = ['contract']
        elif p == 'AI-2':
            cand = ['rn', 'rn-web'] if any(t in WEB_TARGETS for t in targets) else ['rn']
        elif p == 'WEB-1':
            cand = ['rn-web', 'web-prod']
        elif a.startswith('native'):
            cand = []
            if any(t not in WEB_TARGETS for t in targets):
                cand += ['rn', 'ref160']
            if any(t in WEB_TARGETS for t in targets):
                cand += ['rn-web', 'web-prod']
        else:
            cand = a.split('|')
        for c in cand:
            if c not in arms:
                arms.append(c)
    return arms

def classify(rid, spec, text, extra_tests, note, blocked, kind=None):
    """spec: list of protocols, or ('settled', key[, protocols]), or ('out', key)."""
    tests = list(extra_tests)
    if isinstance(spec, tuple) and spec[0] == 'out':
        return dict(classification='out-of-scope', protocols=[], targets=[], arms=[], tests=[],
                    basis=OUT[spec[1]] + (f'; {note}' if note else ''), status='out-of-scope')
    if isinstance(spec, tuple) and spec[0] == 'settled':
        protos = list(spec[2]) if len(spec) > 2 else []
        ts = targets_for(protos, text, rid, kind) if protos else []
        return dict(classification='settled', protocols=protos, targets=ts, arms=arms_for(protos, ts) if protos else [],
                    tests=tests, basis=SETTLED[spec[1]] + ('; observed in ' + ', '.join(protos) + ' as an accepted difference, never a defect' if protos else '') + (f'; {note}' if note else ''),
                    status='settled')
    protos = list(spec)
    non_ac = [p for p in protos if p != 'AC-1']
    if non_ac and all(p in PHYSICAL for p in non_ac):
        cls = 'physical-only'
    elif not non_ac:
        cls = 'automated-test'
    else:
        cls = 'protocol'
    ts = targets_for(protos, text, rid, kind)
    status = 'blocked' if blocked else 'unverified'
    basis = note or ''
    if blocked:
        basis = (basis + '; ' if basis else '') + 'blocked: ' + blocked
    return dict(classification=cls, protocols=protos, targets=ts, arms=arms_for(protos, ts), tests=tests,
                basis=basis, status=status)

def main():
    rows = list(csv.DictReader(open(f'{LEDGER}/requirements.csv')))
    out = []
    for r in rows:
        rid, kind, text = r['id'], r['kind'], r['requirement']
        d = json.loads(r['details']) if r['details'] else {}
        note, blocked, tests = '', None, []
        if kind == 'acceptance':
            spec = A[rid]
            note = A_NOTES.get(rid, 'acceptance row ' + rid)
            blocked = A_BLOCKED.get(rid)
            for t in A_TESTS.get(rid, []):
                tests += resolve_tests(t)
        elif kind == 'difference':
            spec = X[rid]
            note = X_NOTES.get(rid, 'historical difference ' + rid)
            blocked = X_BLOCKED.get(rid)
        elif kind == 'behavior':
            spec = B.get(rid) or B_DEFAULT[(r['surface'], d.get('slice'))]
            rule = 'explicit decision' if rid in B else f"surface rule ({r['surface']} / {d.get('slice')})"
            note = B_NOTES.get(rid, rule)
            blocked = B_BLOCKED.get(rid)
            if not (isinstance(spec, tuple)):
                rn = d.get('rn', '')
                if not RN_ONLY.search(rn):
                    tests = resolve_tests(rn)
        elif kind == 'logic':
            cls = d.get('class')
            guard = d.get('guard', '')
            div = (d.get('diverge') or '').strip()
            if cls == 'not needed on RN':
                spec = L_NOT_NEEDED[rid]
                note = L_NOTES.get(rid, 'historically "not needed on RN"')
            else:
                gtests = [] if RN_ONLY.search(guard) else resolve_tests(guard)
                two_sided_clean = cls in ('ported with drift guard', 'imported') and gtests and EMPTY_DIVERGENCE.search(div)
                if rid in L_PROTO:
                    spec = L_PROTO[rid]
                    note = L_NOTES.get(rid, f'{cls}; recorded divergence compared by protocol' if not EMPTY_DIVERGENCE.search(div) else f'{cls}')
                elif two_sided_clean:
                    spec = ['AC-1']
                    note = f'{cls}; no recorded divergence; named guard must read shipping source'
                else:
                    spec = L_SURFACE_DEFAULT[r['surface']]
                    note = f'{cls}; surface rule ({r["surface"]})'
                if not isinstance(spec, tuple):
                    tests = gtests
                    if two_sided_clean and rid in L_PROTO and 'AC-1' not in spec:
                        spec = spec + ['AC-1']
        elif kind == 'shipping-e2e':
            sname = d['spec'].replace('.spec.ts', '')
            spec = E.get(rid) or E_SPEC[sname]
            note = E_NOTES.get(rid, ('explicit decision; ' if rid in E else '') + f'shipping spec {d["spec"]}')
        else:
            raise SystemExit(f'unknown kind {kind}')
        res = classify(rid, spec, text, tests, note, blocked, kind)
        if res['classification'] == 'automated-test' and not res['tests']:
            raise SystemExit(f'{rid}: automated-test without a resolved test')
        out.append((r, res))

    # validation
    ids = [r['id'] for r, _ in out]
    assert len(ids) == len(set(ids)) == 1541, len(ids)
    for r, res in out:
        for p in res['protocols']:
            assert p in PROTOCOLS, (r['id'], p)
        if res['classification'] in ('protocol', 'physical-only', 'automated-test'):
            assert res['protocols'] and res['targets'] and res['arms'], r['id']
        if res['classification'] == 'out-of-scope':
            assert not res['protocols']
    fields = ['requirementId', 'kind', 'surface', 'classification', 'protocolIds', 'targets', 'arms',
              'namedTests', 'basis', 'status', 'evidence']
    buffer = io.StringIO()
    w = csv.writer(buffer, lineterminator='\n')
    w.writerow(fields)
    for r, res in out:
        w.writerow([r['id'], r['kind'], r['surface'], res['classification'], ';'.join(res['protocols']),
                    ';'.join(res['targets']), ';'.join(res['arms']), ';'.join(res['tests']), res['basis'],
                    res['status'], ''])
    path = f'{LEDGER}/protocol-mapping.csv'
    if '--check' in sys.argv:
        current = open(path).read() if os.path.exists(path) else ''
        if current != buffer.getvalue():
            raise SystemExit(f'{path} differs from what build-protocol-mapping.py builds')
    else:
        with open(path, 'w', newline='') as f:
            f.write(buffer.getvalue())
    print('classification', dict(Counter(res['classification'] for _, res in out)))
    print('status', dict(Counter(res['status'] for _, res in out)))
    mapped = Counter(p for _, res in out for p in res['protocols'])
    primary = Counter(res['protocols'][0] for _, res in out if res['protocols'])
    for p, (_, title, _, _) in PROTOCOLS.items():
        print(f'{p}: {mapped[p]} mapped, {primary[p]} primary ({title})')


main()
