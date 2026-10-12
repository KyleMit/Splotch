"""Trace filled SVG artwork to deterministic centerline strokes."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from .graph import CenterlineGraph, select, smoothness, svgio
from .pipeline import emit, extract
from .pipeline import svgio as pipeline_svgio

SOURCE_SNAPSHOT = "98101ffc574aa42266f538ecef0a765f8476e1fd"
IMPLEMENTATION = "splotch-centerline-tracing/1"
PRUNING_LAMBDAS = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0)
DEFAULT_RASTER_SCALE = 8.0
THIN_DETAIL_RASTER_SCALE = 2.0
RASTER_SCALE_OVERRIDES = frozenset({"sun-square", "landscape-square"})
DEFAULT_SIMPLIFY_EPSILON = 0.15
DEFAULT_RANDOM_SEED = 0


@dataclass(frozen=True)
class TraceConfig:
    scale: float | None = None
    pruning_lambda: float | None = None
    simplify_epsilon: float = DEFAULT_SIMPLIFY_EPSILON
    seed: int = DEFAULT_RANDOM_SEED
    width_mode: str = "piecewise"

    def for_source(self, source: Path) -> TraceConfig:
        scale = self.scale
        if scale is None:
            scale = (
                THIN_DETAIL_RASTER_SCALE
                if source.stem in RASTER_SCALE_OVERRIDES
                else DEFAULT_RASTER_SCALE
            )
        return TraceConfig(
            scale=scale,
            pruning_lambda=self.pruning_lambda,
            simplify_epsilon=self.simplify_epsilon,
            seed=self.seed,
            width_mode=self.width_mode,
        )


@dataclass(frozen=True)
class TraceJob:
    source: Path
    output: Path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_source(path: Path) -> None:
    if not path.is_file():
        raise ValueError(f"input does not exist or is not a file: {path}")
    if path.suffix.lower() != ".svg":
        raise ValueError(f"input must be an SVG file: {path}")
    pipeline_svgio.load(path)
    svgio.load_source(path)


def resolve_jobs(input_path: Path, output_path: Path) -> list[TraceJob]:
    source = input_path.expanduser().resolve()
    target = output_path.expanduser().resolve()
    if source.is_file():
        if target.exists() and target.is_dir():
            target = target / source.name
        elif target.suffix.lower() != ".svg":
            raise ValueError("a file input requires an output SVG file or existing directory")
        jobs = [TraceJob(source, target)]
    elif source.is_dir():
        if target.exists() and not target.is_dir():
            raise ValueError("a directory input requires an output directory")
        if target.suffix:
            raise ValueError("a directory input requires an output directory without a suffix")
        sources = sorted(source.glob("*.svg"))
        if not sources:
            raise ValueError(f"input directory contains no SVG files: {source}")
        jobs = [TraceJob(item, target / item.name) for item in sources]
    else:
        raise ValueError(f"input does not exist: {source}")

    if len({job.output for job in jobs}) != len(jobs):
        raise ValueError("multiple inputs resolve to the same output path")
    for job in jobs:
        if job.source == job.output:
            raise ValueError(f"input and output must differ: {job.source}")
        _validate_source(job.source)
    return jobs


def trace_one(job: TraceJob, workspace: Path, config: TraceConfig) -> tuple[str, dict, float]:
    effective = config.for_source(job.source)
    document = pipeline_svgio.load(job.source)
    started = time.perf_counter()
    extraction_config = extract.ExtractConfig(
        scale=effective.scale,
        method="medial-axis",
        simplify_eps=effective.simplify_epsilon,
        rng_seed=effective.seed,
    )
    pipeline_graph, _ = extract.extract_document(document, extraction_config)
    emit.fit_beziers(pipeline_graph, width_mode=effective.width_mode)

    graph_path = workspace / f"{job.source.stem}.graph.json"
    pipeline_graph.save(graph_path)
    source_geometry = svgio.load_source(job.source)
    lambdas = (
        (0.0, effective.pruning_lambda)
        if effective.pruning_lambda is not None
        else PRUNING_LAMBDAS
    )
    chosen, candidates = select.select(
        CenterlineGraph.load(graph_path), source_geometry, lambdas=lambdas
    )
    if effective.pruning_lambda is not None:
        chosen = next(
            candidate for candidate in candidates if candidate.lam == effective.pruning_lambda
        )
    raw = next((candidate for candidate in candidates if candidate.lam == 0.0), None)

    kept: set[str] = set()
    for edge in chosen.graph.edges.values():
        kept.add(edge.id)
        kept.update(edge.extra.get("mergedFrom", []))
    pipeline_graph.edges = [edge for edge in pipeline_graph.edges if edge.id in kept]
    pipeline_graph.meta["prunedLambda"] = chosen.lam

    fills = {f"e{element.index}": element.fill for element in document.elements}
    svg_text = emit.stroked_svg(
        pipeline_graph,
        fills,
        use_beziers=True,
        piecewise=effective.width_mode == "piecewise",
    )
    naturalness = smoothness.graph_smoothness(chosen.graph)
    metrics = {
        "error": round(chosen.error, 6),
        "errorUnpruned": round(raw.error, 6) if raw else None,
        "iou": round(chosen.metrics.iou, 6),
        "wobble": round(naturalness.wiggle, 6),
        "pointsPerWidth": round(naturalness.verts_per_width, 4),
        "controlPoints": chosen.metrics.control_points,
        "edgesBeforePruning": len(CenterlineGraph.load(graph_path).edges),
        "strokesEmitted": len(pipeline_graph.edges),
        "bytes": len(svg_text.encode()),
    }
    record = {
        "source": str(job.source),
        "sourceHash": f"sha256:{_sha256(job.source)}",
        "outputPath": str(job.output),
        "implementation": IMPLEMENTATION,
        "sourceSnapshot": SOURCE_SNAPSHOT,
        "configuration": {**asdict(effective), "selectedPruningLambda": chosen.lam},
        "metrics": metrics,
    }
    return svg_text, record, time.perf_counter() - started


def _nearest_existing_parent(path: Path) -> Path:
    parent = path.parent
    while not parent.exists():
        parent = parent.parent
    return parent


def _promotion_workspace_parent(jobs: list[TraceJob], manifest_path: Path) -> Path:
    targets = [job.output for job in jobs] + [manifest_path]
    parents = [_nearest_existing_parent(target) for target in targets]
    if len({parent.stat().st_dev for parent in parents}) != 1:
        raise ValueError("outputs and manifest must share a filesystem for atomic promotion")
    return _nearest_existing_parent(jobs[0].output if jobs else manifest_path)


def _promote(staged: list[tuple[Path, Path]], workspace: Path) -> None:
    promoted: list[tuple[Path, Path | None]] = []
    backup_root = workspace / "backups"
    backup_root.mkdir()
    try:
        for index, (source, target) in enumerate(staged):
            target.parent.mkdir(parents=True, exist_ok=True)
            backup = None
            if target.exists():
                backup = backup_root / str(index)
                os.replace(target, backup)
            try:
                os.replace(source, target)
            except Exception:
                if backup is not None:
                    os.replace(backup, target)
                raise
            promoted.append((target, backup))
    except Exception:
        for target, backup in reversed(promoted):
            if target.exists():
                target.unlink()
            if backup is not None:
                os.replace(backup, target)
        raise


def trace_jobs(jobs: list[TraceJob], manifest_path: Path, config: TraceConfig) -> int:
    try:
        workspace_parent = _promotion_workspace_parent(jobs, manifest_path)
        workspace = Path(tempfile.mkdtemp(prefix=".centerline-tracing-", dir=workspace_parent))
    except (OSError, ValueError) as error:
        print(f"centerline tracing: {error}", file=sys.stderr)
        return 2
    failures: list[tuple[TraceJob, Exception]] = []
    records: list[dict] = []
    staged: list[tuple[Path, Path]] = []
    try:
        for index, job in enumerate(jobs):
            try:
                svg_text, record, seconds = trace_one(job, workspace, config)
                staged_output = workspace / f"output-{index}.svg"
                staged_output.write_text(svg_text)
                staged.append((staged_output, job.output))
                records.append(record)
                metrics = record["metrics"]
                print(
                    f"  {job.source.name}: error {metrics['error']:.4f}, "
                    f"wobble {metrics['wobble']:.4f}, {metrics['strokesEmitted']} strokes "
                    f"({seconds:.1f}s)",
                    flush=True,
                )
            except Exception as error:  # noqa: BLE001
                failures.append((job, error))
                print(f"  FAILED {job.source}: {error}", file=sys.stderr, flush=True)
        if failures:
            print(
                f"centerline tracing failed for {len(failures)} input(s); no outputs changed",
                file=sys.stderr,
            )
            return 1

        staged_manifest = workspace / "manifest.json"
        staged_manifest.write_text(json.dumps({"traces": records}, indent=2, sort_keys=True) + "\n")
        staged.append((staged_manifest, manifest_path))
        _promote(staged, workspace)
        print(f"wrote {len(records)} centerline SVG(s) and {manifest_path}")
        return 0
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="filled SVG file or directory")
    parser.add_argument(
        "--output", required=True, type=Path, help="centerline SVG file or directory"
    )
    parser.add_argument("--manifest", type=Path, help="manifest path (defaults beside the output)")
    parser.add_argument("--scale", type=float, help="raster pixels per SVG unit")
    parser.add_argument("--lambda", dest="pruning_lambda", type=float, help="fixed pruning strength")
    parser.add_argument("--simplify-epsilon", type=float, default=DEFAULT_SIMPLIFY_EPSILON)
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    parser.add_argument("--width-mode", choices=("piecewise", "constant"), default="piecewise")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        jobs = resolve_jobs(args.input, args.output)
        if args.scale is not None and args.scale <= 0:
            raise ValueError("--scale must be greater than zero")
        if args.pruning_lambda is not None and args.pruning_lambda < 0:
            raise ValueError("--lambda must be zero or greater")
        if args.simplify_epsilon < 0:
            raise ValueError("--simplify-epsilon must be zero or greater")
        manifest = args.manifest
        if manifest is None:
            manifest = (
                jobs[0].output.with_suffix(".manifest.json")
                if len(jobs) == 1
                else args.output.expanduser().resolve() / "manifest.json"
            )
        manifest = manifest.expanduser().resolve()
        if manifest in {job.source for job in jobs} | {job.output for job in jobs}:
            raise ValueError("manifest path must differ from every input and output")
    except (OSError, ValueError) as error:
        print(f"centerline tracing: {error}", file=sys.stderr)
        return 2

    return trace_jobs(
        jobs,
        manifest,
        TraceConfig(
            scale=args.scale,
            pruning_lambda=args.pruning_lambda,
            simplify_epsilon=args.simplify_epsilon,
            seed=args.seed,
            width_mode=args.width_mode,
        ),
    )


if __name__ == "__main__":
    raise SystemExit(main())
