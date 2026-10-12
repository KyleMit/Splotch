#!/usr/bin/env python3
"""One re-runnable bench command for this pipeline.

    python -m centerline_tracing.pipeline.bench corpus
    python -m centerline_tracing.pipeline.bench inputs --images house-wide,dinosaur-wide
    python -m centerline_tracing.pipeline.bench sweep --images house-wide --scales 1,2,4,8,12
    python -m centerline_tracing.pipeline.bench all

Writes benchmark/metrics.json, benchmark/graphs/*.json, and benchmark/out/*.svg, then prints a
table.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from . import emit, extract, graphmodel, svgio
from . import metrics as M

CAPABILITY_ROOT = Path(__file__).resolve().parents[3]
DEBUG = CAPABILITY_ROOT / "benchmark"
GRAPHS = DEBUG / "graphs"
OUTDIR = DEBUG / "out"
# A benchmark never promotes into a production caller's explicit output path.
PROMOTED = CAPABILITY_ROOT / "benchmark" / "promoted"
METRICS = DEBUG / "metrics.json"

LADDER = ["house-wide", "butterfly-wide", "boat-tall", "island-tall", "balloon-tall",
          "home-wide", "house-tall", "dinosaur-wide", "landscape-square", "sun-square"]


def run_one(svg_path: Path, cfg: extract.ExtractConfig, tag: str,
            truth: list | None = None, promote: bool = False,
            use_beziers: bool = True,
            width_mode: str = "constant") -> dict:
    doc = svgio.load(svg_path)
    t0 = time.perf_counter()
    graph, results = extract.extract_document(doc, cfg)
    t_extract = time.perf_counter() - t0

    t0 = time.perf_counter()
    n_bez = emit.fit_beziers(graph, width_mode=width_mode)
    t_fit = time.perf_counter() - t0

    fills = {f"e{e.index}": e.fill for e in doc.elements}
    svg_text = emit.stroked_svg(graph, fills, use_beziers=use_beziers,
                                piecewise=width_mode == "piecewise")
    OUTDIR.mkdir(parents=True, exist_ok=True)
    out_svg = OUTDIR / f"{doc.id}__{tag}.svg"
    out_svg.write_text(svg_text)

    GRAPHS.mkdir(parents=True, exist_ok=True)
    graph_path = GRAPHS / (f"{doc.id}.json" if tag == "default" else f"{doc.id}__{tag}.json")
    graph.save(graph_path)
    problems = graphmodel.validate(json.loads(graph_path.read_text()))

    record = {
        "image": doc.id,
        "tag": tag,
        "source": str(svg_path.relative_to(CAPABILITY_ROOT)),
        "config": {"scale": cfg.scale, "method": cfg.method,
                   "simplifyEps": cfg.simplify_eps, "capExtend": cfg.cap_extend,
                   "cornerAngle": cfg.corner_angle},
        "elements": len(doc.elements),
        "extractSeconds": t_extract,
        "fitSeconds": t_fit,
        "secondsPerElement": t_extract / max(1, len(doc.elements)),
        "bezierSegments": n_bez,
        "graph": str(graph_path.relative_to(CAPABILITY_ROOT)),
        "output": str(out_svg.relative_to(CAPABILITY_ROOT)),
        "graphProblems": problems,
        "failures": [{"element": r.index, "reason": r.failure}
                     for r in results if r.failure],
        "subpixelElementsDropped": sum(1 for r in results
                                       if r.failure == "subpixel-element"),
        "terminalEnds": sum(int(r.extra.get("terminalEnds") or 0) for r in results),
    }
    record.update(M.complexity(graph, out_svg))
    record["polylineBytes"] = len(emit.stroked_svg(graph, fills, use_beziers=False))
    record.update(M.restroke_score(doc, out_svg, scale=4.0))
    record["tags"] = M.failure_tags(graph, results, cfg)
    if truth is not None:
        record.update(M.centerline_error(graph, truth))
    if promote:
        PROMOTED.mkdir(parents=True, exist_ok=True)
        (PROMOTED / f"{doc.id}.svg").write_text(svg_text)
        record["promoted"] = f"benchmark/promoted/{doc.id}.svg"
    return record


def load_metrics() -> dict:
    if METRICS.exists():
        return json.loads(METRICS.read_text())
    return {"runs": []}


def save_metrics(store: dict) -> None:
    DEBUG.mkdir(parents=True, exist_ok=True)
    METRICS.write_text(json.dumps(store, indent=1))


def merge(store: dict, records: list[dict]) -> None:
    index = {(r["image"], r["tag"]): i for i, r in enumerate(store["runs"])}
    for rec in records:
        key = (rec["image"], rec["tag"])
        if key in index:
            store["runs"][index[key]] = rec
        else:
            index[key] = len(store["runs"])
            store["runs"].append(rec)
    store["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def fmt(v, spec=".3f"):
    if v is None:
        return "-"
    if isinstance(v, float):
        return format(v, spec)
    return str(v)


def print_table(records: list[dict], corpus: bool = False) -> None:
    if corpus:
        cols = [("image", 22, "s"), ("tag", 21, "s"), ("iou", 7, ".4f"),
                ("centerlineMedian", 9, ".3f"), ("centerlineP95", 9, ".3f"),
                ("centerlineHausdorff", 10, ".2f"), ("edges", 6, "d"),
                ("bezierSegments", 6, "d"), ("medianRadius", 7, ".2f")]
    else:
        cols = [("image", 18, "s"), ("tag", 21, "s"), ("iou", 7, ".4f"),
                ("pixelDiffPct", 8, ".2f"), ("symDiffFrac", 8, ".4f"),
                ("boundaryMedian", 8, ".3f"), ("boundaryP95", 8, ".3f"),
                ("edges", 6, "d"), ("bezierSegments", 7, "d"),
                ("fileBytes", 8, "d"), ("extractSeconds", 7, ".2f")]
    head = " ".join(f"{name[:width]:>{width}}" for name, width, _ in cols)
    print(head)
    print("-" * len(head))
    for rec in records:
        cells = []
        for name, width, spec in cols:
            v = rec.get(name)
            if v is None:
                cells.append(f"{'-':>{width}}")
            elif spec == "s":
                cells.append(f"{str(v)[:width]:>{width}}")
            elif spec == "d":
                cells.append(f"{int(v):>{width}d}")
            else:
                cells.append(f"{float(v):>{width}{spec}}")
        print(" ".join(cells))


def _tag(method: str, scale: float, args) -> str:
    return (f"{method}@{scale:g}"
            + ("+cap" if args.cap_extend else "")
            + ("+pw" if args.width_mode == "piecewise" else ""))


def cmd_corpus(args) -> list[dict]:
    manifest = json.loads((DEBUG / "corpus" / "corpus.json").read_text())
    records = []
    for case in manifest["cases"]:
        if args.cases and case["id"] not in args.cases and str(case["num"]) not in args.cases:
            continue
        for method in args.methods:
            cfg = extract.ExtractConfig(scale=args.scale, method=method,
                                        cap_extend=args.cap_extend,
                                        simplify_eps=args.simplify_eps)
            tag = _tag(method, args.scale, args)
            rec = run_one(
                CAPABILITY_ROOT / case["svg"], cfg, tag, truth=case["truth"],
                width_mode=args.width_mode
            )
            rec["corpusCase"] = case["num"]
            rec["notes"] = case["notes"]
            records.append(rec)
    return records


def cmd_inputs(args) -> list[dict]:
    records = []
    for name in args.images:
        for method in args.methods:
            cfg = extract.ExtractConfig(scale=args.scale, method=method,
                                        cap_extend=args.cap_extend,
                                        simplify_eps=args.simplify_eps)
            tag = _tag(method, args.scale, args)
            records.append(run_one(
                CAPABILITY_ROOT / "tests" / "fixtures" / "filled" / f"{name}.svg", cfg, tag,
                                   promote=args.promote, width_mode=args.width_mode))
    return records


def cmd_sweep(args) -> list[dict]:
    records = []
    for name in args.images:
        src = CAPABILITY_ROOT / "tests" / "fixtures" / "filled" / f"{name}.svg"
        if not src.exists():
            src = DEBUG / "corpus" / f"{name}.svg"
        truth = None
        manifest_path = DEBUG / "corpus" / "corpus.json"
        if manifest_path.exists():
            for case in json.loads(manifest_path.read_text())["cases"]:
                if case["id"] == name:
                    truth = case["truth"]
        for scale in args.scales:
            for method in args.methods:
                cfg = extract.ExtractConfig(scale=scale, method=method,
                                            cap_extend=args.cap_extend,
                                            simplify_eps=args.simplify_eps)
                rec = run_one(src, cfg, _tag(method, scale, args), truth=truth,
                              width_mode=args.width_mode)
                records.append(rec)
    return records


def cmd_report(args) -> None:
    """Re-print stored results without recomputing anything."""
    store = load_metrics()
    runs = store["runs"]
    if args.tag:
        runs = [r for r in runs if r["tag"] in args.tag.split(",")]
    real = [r for r in runs if not r.get("corpusCase")]
    corpus = [r for r in runs if r.get("corpusCase")]
    if real:
        order = {n: i for i, n in enumerate(LADDER)}
        real.sort(key=lambda r: (order.get(r["image"], 99), r["tag"]))
        print("REAL INPUTS")
        print_table(real)
        print()
    if corpus:
        corpus.sort(key=lambda r: (r["corpusCase"], r["tag"]))
        print("SYNTHETIC CORPUS")
        print_table(corpus, corpus=True)
        print()
    # Failure tags, restricted to the image set every listed tag actually ran
    # on — otherwise a config that only ran on 3 images looks "cleaner" than one
    # that ran on 10 purely because of the image count.
    by_tag: dict[str, dict[str, dict]] = {}
    for r in real:
        by_tag.setdefault(r["tag"], {})[r["image"]] = r
    if not by_tag:
        return
    common = set.intersection(*(set(v) for v in by_tag.values()))
    if not common:
        common = set(max(by_tag.values(), key=len))
        by_tag = {t: v for t, v in by_tag.items() if common <= set(v)}
    keys = sorted({k for v in by_tag.values() for r in v.values()
                   for k in (r.get("tags") or {})})
    print(f"FAILURE TAGS  (summed over {len(common)} images common to all rows: "
          f"{', '.join(sorted(common))})")
    print(f"{'tag':22s}{'edges':>7s}" + "".join(f"{k[:14]:>16s}" for k in keys))
    for tag, per_image in sorted(by_tag.items()):
        recs = [per_image[i] for i in sorted(common)]
        edges = sum(r["edges"] for r in recs)
        counts = {k: sum((r.get("tags") or {}).get(k, 0) for r in recs) for k in keys}
        print(f"{tag:22s}{edges:>7d}" + "".join(f"{counts[k]:>16d}" for k in keys))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["corpus", "inputs", "sweep", "all", "report"])
    ap.add_argument("--images", default="house-wide")
    ap.add_argument("--cases", default="")
    ap.add_argument("--scale", type=float, default=4.0)
    ap.add_argument("--scales", default="1,2,4,8,12")
    ap.add_argument("--methods", default="medial-axis")
    ap.add_argument("--simplify-eps", type=float, default=0.15)
    ap.add_argument("--cap-extend", action="store_true")
    ap.add_argument("--width-mode", choices=["constant", "piecewise"], default="constant")
    ap.add_argument("--tag", default=None, help="report: filter to these tags")
    ap.add_argument("--promote", action="store_true")
    args = ap.parse_args()
    args.images = [s for s in args.images.split(",") if s]
    args.cases = [s for s in args.cases.split(",") if s]
    args.methods = [s for s in args.methods.split(",") if s]
    args.scales = [float(s) for s in args.scales.split(",") if s]

    if args.command == "report":
        cmd_report(args)
        return

    store = load_metrics()
    if args.command == "corpus":
        records = cmd_corpus(args)
        print_table(records, corpus=True)
    elif args.command == "inputs":
        records = cmd_inputs(args)
        print_table(records)
    elif args.command == "sweep":
        records = cmd_sweep(args)
        print_table(records)
    else:
        records = cmd_corpus(args)
        print_table(records, corpus=True)
        args.images = LADDER
        r2 = cmd_inputs(args)
        print()
        print_table(r2)
        records += r2
    merge(store, records)
    save_metrics(store)
    print(f"\n{len(records)} runs -> {METRICS.relative_to(CAPABILITY_ROOT)}")


if __name__ == "__main__":
    main()
