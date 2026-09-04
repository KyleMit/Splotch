# Playwright CI setup timing — offline apt cache validation (2026-08-18)

Evidence base for the [ADR-0126](../adrs/0126-auto-recover-network-starved-playwright-setup.md)
amendment (PR [1127](https://github.com/KyleMit/Splotch/pull/1127)). All durations are the `Run
./.github/actions/setup-playwright` step on `ubuntu-latest`, runner image 20260810.271.1, Playwright
1.62.1, warm Actions caches throughout.

## The defect these numbers exposed

Every "before" run restored a complete apt `.deb` cache and then ignored it: `apt-get install
--no-download <local debs>` refuses command-line local debs as fetches (`E: Unable to fetch some
archives`), so the offline step could never install a missing package and every run fell through to
`apt-get update` + the full package download. Setup time therefore tracked whatever bandwidth the
runner drew. Run [32154808944](https://github.com/KyleMit/Splotch/actions/runs/32154808944) shows
the spread inside a single run: one chromium shard finished setup in 28s at 65 MB/s while its
sibling fetched at 245 kB/s until the then-180s bound killed it two packages short of done.

## Before (network path on every run, main, 2026-08-18)

| Sample set                      | Step duration      |
| ------------------------------- | ------------------ |
| Chromium shards (12 samples)    | 15–33s, mean ~21s  |
| WebKit smoke (4 samples)        | 36–94s, mean ~63s  |
| Starved-runner tail (run above) | 203s → job failure |

## After (`dpkg -i` offline path, PR 1127 run 32157091433, attempts 1–3)

| Job          | Attempt 1 | Attempt 2 | Attempt 3 |
| ------------ | --------- | --------- | --------- |
| Tests 1/3    | 10s       | 14s       | 14s       |
| Tests 2/3    | 17s       | 12s       | 11s       |
| Tests 3/3    | 12s       | 19s       | 16s       |
| WebKit smoke | 32s       | 47s       | 21s       |

Log verification on every checked attempt: apt cache hit → `dpkg -i` installed the set offline (9
font debs for chromium, ~110 GStreamer packages for webkit) → `install-deps --dry-run` reported the
set complete → both network steps skipped with `duration_ms=0`. The residual WebKit spread is local
dpkg unpack/configure time, which cannot stall on a mirror.

## Reproduction (Ubuntu 24.04)

```bash
apt-get download xfonts-cyrillic xfonts-utils xfonts-encodings
dpkg -r xfonts-cyrillic
apt-get install -y --no-install-recommends --no-download ./xfonts-cyrillic_*.deb  # exit 100
dpkg -i ./*.deb                                                                   # exit 0, offline
```

## Post-merge state

The first `warm-playwright-cache.yml` run
([32161701332](https://github.com/KyleMit/Splotch/actions/runs/32161701332)) completed both browser
sets in ~50s per job (setup step 15s chromium / 18s webkit), the warm-cache no-op profile. The save
path — a run that rebuilds a rotated key — has not been observed yet; the next runner-image rotation
exercises it.
