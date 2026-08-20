from pathlib import Path

import pytest

from centerline_tracing import cli


def test_failed_batch_does_not_promote_partial_outputs(tmp_path, monkeypatch) -> None:
    first_output = tmp_path / "out" / "first.svg"
    second_output = tmp_path / "out" / "second.svg"
    manifest = tmp_path / "out" / "manifest.json"
    first_output.parent.mkdir()
    first_output.write_text("baseline")
    jobs = [
        cli.TraceJob(tmp_path / "first.svg", first_output),
        cli.TraceJob(tmp_path / "second.svg", second_output),
    ]

    def fake_trace(job: cli.TraceJob, _workspace: Path, _config: cli.TraceConfig):
        if job is jobs[1]:
            raise RuntimeError("synthetic failure")
        return "<svg/>", {"metrics": {"error": 0, "wobble": 0, "strokesEmitted": 1}}, 0.0

    monkeypatch.setattr(cli, "trace_one", fake_trace)

    assert cli.trace_jobs(jobs, manifest, cli.TraceConfig()) == 1
    assert first_output.read_text() == "baseline"
    assert not second_output.exists()
    assert not manifest.exists()


def test_batch_staging_uses_the_output_filesystem(tmp_path, monkeypatch) -> None:
    output_parent = tmp_path / "outputs"
    manifest_parent = tmp_path / "manifests"
    output_parent.mkdir()
    manifest_parent.mkdir()
    output = output_parent / "line.svg"
    manifest = manifest_parent / "manifest.json"
    job = cli.TraceJob(tmp_path / "line.svg", output)
    observed: dict[str, object] = {}
    real_mkdtemp = cli.tempfile.mkdtemp

    def fake_trace(_job: cli.TraceJob, _workspace: Path, _config: cli.TraceConfig):
        return "<svg/>", {"metrics": {"error": 0, "wobble": 0, "strokesEmitted": 1}}, 0.0

    def capture_mkdtemp(*, prefix: str, dir: Path) -> str:
        observed.update(prefix=prefix, parent=dir)
        return real_mkdtemp(prefix=prefix, dir=dir)

    monkeypatch.setattr(cli, "trace_one", fake_trace)
    monkeypatch.setattr(cli.tempfile, "mkdtemp", capture_mkdtemp)

    assert cli.trace_jobs([job], manifest, cli.TraceConfig()) == 0
    assert observed == {"prefix": ".centerline-tracing-", "parent": output_parent}
    assert output.read_text() == "<svg/>"
    assert manifest.exists()


def test_cross_filesystem_targets_fail_before_tracing(tmp_path, monkeypatch) -> None:
    output = tmp_path / "output" / "line.svg"
    manifest = tmp_path / "manifest" / "manifest.json"
    job = cli.TraceJob(tmp_path / "line.svg", output)

    class FakeParent:
        def __init__(self, device: int) -> None:
            self.device = device

        def stat(self):
            return type("Stat", (), {"st_dev": self.device})()

    output_parent = FakeParent(1)
    manifest_parent = FakeParent(2)
    monkeypatch.setattr(
        cli,
        "_nearest_existing_parent",
        lambda path: output_parent if path == output else manifest_parent,
    )

    with pytest.raises(ValueError, match="share a filesystem"):
        cli._promotion_workspace_parent([job], manifest)


def test_measured_scale_defaults_are_named_and_source_specific(tmp_path) -> None:
    default = cli.TraceConfig()

    assert default.for_source(tmp_path / "house-tall.svg").scale == cli.DEFAULT_RASTER_SCALE
    assert (
        default.for_source(tmp_path / "sun-square.svg").scale
        == cli.THIN_DETAIL_RASTER_SCALE
    )


def test_promotion_failure_restores_every_replaced_output(tmp_path, monkeypatch) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    first_staged = workspace / "first.svg"
    second_staged = workspace / "second.svg"
    first_target = tmp_path / "first.svg"
    second_target = tmp_path / "second.svg"
    first_staged.write_text("new first")
    second_staged.write_text("new second")
    first_target.write_text("old first")
    second_target.write_text("old second")
    real_replace = cli.os.replace

    def fail_on_second_promotion(source: Path, target: Path) -> None:
        if source == second_staged:
            raise OSError("synthetic promotion failure")
        real_replace(source, target)

    monkeypatch.setattr(cli.os, "replace", fail_on_second_promotion)

    with pytest.raises(OSError, match="synthetic promotion failure"):
        cli._promote(
            [(first_staged, first_target), (second_staged, second_target)], workspace
        )

    assert first_target.read_text() == "old first"
    assert second_target.read_text() == "old second"
