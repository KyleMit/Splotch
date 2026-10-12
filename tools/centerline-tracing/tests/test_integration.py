from pathlib import Path

import pytest

from centerline_tracing.cli import TraceConfig, TraceJob, trace_one
from centerline_tracing.graph import metrics, svgio

CAPABILITY_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.integration
def test_representative_trace_stays_within_golden_metric_thresholds(tmp_path) -> None:
    source_path = CAPABILITY_ROOT / "tests" / "fixtures" / "filled" / "balloon-tall.svg"
    golden_path = CAPABILITY_ROOT / "tests" / "fixtures" / "golden" / "balloon-tall.svg"
    output_path = tmp_path / "balloon-tall.svg"
    generated, record, _seconds = trace_one(
        TraceJob(source_path, output_path), tmp_path, TraceConfig()
    )
    output_path.write_text(generated)

    source = svgio.load_source(source_path)
    generated_metrics = metrics.score_graph(svgio.graph_from_stroked_svg(output_path), source)
    golden_metrics = metrics.score_graph(svgio.graph_from_stroked_svg(golden_path), source)

    assert generated_metrics.sym_diff_ratio < 0.05
    assert abs(generated_metrics.sym_diff_ratio - golden_metrics.sym_diff_ratio) < 0.01
    assert record["metrics"]["wobble"] < 0.05
