// Motion timeline of a screen recording: the per-frame changed-pixel fraction, grouped into bursts.
import { execFileSync } from 'node:child_process';

const SCALE_WIDTH_PX = 180;
const PIXEL_DELTA = 10;
const CHANGED_FRACTION = 0.0008;
const BURST_GAP_S = 0.12;
const ANALYSIS_FPS = 60;
const FRAME_OUTPUT_LIMIT_BYTES = 1 << 30;
const round3 = (value) => Math.round(value * 1000) / 1000;

function videoSize(video) {
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        video,
      ],
      { encoding: 'utf8' }
    )
  );
  return probe.streams[0];
}

function changedFractions(raw, frameSize, count) {
  const frames = [];
  for (let i = 1; i < count; i += 1) {
    let changed = 0;
    const a = (i - 1) * frameSize;
    const b = i * frameSize;
    for (let p = 0; p < frameSize; p += 1) {
      if (Math.abs(raw[a + p] - raw[b + p]) > PIXEL_DELTA) changed += 1;
    }
    frames.push({ t: i / ANALYSIS_FPS, fraction: changed / frameSize });
  }
  return frames;
}

function groupBursts(frames) {
  const bursts = [];
  for (const frame of frames.filter((candidate) => candidate.fraction > CHANGED_FRACTION)) {
    const last = bursts.at(-1);
    if (last && frame.t - last.end <= BURST_GAP_S) {
      last.end = frame.t;
      last.frames += 1;
      last.peak = Math.max(last.peak, frame.fraction);
    } else {
      bursts.push({ start: frame.t, end: frame.t, frames: 1, peak: frame.fraction });
    }
  }
  return bursts;
}

// crop is { x, y, w, h } in source pixels; the whole frame by default.
export function motionTimeline(video, crop = null) {
  const { width, height } = videoSize(video);
  const c = crop ?? { x: 0, y: 0, w: width, h: height };
  const outHeight = Math.max(2, Math.round(((c.h / c.w) * SCALE_WIDTH_PX) / 2) * 2);
  // Screen recordings are variable-rate with repeated timestamps; a constant-rate resample gives
  // every frame a known time at ANALYSIS_FPS.
  const filter = `fps=${ANALYSIS_FPS},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${SCALE_WIDTH_PX}:${outHeight},format=gray`;
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'fatal', '-i', video, '-vf', filter, '-f', 'rawvideo', '-'],
    {
      maxBuffer: FRAME_OUTPUT_LIMIT_BYTES,
    }
  );
  const frameSize = SCALE_WIDTH_PX * outHeight;
  const count = Math.floor(raw.length / frameSize);
  const bursts = groupBursts(changedFractions(raw, frameSize, count));
  return {
    video,
    size: [width, height],
    crop: c,
    frameCount: count,
    durationS: count ? round3((count - 1) / ANALYSIS_FPS) : 0,
    bursts: bursts.map((burst) => ({
      start: round3(burst.start),
      end: round3(burst.end),
      spanMs: Math.round((burst.end - burst.start) * 1000),
      frames: burst.frames,
      peak: round3(burst.peak),
    })),
  };
}
