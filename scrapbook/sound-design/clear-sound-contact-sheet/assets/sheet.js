// Audition rig for Splotch's drag-to-clear ("delete") sound.
//
// Every option below implements the same four-call contract the real app uses in
// web/src/lib/audio/drawingSound.ts — start / update(progress) / commit / cancel
// — so whichever one wins ports across without reshaping its call sites in
// dragToClear.ts. `progress` is raw normalized drag distance: 1 is the commit
// threshold, and the value keeps climbing past it while the button is held out.
//
// Sound files arrive as window.CLEAR_SHEET_SOUNDS = [{ name, url }], either
// relative asset paths (hosted build) or data: URIs (self-contained build).

(() => {
  'use strict';

  const COMMIT_PROGRESS = 1;
  const PITCH_CAP_PROGRESS = 1.4;
  const ONE_SHOT_TARGET_PEAK = 0.7;
  const LOOP_TARGET_RMS = 0.11;
  const NORMALIZE_MAX_GAIN = 10;
  const NORMALIZE_MIN_GAIN = 0.2;
  const ONSET_FLOOR_FRACTION = 0.02;
  const ONSET_GUARD_S = 0.004;
  const ENERGY_BINS = 600;
  const SILENCE_GAIN = 0.0001;

  // A ceiling on the way out. Several options stack voices — the shipped dots
  // overlap five deep on a flick — and once those are level-matched the sum can
  // pass unity and clip, which would decide the comparison on distortion.
  // A shaping curve rather than a DynamicsCompressorNode: Chrome's compressor
  // applies internal makeup gain (a 0.30 peak comes back out at 0.45), which
  // would undo the level matching this whole sheet depends on. This curve is
  // exactly linear below the threshold, so every option is untouched, and only
  // the densest moments bend toward the ceiling.
  const SOFT_CLIP_THRESHOLD = 0.7;
  const SOFT_CLIP_CURVE_SAMPLES = 2048;

  function softClipCurve() {
    const curve = new Float32Array(SOFT_CLIP_CURVE_SAMPLES);
    const range = 1 - SOFT_CLIP_THRESHOLD;
    for (let i = 0; i < SOFT_CLIP_CURVE_SAMPLES; i += 1) {
      const x = (i / (SOFT_CLIP_CURVE_SAMPLES - 1)) * 2 - 1;
      const magnitude = Math.abs(x);
      curve[i] =
        magnitude <= SOFT_CLIP_THRESHOLD
          ? x
          : Math.sign(x) *
            (SOFT_CLIP_THRESHOLD + range * Math.tanh((magnitude - SOFT_CLIP_THRESHOLD) / range));
    }
    return curve;
  }

  const settings = { volume: 0.8 };

  let ctx = null;
  let master = null;
  let analyser = null;
  let loading = null;
  const clips = new Map();

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  // 0 below `from`, 1 above `to`, smoothstep between — the crossfade window the
  // layered options use to bring one stem in over a slice of the drag.
  function window01(value, from, to) {
    const t = clamp((value - from) / (to - from), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function ensureAudio() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = settings.volume;
      const ceiling = ctx.createWaveShaper();
      ceiling.curve = softClipCurve();
      ceiling.oversample = '4x';
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // The analyser sits after the ceiling so the audit measures what is
      // actually heard, and its clipping guard still catches a curve that stops
      // doing its job.
      master.connect(ceiling);
      ceiling.connect(analyser);
      analyser.connect(ctx.destination);
      loading = loadClips();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return loading;
  }

  async function loadClips() {
    const manifest = window.CLEAR_SHEET_SOUNDS ?? [];
    await Promise.all(
      manifest.map(async ({ name, url }) => {
        try {
          clips.set(name, describeClip(await ctx.decodeAudioData(await clipBytes(url))));
        } catch {
          clips.set(name, null);
        }
      })
    );
    return clips;
  }

  // The self-contained build carries its clips as data: URIs, and fetch() of a
  // data: URI is governed by connect-src — a strict host CSP refuses it, which
  // silently costs the page every recorded sound while the synthesized ones keep
  // working. Decoding the base64 directly asks the network for nothing.
  async function clipBytes(url) {
    if (!url.startsWith('data:')) return (await fetch(url)).arrayBuffer();
    const binary = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // Generated clips arrive at wildly different levels, so each is measured once on
  // decode: normalization keeps an A/B honest, the onset trims dead air off a
  // one-shot's attack, and the cumulative-energy curve lets the scrub option map
  // drag position onto *sound* rather than onto time, skipping any dead stretch
  // in the source recording.
  function describeClip(buffer) {
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const magnitude = Math.abs(data[i]);
      if (magnitude > peak) peak = magnitude;
      sumSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSquares / data.length);

    const floor = peak * ONSET_FLOOR_FRACTION;
    let onsetSample = 0;
    while (onsetSample < data.length && Math.abs(data[onsetSample]) < floor) onsetSample += 1;

    const energy = new Float32Array(ENERGY_BINS + 1);
    for (let bin = 0; bin < ENERGY_BINS; bin += 1) {
      const from = Math.floor((bin * data.length) / ENERGY_BINS);
      const to = Math.floor(((bin + 1) * data.length) / ENERGY_BINS);
      let binEnergy = 0;
      for (let i = from; i < to; i += 1) binEnergy += data[i] * data[i];
      energy[bin + 1] = energy[bin] + Math.sqrt(binEnergy / Math.max(1, to - from));
    }

    const normalize = (raw) => clamp(raw, NORMALIZE_MIN_GAIN, NORMALIZE_MAX_GAIN);
    return {
      buffer,
      peak,
      rms,
      duration: buffer.duration,
      onset: Math.max(0, onsetSample / buffer.sampleRate - ONSET_GUARD_S),
      oneShotGain: normalize(ONE_SHOT_TARGET_PEAK / (peak || 1)),
      loopGain: normalize(LOOP_TARGET_RMS / (rms || 1)),
      energy,
    };
  }

  const clipFor = (name) => clips.get(name) ?? null;

  // Drag position → the time in the source buffer holding that share of its total
  // energy, so a recording with a silent patch never parks the playhead in it.
  function energyPosition(clip, unit) {
    const target = clip.energy[ENERGY_BINS] * clamp(unit, 0, 1);
    let low = 0;
    let high = ENERGY_BINS;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (clip.energy[mid] < target) low = mid + 1;
      else high = mid;
    }
    return (low / ENERGY_BINS) * clip.duration;
  }

  let noise = null;
  function noiseBuffer() {
    if (!noise) {
      const length = ctx.sampleRate * 2;
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function gainNode(value, destination) {
    const node = ctx.createGain();
    node.gain.value = value;
    node.connect(destination);
    return node;
  }

  function filterNode(type, frequency, q, destination) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    node.connect(destination);
    return node;
  }

  function decayEnvelope(node, peak, attackS, durationS, startAt = ctx.currentTime) {
    node.gain.setValueAtTime(SILENCE_GAIN, startAt);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, SILENCE_GAIN * 2), startAt + attackS);
    node.gain.exponentialRampToValueAtTime(SILENCE_GAIN, startAt + durationS);
  }

  function disposeOnEnd(source, ...nodes) {
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  // Returns the source purely so the audit's clip probe can cut a long recording
  // short; production callers fire and forget.
  function playOneShot(name, out, level = 1) {
    const clip = clipFor(name);
    if (!clip || level <= 0) return null;
    const gain = gainNode(clip.oneShotGain * level, out);
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(gain);
    disposeOnEnd(source, gain);
    source.start(ctx.currentTime, clip.onset);
    return source;
  }

  function startLoop(name, out, level = 0) {
    const clip = clipFor(name);
    if (!clip) return null;
    const gain = gainNode(level, out);
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.loop = true;
    source.connect(gain);
    source.start(ctx.currentTime, Math.random() * clip.duration);
    return { source, gain, unit: clip.loopGain };
  }

  function rampTo(param, value, seconds = 0.06) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function fadeOutAndStop(layer, seconds) {
    if (!layer) return;
    rampTo(layer.gain.gain, 0, seconds);
    layer.source.stop(ctx.currentTime + seconds + 0.03);
    disposeOnEnd(layer.source, layer.gain);
  }

  function noiseBurst(out, { peak, durationS, frequency, q = 1, type = 'bandpass' }) {
    const gain = gainNode(SILENCE_GAIN, out);
    decayEnvelope(gain, peak, 0.002, durationS);
    const filter = filterNode(type, frequency, q, gain);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer();
    source.connect(filter);
    disposeOnEnd(source, filter, gain);
    source.start(ctx.currentTime, Math.random());
    source.stop(ctx.currentTime + durationS);
  }

  function tone(out, { frequency, endFrequency = frequency, peak, attackS, durationS, type = 'sine', glideS }) {
    const gain = gainNode(SILENCE_GAIN, out);
    decayEnvelope(gain, peak, attackS, durationS);
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== frequency) {
      osc.frequency.exponentialRampToValueAtTime(endFrequency, now + (glideS ?? durationS));
    }
    osc.connect(gain);
    disposeOnEnd(osc, gain);
    osc.start(now);
    osc.stop(now + durationS);
  }

  const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9];

  function ladderFrequency(baseHz, step) {
    const degree = PENTATONIC_SEMITONES[step % PENTATONIC_SEMITONES.length];
    const octave = Math.floor(step / PENTATONIC_SEMITONES.length);
    return baseHz * Math.pow(2, (degree + 12 * octave) / 12);
  }

  // Shared bookkeeping every engine needs: the ready-zone crossing (the moment of
  // no return, which today only speaks through haptics), a repeating pulse while
  // held there, and teardown that cannot leave a loop running.
  function engineBase(out, level) {
    const bus = gainNode(level, out);
    const layers = [];
    const timers = [];
    let ready = false;

    return {
      bus,
      track(layer) {
        if (layer) layers.push(layer);
        return layer;
      },
      pulse(intervalMs, fn) {
        timers.push(setInterval(fn, intervalMs));
      },
      stopPulses() {
        for (const id of timers) clearInterval(id);
        timers.length = 0;
      },
      crossing(progress, onEnter, onExit) {
        const nowReady = progress >= COMMIT_PROGRESS;
        if (nowReady === ready) return;
        ready = nowReady;
        if (nowReady) onEnter();
        else onExit();
      },
      get isReady() {
        return ready;
      },
      teardown(fadeS = 0.12) {
        this.stopPulses();
        for (const layer of layers) fadeOutAndStop(layer, fadeS);
        layers.length = 0;
        rampTo(bus.gain, 0, fadeS);
        setTimeout(() => bus.disconnect(), (fadeS + 0.1) * 1000);
      },
    };
  }

  // Every card plays its commit clip at the same level, so switching the commit
  // sound compares clips rather than card mixes. The drag beds are matched
  // separately, by measured loudness (tools/scrapbook/clear-sound-sheet/audit.mjs).
  const COMMIT_LEVEL = 0.5;
  // web/src/lib/audio/drawingSound.ts plays the pencil-scratch loop at this gain
  // while its clear bubbles top out at 0.035 — the shipped clear drag is roughly
  // a sixth of the app's own drawing sound. Matching the two here keeps the
  // baseline card audible next to the rest instead of losing on volume alone.
  const APP_SCRATCH_GAIN = 0.2;
  const BASELINE_DOT_PROGRESS_STEP = 0.055;
  const BASELINE_START_HZ = 420;
  const BASELINE_END_HZ = 1050;
  const BASELINE_PITCH_VARIATION = 0.06;
  const BASELINE_PITCH_START_RATIO = 1.18;
  const BASELINE_PITCH_SETTLE_S = 0.028;
  const BASELINE_GAIN_MIN = 0.012;
  const BASELINE_GAIN_MAX = 0.035;
  const BASELINE_GAIN_EXPONENT = 1.2;
  const BASELINE_ATTACK_S = 0.004;
  const BASELINE_DURATION_S = 0.085;
  // A flick fires dots faster than their 85 ms envelope decays — about five of
  // them overlap and sum — so matching the pencil gain outright would clip that
  // stack. This backs the match off to keep the densest gesture under unity.
  const BASELINE_OVERLAP_HEADROOM = 0.77;
  const BASELINE_LEVEL_MATCH =
    (APP_SCRATCH_GAIN / BASELINE_GAIN_MAX) * BASELINE_OVERLAP_HEADROOM;

  const BUBBLE_BASE_HZ = 262;
  const BUBBLE_DURATION_S = 0.11;
  const BUBBLE_RISE_START_RATIO = 0.86;
  const BUBBLE_RISE_END_RATIO = 1.08;
  const BUBBLE_DROPLET_RATIO = 3.2;

  const XYLO_BASE_HZ = 294;
  const XYLO_BAR_PARTIAL_RATIO = 3.01;
  const XYLO_BODY_DECAY_S = 0.26;
  const XYLO_PARTIAL_DECAY_S = 0.09;
  const XYLO_MALLET_HZ = 2600;

  const BALLOON_RATE_MIN = 0.9;
  const BALLOON_RATE_MAX = 1.3;
  const BALLOON_CUTOFF_MIN_HZ = 600;
  const BALLOON_CUTOFF_MAX_HZ = 5200;
  const BALLOON_BAND_MIN_HZ = 320;
  const BALLOON_BAND_MAX_HZ = 2600;
  const BALLOON_BAND_Q_MIN = 1;
  const BALLOON_BAND_Q_MAX = 7;
  const BALLOON_HISS_GAIN = 0.26;
  const BALLOON_WOBBLE_MIN_HZ = 6;
  const BALLOON_WOBBLE_MAX_HZ = 11;
  const BALLOON_WOBBLE_DEPTH = 0.28;

  const GRAIN_S = 0.09;
  const GRAIN_INTERVAL_S = 0.045;
  const GRAIN_READY_INTERVAL_S = 0.03;
  const GRAIN_JITTER_S = 0.015;
  const SCHEDULER_TICK_MS = 25;
  const SCHEDULER_LOOKAHEAD_S = 0.12;
  const SCRUB_CUTOFF_MIN_HZ = 900;
  const SCRUB_CUTOFF_MAX_HZ = 14000;

  const STEM_CUTOFF_MIN_HZ = 600;
  const STEM_CUTOFF_MAX_HZ = 12000;
  const STEM_SHIMMER_WOBBLE_HZ = 5.5;
  const STEM_SHIMMER_WOBBLE_DEPTH = 0.3;

  const ROCKET_WHINE_MIN_HZ = 55;
  const ROCKET_WHINE_MAX_HZ = 190;
  const ROCKET_CUTOFF_MIN_HZ = 300;
  const ROCKET_CUTOFF_MAX_HZ = 6000;
  const ROCKET_COUNTDOWN_INTERVAL_MS = 460;
  const ROCKET_COUNTDOWN_HZ = [660, 790, 990];

  const DETENT_COUNT = 9;
  const DETENT_TICK_HZ = 2600;
  const DETENT_TONE_MIN_HZ = 780;
  const DETENT_TONE_MAX_HZ = 1420;
  const DETENT_READY_INTERVAL_MS = 900;

  // ---- The ladder ----------------------------------------------------------
  // Distance becomes a note. The first version spent ten of its thirteen notes
  // before the threshold and stopped dead at 1.4× it, so continuing to pull past
  // the point of no return produced almost nothing — which is why the treatment
  // that relies on exactly that had nothing to be heard doing. The approach and
  // the climb past it are now sized separately, out to a reach no thumb exceeds.
  const LADDER_APPROACH_NOTES = 9;
  const LADDER_CLIMB_NOTES = 9;
  const LADDER_WIDE_CLIMB_NOTES = 5;
  const LADDER_REACH_PROGRESS = 2.6;
  // The top of a long pull lands near 2.8 kHz, where a small bubble belongs but a
  // toddler's ear does not want it at full level. A gentle roll-off above the knee
  // keeps the last notes present without making them the loudest thing in the run.
  const LADDER_ROLLOFF_KNEE_HZ = 1400;
  const LADDER_ROLLOFF_EXPONENT = 0.6;

  function ladderStep(progress, climbNotes = LADDER_CLIMB_NOTES) {
    if (progress <= COMMIT_PROGRESS) {
      return Math.round(clamp(progress, 0, 1) * LADDER_APPROACH_NOTES);
    }
    const past = clamp(
      (progress - COMMIT_PROGRESS) / (LADDER_REACH_PROGRESS - COMMIT_PROGRESS),
      0,
      1
    );
    return LADDER_APPROACH_NOTES + Math.round(past * climbNotes);
  }

  function rolloffFor(frequency) {
    return Math.min(1, (LADDER_ROLLOFF_KNEE_HZ / frequency) ** LADDER_ROLLOFF_EXPONENT);
  }

  // ---- Past-threshold treatments -------------------------------------------
  // Every option here refuses to start a new sound when the drag arms. A chime
  // that fires at the threshold and then stops reads as "done" — the gesture is
  // announcing a result it has not produced yet — and a sustained pad under the
  // hold is simply too much noise for a drawing app aimed at two-year-olds. What
  // is left is the honest model the app already uses for the pencil: the sound
  // tracks the hand, and resting is quiet.

  const OPEN_FIFTH_RATIO = 1.5;
  const OPEN_FIFTH_LEVEL = 0.42;
  const SETTLE_SUSTAIN_SCALE = 2.6;
  // drawingSound.ts scales the pencil-scratch loop to silence below this pointer
  // speed; the hand-speed treatment reuses the same curve for the clear ladder so
  // the two feedbacks answer the hand the same way.
  const SPEED_FULL_LEVEL_PER_S = 1.6;
  const SPEED_FLOOR_LEVEL = 0.25;
  const TRILL_INTERVAL_MS = 250;
  const TRILL_DROP_RATIO = 2 ** (-3 / 12);

  const THRESHOLD_TREATMENTS = [
    {
      value: 'climb',
      label: 'Keep climbing',
      sustains: false,
      note: 'Nothing new happens at the ring. The ladder keeps climbing as long as the hand keeps pulling, and goes quiet when the hand stops, the same rule the pencil sound follows. Nine more notes sit past the ring.',
      create: ({ voice }) => ({
        enter() {},
        step(frequency) {
          voice({ frequency });
        },
        exit() {},
        stop() {},
      }),
    },
    {
      value: 'widen',
      label: 'Climb, then widen',
      sustains: false,
      climbNotes: LADDER_WIDE_CLIMB_NOTES,
      note: 'The same climb, but past the ring the notes are spaced further apart, so the melody slows down as you keep pulling. The slowdown is the only signal that you have crossed.',
      create: ({ voice }) => ({
        enter() {},
        step(frequency) {
          voice({ frequency });
        },
        exit() {},
        stop() {},
      }),
    },
    {
      value: 'open',
      label: 'Climb, opening up',
      sustains: false,
      note: 'Past the ring every note gets a quiet fifth above it. Still one note per step and still silent when you stop; the run just gets wider.',
      create: ({ voice }) => ({
        enter() {},
        step(frequency) {
          voice({ frequency });
          voice({ frequency: frequency * OPEN_FIFTH_RATIO, level: OPEN_FIFTH_LEVEL });
        },
        exit() {},
        stop() {},
      }),
    },
    {
      value: 'settle',
      label: 'Climb, longer notes',
      sustains: false,
      note: 'Past the ring each note rings about two and a half times longer, so a moving hand hears the notes overlap. Stop and the last note fades out on its own.',
      create: ({ voice }) => ({
        enter() {},
        step(frequency) {
          voice({ frequency, sustainScale: SETTLE_SUSTAIN_SCALE });
        },
        exit() {},
        stop() {},
      }),
    },
    {
      value: 'speed',
      label: 'Hand-speed climb',
      sustains: false,
      note: 'Loudness follows hand speed, on the curve the pencil sound already uses. A fast pull is loud and a slow careful pull is nearly a whisper.',
      create: ({ voice, speed }) => ({
        enter() {},
        step(frequency) {
          voice({ frequency, level: speedLevel(speed()) });
        },
        exit() {},
        stop() {},
      }),
    },
    {
      value: 'trill',
      label: 'Repeating trill (previous build)',
      sustains: true,
      note: 'What the previous build did: a steady repeating dot for as long as you hold, whether or not the hand moves. Here as the thing to beat.',
      create: ({ voice, pulse, stopPulses }) => {
        let frequency = 0;
        let high = true;
        return {
          enter(entered) {
            frequency = entered;
            pulse(TRILL_INTERVAL_MS, () => {
              voice({ frequency: high ? frequency : frequency * TRILL_DROP_RATIO, level: 0.45 });
              high = !high;
            });
          },
          step(next) {
            frequency = next;
            voice({ frequency: next });
          },
          exit: stopPulses,
          stop: stopPulses,
        };
      },
    },
  ];

  const DEFAULT_TREATMENT = THRESHOLD_TREATMENTS[0].value;

  function speedLevel(progressPerSecond) {
    return SPEED_FLOOR_LEVEL + (1 - SPEED_FLOOR_LEVEL) * clamp(progressPerSecond / SPEED_FULL_LEVEL_PER_S, 0, 1);
  }

  // The three pitched voices differ only in their timbre and in how drag distance
  // becomes a note, so they share one engine: `nextNote` reports the frequency the
  // hand is pointing at and whether that is a new note, and everything about the
  // armed state is delegated to the selected treatment.
  function pitchedEngine({ out, level, controls, buildVoice, buildNextNote, cancelTail }) {
    const base = engineBase(out, level);
    const rawVoice = buildVoice(base.bus);
    const voice = ({ frequency, level: noteLevel = 1, sustainScale = 1 }) =>
      rawVoice({ frequency, level: noteLevel * rolloffFor(frequency), sustainScale });
    const treatment =
      THRESHOLD_TREATMENTS.find((entry) => entry.value === controls.threshold()) ??
      THRESHOLD_TREATMENTS[0];
    const nextNote = buildNextNote(treatment.climbNotes ?? LADDER_CLIMB_NOTES);

    let progressPerSecond = 0;
    let lastProgress = 0;
    let lastAt = 0;
    let lastFrequency = 0;

    const held = treatment.create({
      out,
      voice,
      speed: () => progressPerSecond,
      pulse: (intervalMs, fn) => base.pulse(intervalMs, fn),
      stopPulses: () => base.stopPulses(),
    });

    return {
      start() {
        lastAt = performance.now();
      },
      update(progress) {
        const now = performance.now();
        const elapsed = Math.max(now - lastAt, 1) / 1000;
        progressPerSecond = Math.abs(progress - lastProgress) / elapsed;
        lastProgress = progress;
        lastAt = now;

        const { frequency, changed } = nextNote(Math.max(progress, 0));
        lastFrequency = frequency;
        // No treatment makes a sound in enter() any more — arming only sets up
        // state — so the note that lands on the crossing is played normally
        // instead of being swallowed by it.
        base.crossing(progress, () => held.enter(frequency), () => held.exit());
        if (!changed) return;
        if (base.isReady) held.step(frequency);
        else voice({ frequency });
      },
      commit(commitSound) {
        held.stop(0.05);
        base.teardown(0.05);
        playOneShot(commitSound, out, COMMIT_LEVEL);
      },
      cancel() {
        held.stop(0.05);
        const tailMs = cancelTail(voice, lastFrequency);
        setTimeout(() => base.teardown(0.06), tailMs);
      },
    };
  }

  // Walking down the scale the drag just walked up — the ladder unwinding, and
  // the only thing in the gesture that says the drawing survived.
  function descendingTail(voice, frequency, { notes, semitones, spacingMs, level }) {
    for (let i = 0; i < notes; i += 1) {
      setTimeout(
        () => voice({ frequency: frequency * 2 ** ((-semitones * (i + 1)) / 12), level }),
        i * spacingMs
      );
    }
    return notes * spacingMs + 160;
  }

  const OPTIONS = [
    {
      id: 'bubble-ladder',
      name: 'Bubble Ladder',
      tag: 'shipped',
      chosen: true,
      hue: 'var(--c-blue)',
      blurb:
        'Water bubbles that snap to a pentatonic scale. Dragging out plays a rising melody and dragging back plays it in reverse.',
      notes: [
        'Snapping to a scale removes the pitch wobble of a continuous glide, so every dot is in tune with the one before it.',
        'A dot fires when the note changes rather than at a fixed distance, so the rhythm follows the hand.',
        'Ten notes lead up to the ring and nine more sit past it, so a long pull keeps producing melody instead of running out.',
        'Each bubble chirps upward the way a real bubble does, with a small droplet tick on the attack.',
        'Letting go short of the ring walks three bubbles back down the scale.',
      ],
      commit: 'commit-page-crisp',
      level: 0.97,
      threshold: true,
      create(out, controls) {
        return pitchedEngine({
          out,
          level: this.level,
          controls,
          buildVoice: (bus) => ({ frequency, level = 1, sustainScale = 1 }) => {
            const sustainS = BUBBLE_DURATION_S * sustainScale;
            tone(bus, {
              frequency: frequency * BUBBLE_RISE_START_RATIO,
              endFrequency: frequency * BUBBLE_RISE_END_RATIO,
              glideS: Math.min(sustainS, BUBBLE_DURATION_S),
              peak: 0.22 * level,
              attackS: 0.003,
              durationS: sustainS,
            });
            noiseBurst(bus, {
              peak: 0.06 * level,
              durationS: 0.014,
              frequency: frequency * BUBBLE_DROPLET_RATIO,
              q: 6,
            });
          },
          buildNextNote: (climbNotes) => {
            let lastStep = -1;
            return (progress) => {
              const step = ladderStep(progress, climbNotes);
              const changed = step !== lastStep;
              lastStep = step;
              return { frequency: ladderFrequency(BUBBLE_BASE_HZ, step), changed };
            };
          },
          cancelTail: (voice, frequency) =>
            descendingTail(voice, frequency, {
              notes: 3,
              semitones: 3,
              spacingMs: 55,
              level: 0.4,
            }),
        });
      },
    },

    {
      id: 'xylophone',
      name: 'Toy Xylophone',
      tag: 'candidate',
      hue: 'var(--c-yellow)',
      blurb:
        'The same distance-to-note ladder played on a wooden toy xylophone: mallet click, bar overtone, fast decay.',
      notes: [
        'A struck-bar tone (fundamental plus an inharmonic overtone) reads as an object being played rather than a synthesizer.',
        'Fifteen bars across the full pull, so a longer drag is a longer run.',
        'Carries the longer-notes option most naturally, because a ringing bar is what a real mallet leaves behind.',
      ],
      commit: 'commit-page-crisp',
      level: 0.53,
      threshold: true,
      create(out, controls) {
        return pitchedEngine({
          out,
          level: this.level,
          controls,
          buildVoice: (bus) => ({ frequency, level = 1, sustainScale = 1 }) => {
            const sustainS = XYLO_BODY_DECAY_S * sustainScale;
            tone(bus, { frequency, peak: 0.24 * level, attackS: 0.002, durationS: sustainS });
            tone(bus, {
              frequency: frequency * XYLO_BAR_PARTIAL_RATIO,
              peak: 0.07 * level,
              attackS: 0.001,
              durationS: Math.min(sustainS, XYLO_PARTIAL_DECAY_S),
            });
            noiseBurst(bus, {
              peak: 0.09 * level,
              durationS: 0.008,
              frequency: XYLO_MALLET_HZ,
              q: 1,
            });
          },
          buildNextNote: (climbNotes) => {
            let lastStep = -1;
            return (progress) => {
              const step = ladderStep(progress, climbNotes);
              const changed = step !== lastStep;
              lastStep = step;
              return { frequency: ladderFrequency(XYLO_BASE_HZ, step), changed };
            };
          },
          cancelTail: (voice, frequency) =>
            descendingTail(voice, frequency, {
              notes: 2,
              semitones: 4,
              spacingMs: 70,
              level: 0.35,
            }),
        });
      },
    },

    {
      id: 'baseline',
      name: 'Previous build',
      tag: 'before',
      hue: 'var(--faint)',
      blurb:
        'The build this replaced, ported faithfully: sine bubble dots on a fixed distance gate and a continuous pitch glide.',
      notes: [
        'Level-matched to the other cards so the comparison is about character, not loudness.',
        'Pitch glides continuously, so two neighbouring dots can land slightly out of tune with each other.',
        'On a fast flick the distance gate fires about fifteen dots in a quarter of a second, so a quick clear sounds like a buzz rather than bubbles.',
        'Cancel is silent, unlike the two voices beside it. The audit asserts that rather than excusing it: nothing tells a child the drawing survived.',
        'Its release clip plays at the sheet’s shared level rather than the level it shipped at, so the Release picker compares clips instead of card mixes.',
      ],
      commit: 'baseline-clear-pop',
      silentCancel: true,
      level: BASELINE_LEVEL_MATCH,
      threshold: true,
      defaultThreshold: 'trill',
      create(out, controls) {
        let dotProgress = 0;
        return pitchedEngine({
          out,
          level: this.level,
          controls,
          buildVoice: (bus) => ({ frequency, level = 1, sustainScale = 1 }) => {
            const sustainS = BASELINE_DURATION_S * sustainScale;
            const variation = 1 + (Math.random() * 2 - 1) * BASELINE_PITCH_VARIATION;
            const peak =
              (BASELINE_GAIN_MIN +
                (BASELINE_GAIN_MAX - BASELINE_GAIN_MIN) *
                  Math.pow(dotProgress, BASELINE_GAIN_EXPONENT)) *
              level;
            tone(bus, {
              frequency: frequency * variation * BASELINE_PITCH_START_RATIO,
              endFrequency: frequency * variation,
              glideS: BASELINE_PITCH_SETTLE_S,
              peak,
              attackS: BASELINE_ATTACK_S,
              durationS: sustainS,
            });
          },
          buildNextNote: () => {
            let lastProgress = 0;
            return (progress) => {
              dotProgress = Math.min(progress / LADDER_REACH_PROGRESS, 1);
              const changed =
                Math.abs(dotProgress - lastProgress) >= BASELINE_DOT_PROGRESS_STEP;
              if (changed) lastProgress = dotProgress;
              return {
                frequency:
                  BASELINE_START_HZ *
                  Math.pow(BASELINE_END_HZ / BASELINE_START_HZ, dotProgress),
                changed,
              };
            };
          },
          cancelTail: () => 0,
        });
      },
    },

    {
      id: 'balloon',
      secondary: true,
      name: 'Balloon Inflate',
      tag: 'set aside',
      hue: 'var(--c-red)',
      blurb:
        'Pulling stretches a balloon: rubber creak and a tightening hiss. Past the ring it wobbles. Let go early and it deflates.',
      notes: [
        'Noise-based, so tracking the hand exactly never produces the harsh glide of a bare oscillator, which is why the continuous-tone option was rejected.',
        'Two layers move together: a recorded rubber-stretch loop that speeds up, and a filtered noise band whose centre climbs and narrows.',
        'The ring cue is physical rather than musical: a wobble that says “about to burst” without adding a new sound.',
        'Cancel has an answer here: the deflating squeak, which is what a child expects when they pull back.',
      ],
      commit: 'commit-pop-sparkle',
      level: 0.46,
      create(out) {
        const base = engineBase(out, this.level);
        const wobble = gainNode(1, base.bus);
        const wobbleDepth = gainNode(0, wobble.gain);
        const wobbleOsc = ctx.createOscillator();
        wobbleOsc.frequency.value = BALLOON_WOBBLE_MIN_HZ;
        wobbleOsc.connect(wobbleDepth);
        wobbleOsc.start();

        const stretchFilter = filterNode('lowpass', BALLOON_CUTOFF_MIN_HZ, 0.9, wobble);
        const stretch = base.track(startLoop('stem-balloon-stretch', stretchFilter, 0));

        const hissGain = gainNode(0, wobble);
        const hissBand = filterNode('bandpass', BALLOON_BAND_MIN_HZ, BALLOON_BAND_Q_MIN, hissGain);
        const hiss = ctx.createBufferSource();
        hiss.buffer = noiseBuffer();
        hiss.loop = true;
        hiss.connect(hissBand);
        hiss.start(ctx.currentTime, Math.random());
        base.track({ source: hiss, gain: hissGain });

        return {
          start() {},
          update(progress) {
            const drag = clamp(progress / PITCH_CAP_PROGRESS, 0, 1);
            base.crossing(
              progress,
              () => {
                rampTo(wobbleDepth.gain, BALLOON_WOBBLE_DEPTH, 0.18);
              },
              () => rampTo(wobbleDepth.gain, 0, 0.18)
            );
            const past = clamp((progress - COMMIT_PROGRESS) / (PITCH_CAP_PROGRESS - COMMIT_PROGRESS), 0, 1);
            rampTo(
              wobbleOsc.frequency,
              BALLOON_WOBBLE_MIN_HZ + (BALLOON_WOBBLE_MAX_HZ - BALLOON_WOBBLE_MIN_HZ) * past,
              0.12
            );
            if (stretch) {
              rampTo(stretch.source.playbackRate, BALLOON_RATE_MIN + (BALLOON_RATE_MAX - BALLOON_RATE_MIN) * drag, 0.1);
              rampTo(stretch.gain.gain, stretch.unit * window01(drag, 0, 0.5), 0.08);
            }
            rampTo(stretchFilter.frequency, BALLOON_CUTOFF_MIN_HZ + (BALLOON_CUTOFF_MAX_HZ - BALLOON_CUTOFF_MIN_HZ) * drag, 0.1);
            rampTo(hissBand.frequency, BALLOON_BAND_MIN_HZ + (BALLOON_BAND_MAX_HZ - BALLOON_BAND_MIN_HZ) * drag, 0.1);
            rampTo(hissBand.Q, BALLOON_BAND_Q_MIN + (BALLOON_BAND_Q_MAX - BALLOON_BAND_Q_MIN) * drag, 0.1);
            rampTo(hissGain.gain, BALLOON_HISS_GAIN * window01(drag, 0.02, 0.75), 0.08);
          },
          commit(commitSound) {
            base.teardown(0.03);
            wobbleOsc.stop(ctx.currentTime + 0.1);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            playOneShot('cancel-deflate', out, 0.5);
            base.teardown(0.22);
            wobbleOsc.stop(ctx.currentTime + 0.4);
          },
        };
      },
    },

    {
      id: 'scrub',
      secondary: true,
      name: 'Scrubbed Tape',
      tag: 'set aside',
      hue: 'var(--c-purple)',
      blurb:
        'The drag moves a playhead through one recording. Overlapping grains replay whatever moment the hand points at, in either direction.',
      notes: [
        'Pitch-shifting one recorded crescendo was rejected: the recording fought the gesture and speed changes sounded like a cartoon. Scrubbing keeps pitch true and lets position follow the hand.',
        'Holding still is not a special case: the grains keep overlapping at one spot and become a shimmering freeze, which is the armed state.',
        'Position maps through the clip’s cumulative energy rather than its duration, so a quiet patch in the recording is skipped instead of becoming a silent stretch of the drag.',
        'Swap the recording and the whole gesture changes with no code change. Try the zipper.',
      ],
      commit: 'commit-whoomp-gulp',
      level: 0.5,
      sources: [
        { value: 'scrub-bubble-cauldron', label: 'Bubbling water' },
        { value: 'scrub-zipper', label: 'Zipper' },
        { value: 'scrub-slide-whistle', label: 'Slide whistle' },
        { value: 'scrub-magic-riser', label: 'Magic riser' },
      ],
      create(out, controls) {
        const base = engineBase(out, this.level);
        const cutoff = filterNode('lowpass', SCRUB_CUTOFF_MIN_HZ, 0.8, base.bus);
        const bed = gainNode(0, cutoff);
        let progress = 0;
        let nextGrainAt = 0;

        const scheduleGrains = () => {
          const clip = clipFor(controls.source());
          if (!clip) return;
          const now = ctx.currentTime;
          if (nextGrainAt < now) nextGrainAt = now;
          const spacing = base.isReady ? GRAIN_READY_INTERVAL_S : GRAIN_INTERVAL_S;
          while (nextGrainAt < now + SCHEDULER_LOOKAHEAD_S) {
            const jitter = (Math.random() * 2 - 1) * GRAIN_JITTER_S;
            const offset = clamp(
              energyPosition(clip, progress / PITCH_CAP_PROGRESS) + jitter,
              0,
              Math.max(0, clip.duration - GRAIN_S)
            );
            const grain = gainNode(0, bed);
            grain.gain.setValueAtTime(0, nextGrainAt);
            grain.gain.linearRampToValueAtTime(clip.loopGain, nextGrainAt + GRAIN_S * 0.4);
            grain.gain.linearRampToValueAtTime(0, nextGrainAt + GRAIN_S);
            const source = ctx.createBufferSource();
            source.buffer = clip.buffer;
            source.connect(grain);
            disposeOnEnd(source, grain);
            source.start(nextGrainAt, offset, GRAIN_S);
            nextGrainAt += spacing;
          }
        };

        return {
          start() {
            base.pulse(SCHEDULER_TICK_MS, scheduleGrains);
          },
          update(next) {
            progress = Math.max(next, 0);
            const drag = clamp(progress / PITCH_CAP_PROGRESS, 0, 1);
            base.crossing(progress, () => {}, () => {});
            rampTo(bed.gain, 0.25 + 0.75 * drag, 0.08);
            rampTo(cutoff.frequency, SCRUB_CUTOFF_MIN_HZ + (SCRUB_CUTOFF_MAX_HZ - SCRUB_CUTOFF_MIN_HZ) * drag, 0.1);
          },
          commit(commitSound) {
            base.teardown(0.06);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            playOneShot('cancel-soft-settle', out, 0.3);
            base.teardown(0.18);
          },
        };
      },
    },

    {
      id: 'stems',
      secondary: true,
      name: 'Stacking Stems',
      tag: 'set aside',
      hue: 'var(--c-green)',
      blurb:
        'Three loops play from the start, all silent but one. Distance opens their faders in turn: hum, then sparkle, then shimmer.',
      notes: [
        'Nothing is pitched or stretched, so there is no artifact to hide and no fixed length to outrun. The gesture can last a quarter of a second or ten seconds.',
        'Overlapping crossfades mean the texture changes character, not just volume: a child hears which part of the pull they are in.',
        'A lowpass filter opens alongside the faders, which is what makes the top of the drag feel like arrival rather than just loud.',
        'Past the ring adds a slow tremolo on the shimmer loop only.',
        'The cost: three decoded loops in memory instead of one small pop. Worth measuring against the startup budget before shipping.',
      ],
      commit: 'commit-confetti-sparkle',
      level: 0.23,
      create(out) {
        const base = engineBase(out, this.level);
        const cutoff = filterNode('lowpass', STEM_CUTOFF_MIN_HZ, 0.7, base.bus);
        const wobble = gainNode(1, cutoff);
        const wobbleDepth = gainNode(0, wobble.gain);
        const wobbleOsc = ctx.createOscillator();
        wobbleOsc.frequency.value = STEM_SHIMMER_WOBBLE_HZ;
        wobbleOsc.connect(wobbleDepth);
        wobbleOsc.start();

        const hum = base.track(startLoop('stem-low-hum', cutoff, 0));
        const sparkle = base.track(startLoop('stem-mid-sparkle', cutoff, 0));
        const shimmer = base.track(startLoop('stem-high-shimmer', wobble, 0));

        return {
          start() {},
          update(progress) {
            const drag = clamp(progress / PITCH_CAP_PROGRESS, 0, 1);
            base.crossing(
              progress,
              () => {
                rampTo(wobbleDepth.gain, STEM_SHIMMER_WOBBLE_DEPTH, 0.25);
              },
              () => rampTo(wobbleDepth.gain, 0, 0.25)
            );
            if (hum) rampTo(hum.gain.gain, hum.unit * window01(drag, 0, 0.28), 0.09);
            if (sparkle) rampTo(sparkle.gain.gain, sparkle.unit * window01(drag, 0.2, 0.62), 0.09);
            if (shimmer) rampTo(shimmer.gain.gain, shimmer.unit * window01(drag, 0.45, 0.9), 0.09);
            rampTo(cutoff.frequency, STEM_CUTOFF_MIN_HZ + (STEM_CUTOFF_MAX_HZ - STEM_CUTOFF_MIN_HZ) * drag, 0.1);
          },
          commit(commitSound) {
            base.teardown(0.05);
            wobbleOsc.stop(ctx.currentTime + 0.2);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            playOneShot('cancel-soft-settle', out, 0.28);
            base.teardown(0.26);
            wobbleOsc.stop(ctx.currentTime + 0.5);
          },
        };
      },
    },

    {
      id: 'rocket',
      secondary: true,
      name: 'Rocket Countdown',
      tag: 'set aside',
      hue: 'var(--c-orange)',
      blurb:
        'Engines spin up as you pull. Hold past the ring and it counts down: three ticks, then a throb. Let go and it lifts off.',
      notes: [
        'Gives the hold a story instead of a metronome: the pulse becomes three, two, one.',
        'A rumble loop plus a sawtooth whine through an opening lowpass filter, so the build reads even at low volume on a tablet speaker.',
        'The spin-down on cancel is the clearest “nothing happened” of any option: pitch and filter both fall away.',
        'Riskiest for a two-year-old: it is the loudest, busiest idea here, and the countdown only pays off if the hold lasts about a second and a half.',
      ],
      commit: 'commit-rocket-liftoff',
      level: 0.37,
      create(out) {
        const base = engineBase(out, this.level);
        const cutoff = filterNode('lowpass', ROCKET_CUTOFF_MIN_HZ, 0.8, base.bus);
        const rumble = base.track(startLoop('stem-rocket-rumble', cutoff, 0));

        const whineGain = gainNode(0, cutoff);
        const whine = ctx.createOscillator();
        whine.type = 'sawtooth';
        whine.frequency.value = ROCKET_WHINE_MIN_HZ;
        whine.connect(whineGain);
        whine.start();
        let countdownIndex = 0;

        return {
          start() {},
          update(progress) {
            const drag = clamp(progress / PITCH_CAP_PROGRESS, 0, 1);
            base.crossing(
              progress,
              () => {
                countdownIndex = 0;
                base.pulse(ROCKET_COUNTDOWN_INTERVAL_MS, () => {
                  const frequency =
                    ROCKET_COUNTDOWN_HZ[Math.min(countdownIndex, ROCKET_COUNTDOWN_HZ.length - 1)];
                  countdownIndex += 1;
                  tone(base.bus, {
                    frequency,
                    peak: 0.16,
                    attackS: 0.004,
                    durationS: 0.11,
                    type: 'triangle',
                  });
                });
              },
              () => base.stopPulses()
            );
            if (rumble) rampTo(rumble.gain.gain, rumble.unit * window01(drag, 0, 0.55), 0.1);
            rampTo(whineGain.gain, 0.11 * window01(drag, 0.1, 0.95), 0.1);
            rampTo(whine.frequency, ROCKET_WHINE_MIN_HZ + (ROCKET_WHINE_MAX_HZ - ROCKET_WHINE_MIN_HZ) * drag, 0.12);
            rampTo(cutoff.frequency, ROCKET_CUTOFF_MIN_HZ + (ROCKET_CUTOFF_MAX_HZ - ROCKET_CUTOFF_MIN_HZ) * drag, 0.12);
          },
          commit(commitSound) {
            base.teardown(0.06);
            whine.stop(ctx.currentTime + 0.2);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            base.stopPulses();
            rampTo(whine.frequency, ROCKET_WHINE_MIN_HZ * 0.6, 0.5);
            rampTo(cutoff.frequency, ROCKET_CUTOFF_MIN_HZ * 0.6, 0.5);
            base.teardown(0.5);
            whine.stop(ctx.currentTime + 0.7);
          },
        };
      },
    },

    {
      id: 'detent',
      secondary: true,
      name: 'Quiet Detent',
      tag: 'set aside',
      hue: 'var(--c-pink)',
      blurb:
        'No bed, no melody: nine soft ticks along the pull like a dial with notches, a bell at the ring, and a page turn on release.',
      notes: [
        'Information is carried by rate, not volume or pitch: drag fast and the ticks blur, drag slowly and they separate.',
        'The safest option in a room with a sleeping sibling, and the least likely to make a parent turn sound off.',
        'Leans hardest on the bell at the ring, the one moment the app had no sound for.',
        'The risk: it may sound cheap next to the richer options. Worth checking whether a two-year-old still understands the pull without a rising bed.',
      ],
      commit: 'commit-page-crisp',
      level: 1,
      create(out) {
        const base = engineBase(out, this.level);
        let lastDetent = -1;

        const detent = (index, multiplier = 1) => {
          const unit = index / (DETENT_COUNT - 1);
          noiseBurst(base.bus, {
            peak: 0.12 * multiplier,
            durationS: 0.012,
            frequency: DETENT_TICK_HZ,
            q: 3,
          });
          tone(base.bus, {
            frequency: DETENT_TONE_MIN_HZ + (DETENT_TONE_MAX_HZ - DETENT_TONE_MIN_HZ) * unit,
            peak: 0.1 * multiplier,
            attackS: 0.002,
            durationS: 0.045,
          });
        };

        return {
          start() {},
          update(progress) {
            base.crossing(
              progress,
              () => {
                base.pulse(DETENT_READY_INTERVAL_MS, () => detent(DETENT_COUNT - 1, 0.3));
              },
              () => {
                base.stopPulses();
                detent(0, 0.35);
              }
            );
            const index = Math.round(clamp(progress / PITCH_CAP_PROGRESS, 0, 1) * (DETENT_COUNT - 1));
            if (index === lastDetent) return;
            lastDetent = index;
            detent(index);
          },
          commit(commitSound) {
            base.teardown(0.04);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            base.stopPulses();
            detent(0, 0.4);
            setTimeout(() => base.teardown(0.05), 120);
          },
        };
      },
    },
  ];

  // Scripted gestures. Each frame is [millisecond, progress]; the runner
  // interpolates between them and calls update() on every animation frame, so an
  // option is auditioned against the shapes real hands make rather than one
  // convenient sweep.
  const PRESETS = [
    { id: 'flick', label: 'Flick', hint: 'A fast yank just past the ring, released in a quarter of a second', frames: [[0, 0], [260, 1.15]], outcome: 'commit' },
    { id: 'slow', label: 'Slow pull', hint: 'A steady two-second pull to a little past the ring, then release', frames: [[0, 0], [1900, 1.35]], outcome: 'commit' },
    { id: 'pull', label: 'Keep pulling', hint: 'Reach the ring, then keep pulling to more than twice its distance', frames: [[0, 0], [900, 1.05], [3000, 2.4]], outcome: 'commit' },
    { id: 'hold', label: 'Hold at ready', hint: 'Reach the ring and hold still there for three and a half seconds', frames: [[0, 0], [700, 1.05], [4200, 1.09]], outcome: 'commit' },
    { id: 'waver', label: 'Second thoughts', hint: 'Almost reach the ring, pull back, then go through with it', frames: [[0, 0], [600, 0.85], [1100, 0.35], [1800, 1.2]], outcome: 'commit' },
    { id: 'abandon', label: 'Let go early', hint: 'Pull three quarters of the way to the ring and let go', frames: [[0, 0], [700, 0.75]], outcome: 'cancel' },
  ];

  const PAD_THRESHOLD_PX = 96;
  const PAD_SCRIPT_ANGLE_RAD = -0.35;
  // The drag now reaches 2.6× the threshold, which is further than the pad is
  // tall; the puck stops travelling before it leaves the card while the readout
  // keeps counting the real distance.
  const PAD_PUCK_MAX_RATIO = 1.55;
  const SEQUENCE_GAP_MS = 700;
  const RELEASE_SETTLE_MS = 900;
  // The note the drag ended on is still decaying when the frames stop, so metering
  // the release from that instant charges the drag's own tail to the release —
  // which reads as cancellation audio on an option whose cancel is meant to be
  // silent, and does so only when the last note happened to fire late enough. The
  // window is spent entirely before the release is triggered, so it can never mask
  // a real cancel or commit sound. Derived from the voices rather than guessed, so
  // lengthening one keeps the window ahead of it.
  const LONGEST_VOICE_TAIL_S = Math.max(XYLO_BODY_DECAY_S, BUBBLE_DURATION_S * SETTLE_SUSTAIN_SCALE);
  const DRAG_TAIL_GUARD_MS = Math.ceil(LONGEST_VOICE_TAIL_S * 1_000) + 120;
  const CLIP_PROBE_MS = 700;
  const PROBE_GAP_MS = 150;
  const HOLD_PROBE_RAMP_MS = 700;
  const HOLD_PROBE_LEAD_MS = 400;
  const HOLD_PROBE_WINDOW_MS = 1000;
  const CLIMB_PROBE_APPROACH_MS = 900;
  const CLIMB_PROBE_CLIMB_MS = 1500;

  const COMMIT_GROUPS = [
    {
      label: 'Page turns',
      clips: [
        { value: 'commit-page-crisp', label: 'Crisp page' },
        { value: 'commit-page-crisp-thin', label: 'Thin page' },
        { value: 'commit-page-crisp-heavy', label: 'Heavy page' },
        { value: 'commit-page-crisp-double', label: 'Two pages' },
        { value: 'commit-paper-whoosh', label: 'First page take' },
        { value: 'commit-page-board-book', label: 'Board book page' },
        { value: 'commit-page-flick', label: 'Fast page flick' },
        { value: 'commit-page-slap', label: 'Page flip and land' },
        { value: 'commit-page-slow', label: 'Big slow page' },
      ],
    },
    {
      label: 'Crumples',
      clips: [
        { value: 'commit-crumple-slow', label: 'Long crumple' },
        { value: 'commit-crumple-quick', label: 'Quick crumple' },
        { value: 'commit-crumple-long-soft', label: 'Soft crumple' },
        { value: 'commit-crumple-long-tight', label: 'Tight crumple' },
        { value: 'commit-crumple-long-settle', label: 'Crumple, then settle' },
        { value: 'commit-crumple-then-page', label: 'Crumple, fresh sheet' },
        { value: 'commit-crumple-toss', label: 'Crumple and toss' },
        { value: 'commit-crumple-basket', label: 'Crumple to basket' },
      ],
    },
    {
      label: 'Pops and toys',
      clips: [
        { value: 'baseline-clear-pop', label: 'Old clear pop' },
        { value: 'commit-pop-sparkle', label: 'Pop and sparkle' },
        { value: 'commit-magic-poof', label: 'Poof and chime' },
        { value: 'commit-confetti-sparkle', label: 'Confetti burst' },
        { value: 'commit-whoomp-gulp', label: 'Whoomp gulp' },
        { value: 'commit-toy-boing', label: 'Toy boing' },
        { value: 'commit-rocket-liftoff', label: 'Rocket lift-off' },
      ],
    },
  ];

  const BENCH_ONE_SHOT_GROUPS = [
    ...COMMIT_GROUPS,
    {
      label: 'Ring and cancel',
      clips: [
        { value: 'ready-ding', label: 'Bell at the ring' },
        { value: 'cancel-deflate', label: 'Cancel: deflate' },
        { value: 'cancel-soft-settle', label: 'Cancel: soft settle' },
      ],
    },
  ];

  const BENCH_BED_GROUPS = [
    {
      label: 'Scrubbed Tape sources',
      clips: [
        { value: 'scrub-bubble-cauldron', label: 'Bubbling water' },
        { value: 'scrub-zipper', label: 'Zipper' },
        { value: 'scrub-slide-whistle', label: 'Slide whistle' },
        { value: 'scrub-magic-riser', label: 'Magic riser' },
      ],
    },
    {
      label: 'Loops',
      clips: [
        { value: 'stem-low-hum', label: 'Low hum' },
        { value: 'stem-mid-sparkle', label: 'Mid sparkle' },
        { value: 'stem-high-shimmer', label: 'High shimmer' },
        { value: 'stem-rocket-rumble', label: 'Rocket rumble' },
        { value: 'stem-balloon-stretch', label: 'Balloon stretch' },
        { value: 'stem-water-fill', label: 'Water fill (unused)' },
      ],
    },
  ];

  const BED_PREVIEW_S = 3;
  const PLAY_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5v11l9-5.5z"/></svg>';
  const SPEAKER_ON_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h2.5L8 3v10L4.5 10H2z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"/></svg>';
  const SPEAKER_OFF_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h2.5L8 3v10L4.5 10H2z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="m10.5 6 4 4m0-4-4 4"/></svg>';
  const STOP_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect fill="currentColor" x="3" y="3" width="10" height="10" rx="1.5"/></svg>';

  let activeGesture = null;
  let selectedPreset = PRESETS.find((preset) => preset.id === 'slow');
  const presetListeners = [];
  let muted = false;
  let audioReady = false;
  let onAudioReady = () => {};
  let setStatus = () => {};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconButton(icon, label, className = 'ghost') {
    const button = el('button', className);
    button.type = 'button';
    button.innerHTML = icon;
    if (label) button.append(el('span', null, label));
    return button;
  }

  function optionNode({ value, label }) {
    const option = el('option', null, label);
    option.value = value;
    return option;
  }

  function select(choices, initial) {
    const node = el('select');
    for (const choice of choices) node.append(optionNode(choice));
    node.value = initial;
    return node;
  }

  function groupedSelect(groups, initial) {
    const node = el('select');
    for (const group of groups) {
      const optgroup = el('optgroup');
      optgroup.label = group.label;
      for (const clip of group.clips) optgroup.append(optionNode(clip));
      node.append(optgroup);
    }
    node.value = initial;
    return node;
  }

  function applyMasterGain() {
    if (master) master.gain.value = muted ? 0 : settings.volume;
  }

  // Every play control routes through here, so the first tap anywhere on the
  // page is enough to unlock audio; the toolbar button is one entry point among
  // many, not a gate.
  async function enableAudio() {
    if (!audioReady) setStatus('Loading clips…');
    await ensureAudio();
    applyMasterGain();
    if (audioReady) return;
    audioReady = true;
    document.body.classList.add('audio-ready');
    onAudioReady();
  }

  function selectPreset(preset) {
    selectedPreset = preset;
    for (const listener of presetListeners) listener(preset);
  }

  class Gesture {
    constructor(card) {
      this.card = card;
      this.engine = card.option.create(master, card.controls);
      this.engine.start();
      this.progress = 0;
      this.done = false;
      card.root.classList.add('is-active');
    }

    update(progress) {
      if (this.done) return;
      this.progress = progress;
      this.engine.update(progress);
      this.card.render(progress);
    }

    finish(force) {
      if (this.done) return;
      this.done = true;
      const outcome = force ?? (this.progress >= COMMIT_PROGRESS ? 'commit' : 'cancel');
      if (outcome === 'commit') this.engine.commit(this.card.controls.commit());
      else this.engine.cancel();
      this.card.render(0);
      this.card.root.classList.remove('is-active');
      if (activeGesture === this) activeGesture = null;
      setStatus();
    }
  }

  function startGesture(card, detail) {
    activeGesture?.finish('cancel');
    activeGesture = new Gesture(card);
    setStatus(`Playing <b>${card.option.name}</b>${detail ? ` · ${detail}` : ''}`);
    return activeGesture;
  }

  function frameProgress(frames, elapsed) {
    if (elapsed <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i += 1) {
      const [time, value] = frames[i];
      const [prevTime, prevValue] = frames[i - 1];
      if (elapsed <= time) {
        const t = (elapsed - prevTime) / Math.max(1, time - prevTime);
        return prevValue + (value - prevValue) * t;
      }
    }
    return frames[frames.length - 1][1];
  }

  async function playGestureFrames(card, preset, existing) {
    await enableAudio();
    const gesture = existing ?? startGesture(card, preset.label);
    const duration = preset.frames[preset.frames.length - 1][0];
    const started = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        if (gesture.done) return resolve();
        const elapsed = performance.now() - started;
        gesture.update(frameProgress(preset.frames, elapsed));
        card.renderPuck(gesture.progress);
        if (elapsed >= duration) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return gesture;
  }

  async function runPreset(card, preset) {
    const gesture = await playGestureFrames(card, preset);
    gesture.finish(preset.outcome);
    card.renderPuck(0);
  }

  function buildPad(card) {
    const pad = el('div', 'pad');
    const meter = el('div', 'meter');
    const meterFill = el('i');
    const readyMark = el('span', 'mark');
    readyMark.style.left = `${(COMMIT_PROGRESS / LADDER_REACH_PROGRESS) * 100}%`;
    meter.append(meterFill, readyMark);
    const ring = el('div', 'ring');
    const anchor = el('button', 'anchor');
    anchor.type = 'button';
    anchor.setAttribute('aria-label', `Drag to clear with ${card.option.name}. Press Enter to play the selected gesture instead.`);
    anchor.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9Z"/></svg>';
    const puck = el('div', 'puck');
    const play = iconButton(PLAY_ICON, selectedPreset.label, 'ghost play');
    play.title = 'Play the gesture picked in the toolbar on this card';
    presetListeners.push((preset) => {
      play.lastChild.textContent = preset.label;
    });
    play.addEventListener('click', () => runPreset(card, selectedPreset));
    const readout = el('div', 'readout');
    const state = el('span', 'state', 'distance');
    const value = el('span', 'value', '0.00');
    readout.append(state, value);
    ring.style.width = `${PAD_THRESHOLD_PX * 2}px`;
    ring.style.height = `${PAD_THRESHOLD_PX * 2}px`;
    pad.append(meter, ring, puck, anchor, play, readout);

    let origin = null;
    const onMove = (event) => {
      if (!origin || !activeGesture) return;
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      activeGesture.update(distance / PAD_THRESHOLD_PX);
      card.renderPuck(activeGesture.progress);
      event.preventDefault();
    };
    const onUp = () => {
      origin = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeGesture?.finish();
      card.renderPuck(0);
    };

    anchor.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      await enableAudio();
      origin = { x: event.clientX, y: event.clientY };
      startGesture(card, 'by hand');
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    // A keyboard "click" has no pointer to drag, so it plays the scripted gesture.
    anchor.addEventListener('click', (event) => {
      if (event.detail === 0) runPreset(card, selectedPreset);
    });

    card.pad = pad;
    card.puck = puck;
    card.meterFill = meterFill;
    card.readoutValue = value;
    card.readoutState = state;
    return pad;
  }

  function buildCard(option) {
    const root = el('article', 'opt');
    root.style.setProperty('--hue', option.hue);
    root.id = `option-${option.id}`;

    const card = {
      option,
      root,
      controls: {
        commit: () => commitSelect.value,
        source: () => sourceSelect?.value,
        threshold: () => thresholdSelect?.value ?? DEFAULT_TREATMENT,
      },
      render(progress) {
        const capped = clamp(progress / LADDER_REACH_PROGRESS, 0, 1);
        card.meterFill.style.transform = `scaleX(${capped})`;
        const ready = progress >= COMMIT_PROGRESS;
        root.classList.toggle('is-ready', ready);
        card.readoutValue.textContent = progress.toFixed(2);
        card.readoutState.textContent = ready ? 'past the ring' : 'distance';
      },
      setThreshold(value) {
        if (!thresholdSelect) return;
        thresholdSelect.value = value;
        thresholdSelect.dispatchEvent(new Event('change'));
      },
      renderPuck(progress) {
        const distance = Math.min(progress, PAD_PUCK_MAX_RATIO) * PAD_THRESHOLD_PX;
        card.puck.style.transform =
          `translate(${Math.cos(PAD_SCRIPT_ANGLE_RAD) * distance}px, ${Math.sin(PAD_SCRIPT_ANGLE_RAD) * distance}px)`;
        card.puck.style.opacity = progress > 0.02 ? '1' : '0';
      },
    };

    const head = el('div', 'opt-head');
    head.append(el('h3', null, option.name), el('span', 'tag', option.tag));
    if (option.chosen) root.classList.add('is-chosen');
    const blurb = el('p', 'blurb', option.blurb);

    const fields = el('div', 'opt-fields');
    let thresholdSelect = null;
    const hint = el('p', 'hint');
    if (option.threshold) {
      thresholdSelect = select(THRESHOLD_TREATMENTS, option.defaultThreshold ?? DEFAULT_TREATMENT);
      const describe = () => {
        hint.textContent =
          THRESHOLD_TREATMENTS.find((entry) => entry.value === thresholdSelect.value)?.note ?? '';
      };
      thresholdSelect.addEventListener('change', describe);
      describe();
      fields.append(labelled('Past the ring', thresholdSelect));
    }
    const commitSelect = groupedSelect(COMMIT_GROUPS, option.commit);
    fields.append(labelled('Release', commitSelect));
    let sourceSelect = null;
    if (option.sources) {
      sourceSelect = select(option.sources, option.sources[0].value);
      fields.append(labelled('Recording', sourceSelect));
    }

    const notes = el('details', 'notes');
    notes.append(el('summary', null, 'Design notes'));
    const list = el('ul');
    for (const note of option.notes) list.append(el('li', null, note));
    notes.append(list);

    root.append(head, blurb, buildPad(card), fields);
    if (option.threshold) root.append(hint);
    root.append(notes);
    card.render(0);
    card.renderPuck(0);
    return card;
  }

  function labelled(text, control) {
    const wrap = el('label', 'field');
    wrap.append(el('span', null, text), control);
    return wrap;
  }

  const WAVE_WIDTH_PX = 600;
  const WAVE_HEIGHT_PX = 64;

  function drawWaveform(canvas, clip, loaded) {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color;
    if (!clip) {
      if (loaded) context.fillStyle = 'rgba(210,75,63,.8)';
      context.globalAlpha = loaded ? 1 : 0.25;
      context.fillRect(0, height / 2 - 1, width, 2);
      return;
    }
    const data = clip.buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const scale = 1 / Math.max(clip.peak, 0.001);
    const half = height / 2;
    const magnitudes = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      let magnitude = 0;
      const from = x * step;
      for (let i = from; i < from + step && i < data.length; i += 1) {
        magnitude = Math.max(magnitude, Math.abs(data[i]));
      }
      magnitudes[x] = Math.max(1, magnitude * scale * half * 0.94);
    }
    context.beginPath();
    context.moveTo(0, half - magnitudes[0]);
    for (let x = 1; x < width; x += 1) context.lineTo(x, half - magnitudes[x]);
    for (let x = width - 1; x >= 0; x -= 1) context.lineTo(x, half + magnitudes[x]);
    context.closePath();
    context.fill();
  }

  function formatSeconds(seconds) {
    return `${seconds.toFixed(1)}s`;
  }

  function buildBenchRow({ value, label }, { loop }) {
    const row = el('div', 'bench-row');
    const play = iconButton(PLAY_ICON, null);
    play.setAttribute('aria-label', `Play ${label}`);
    const wave = el('div', 'wave');
    const canvas = el('canvas');
    canvas.width = WAVE_WIDTH_PX;
    canvas.height = WAVE_HEIGHT_PX;
    const head = el('i', 'head');
    wave.append(canvas, head);
    const name = el('span', 'bench-name', label);
    const meta = el('span', 'bench-meta', '');

    let stopPlaying = null;
    const sweep = (seconds) => {
      const started = performance.now();
      let frame = 0;
      row.classList.add('is-playing');
      const tick = () => {
        const unit = (performance.now() - started) / (seconds * 1000);
        head.style.transform = `translateX(${Math.min(unit, 1) * wave.clientWidth}px)`;
        if (unit < 1) frame = requestAnimationFrame(tick);
        else stopPlaying?.();
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    };

    play.addEventListener('click', async () => {
      if (stopPlaying) {
        stopPlaying();
        return;
      }
      await enableAudio();
      const clip = clipFor(value);
      if (!clip) return;
      let cancelSweep;
      if (loop) {
        const layer = startLoop(value, master, 0);
        if (!layer) return;
        rampTo(layer.gain.gain, layer.unit, 0.05);
        cancelSweep = sweep(BED_PREVIEW_S);
        stopPlaying = () => {
          fadeOutAndStop(layer, 0.15);
          cancelSweep();
          row.classList.remove('is-playing');
          play.innerHTML = PLAY_ICON;
          stopPlaying = null;
        };
      } else {
        const source = playOneShot(value, master, 0.6);
        cancelSweep = sweep(clip.duration - clip.onset);
        stopPlaying = () => {
          source?.stop();
          cancelSweep();
          row.classList.remove('is-playing');
          play.innerHTML = PLAY_ICON;
          stopPlaying = null;
        };
      }
      play.innerHTML = STOP_ICON;
    });

    row.append(play, name, wave, meta);
    row.dataset.clip = value;
    drawWaveform(canvas, null, false);
    return { row, canvas, meta, value };
  }

  function buildBench(target, groups, { loop }) {
    const rows = [];
    for (const group of groups) {
      target.append(el('div', 'bench-group', group.label));
      for (const clip of group.clips) {
        const built = buildBenchRow(clip, { loop });
        target.append(built.row);
        rows.push(built);
      }
    }
    return rows;
  }

  function boot() {
    const grid = document.querySelector('[data-options]');
    const asideGrid = document.querySelector('[data-options-secondary]');
    const cards = OPTIONS.map((option) => {
      const card = buildCard(option);
      (option.secondary ? asideGrid : grid).append(card.root);
      return card;
    });

    const benchRows = [
      ...buildBench(document.querySelector('[data-bench-oneshots]'), BENCH_ONE_SHOT_GROUPS, { loop: false }),
      ...buildBench(document.querySelector('[data-bench-beds]'), BENCH_BED_GROUPS, { loop: true }),
    ];

    // Rendered here rather than in gen.mjs so the counts cannot drift from the
    // arrays that produce the cards.
    const primaryCount = OPTIONS.filter((option) => !option.secondary).length;
    const secondaryCount = OPTIONS.length - primaryCount;
    document.querySelector('[data-option-count]').innerHTML = `<b>${primaryCount}</b> voices`;
    document.querySelector('[data-secondary-count]').innerHTML = `<b>${secondaryCount}</b> set aside`;
    document.querySelector('[data-secondary-count-inline]').textContent = String(secondaryCount);

    const volume = document.querySelector('[data-volume]');
    volume.value = String(settings.volume);
    volume.addEventListener('input', () => {
      settings.volume = Number(volume.value);
      applyMasterGain();
    });

    const gestureSelect = document.querySelector('[data-gesture]');
    for (const preset of PRESETS) {
      const option = optionNode({ value: preset.id, label: preset.label });
      option.title = preset.hint;
      gestureSelect.append(option);
    }
    gestureSelect.value = selectedPreset.id;
    gestureSelect.addEventListener('change', () => {
      selectPreset(PRESETS.find((entry) => entry.id === gestureSelect.value));
    });

    const runAll = document.querySelector('[data-sequence-run]');
    runAll.innerHTML = `${PLAY_ICON}<span class="long">Play on every card</span><span class="short">All</span>`;
    let sequenceToken = 0;
    runAll.addEventListener('click', async () => {
      const token = (sequenceToken += 1);
      for (const card of cards) {
        if (token !== sequenceToken) return;
        if (card.option.secondary && !card.root.closest('details')?.open) continue;
        card.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.root.classList.add('is-spotlit');
        await runPreset(card, selectedPreset);
        card.root.classList.remove('is-spotlit');
        await new Promise((resolve) => setTimeout(resolve, SEQUENCE_GAP_MS));
      }
    });

    const stop = document.querySelector('[data-stop]');
    stop.innerHTML = `${STOP_ICON}<span>Stop</span>`;
    stop.addEventListener('click', () => {
      sequenceToken += 1;
      activeGesture?.finish('cancel');
    });

    const status = document.querySelector('[data-status]');
    const readyText = () => `<b>${clips.size}</b> clips ready`;
    setStatus = (html) => {
      status.innerHTML = html ?? (audioReady ? readyText() : 'Sound is off until you tap.');
    };

    const soundToggle = document.querySelector('[data-enable]');
    const soundLabel = soundToggle.querySelector('.sound-label');
    const soundIcon = soundToggle.querySelector('.sound-icon');
    const renderSoundToggle = () => {
      soundToggle.setAttribute('aria-pressed', String(muted));
      soundIcon.innerHTML = audioReady && !muted ? SPEAKER_ON_ICON : SPEAKER_OFF_ICON;
      soundLabel.textContent = !audioReady ? 'Turn sound on' : muted ? 'Muted' : 'Sound on';
      soundToggle.setAttribute('aria-label', !audioReady ? 'Turn sound on' : muted ? 'Unmute' : 'Mute');
    };
    renderSoundToggle();
    soundToggle.addEventListener('click', async () => {
      if (!audioReady) {
        await enableAudio();
        return;
      }
      muted = !muted;
      applyMasterGain();
      renderSoundToggle();
    });

    onAudioReady = () => {
      renderSoundToggle();
      setStatus();
      for (const { canvas, meta, value } of benchRows) {
        const clip = clipFor(value);
        drawWaveform(canvas, clip, true);
        meta.textContent = clip ? formatSeconds(clip.duration) : 'missing';
      }
    };

    // Test seam: tools/scrapbook/clear-sound-sheet/audit.mjs drives the sheet
    // headlessly and fails on anything that renders silence. The drag and the
    // release are metered separately because a bug that costs the page every
    // recorded sound — a CSP that refuses data: URIs, a clip that decodes to
    // nothing — still leaves the synthesized drag beds playing, and a single
    // whole-gesture peak reads that as healthy.
    const meter = () => {
      let peak = 0;
      let energy = 0;
      let windows = 0;
      const data = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sumSquares = 0;
        for (const sample of data) {
          peak = Math.max(peak, Math.abs(sample));
          sumSquares += sample * sample;
        }
        energy += Math.sqrt(sumSquares / data.length);
        windows += 1;
      }, 16);
      return {
        take() {
          const reading = { peak, loudness: energy / Math.max(1, windows) };
          peak = 0;
          energy = 0;
          windows = 0;
          return reading;
        },
        stop: () => clearInterval(timer),
      };
    };

    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    window.__sheetAudit = async (optionId, presetId) => {
      const card = cards.find((entry) => entry.option.id === optionId);
      const preset = PRESETS.find((entry) => entry.id === presetId);
      await enableAudio();
      const scope = meter();
      const gesture = await playGestureFrames(card, preset);
      const drag = scope.take();
      await settle(DRAG_TAIL_GUARD_MS);
      scope.take();
      gesture.finish(preset.outcome);
      card.renderPuck(0);
      await settle(RELEASE_SETTLE_MS);
      const release = scope.take();
      scope.stop();
      return { drag, release };
    };

    // Plays one clip on its own, which is the only check that separates "decoded"
    // from "audible" — the sheet can hold a full clip table and still play none
    // of it.
    window.__sheetPlayClip = async (name) => {
      await enableAudio();
      const scope = meter();
      const source = playOneShot(name, master, 1);
      await settle(CLIP_PROBE_MS);
      const reading = scope.take();
      scope.stop();
      // The scrub sources run eight seconds. Left running, each probe would still
      // be sounding under the next one and under the first options measured
      // after them, which reads as those options being far louder than they are.
      source?.stop();
      await settle(PROBE_GAP_MS);
      return reading;
    };

    // Holds still at the threshold and listens to nothing but the armed state —
    // the one thing a whole-gesture measurement cannot separate from the drag
    // that led into it.
    window.__sheetHoldProbe = async (optionId, treatment) => {
      const card = cards.find((entry) => entry.option.id === optionId);
      card.setThreshold(treatment);
      await enableAudio();
      const gesture = await playGestureFrames(card, {
        label: 'hold probe',
        frames: [
          [0, 0],
          [HOLD_PROBE_RAMP_MS, 1.05],
        ],
      });
      await settle(HOLD_PROBE_LEAD_MS);
      const scope = meter();
      await settle(HOLD_PROBE_WINDOW_MS);
      const reading = scope.take();
      scope.stop();
      gesture.finish('cancel');
      card.renderPuck(0);
      await settle(RELEASE_SETTLE_MS);
      return reading;
    };

    // Keeps pulling *past* the threshold and meters only that leg. Every treatment
    // has to say something while the hand is still moving out there — the first
    // version of the ladder had nine of its thirteen notes used up before the
    // threshold and stopped dead at 1.4×, so the treatment built on continuing to
    // climb had nothing left to climb, and a hold-only probe called that correct.
    window.__sheetClimbProbe = async (optionId, treatment) => {
      const card = cards.find((entry) => entry.option.id === optionId);
      card.setThreshold(treatment);
      await enableAudio();
      const gesture = await playGestureFrames(card, {
        label: 'climb probe',
        frames: [
          [0, 0],
          [CLIMB_PROBE_APPROACH_MS, 1.05],
        ],
      });
      const scope = meter();
      await playGestureFrames(
        card,
        {
          label: 'climb probe',
          frames: [
            [0, 1.05],
            [CLIMB_PROBE_CLIMB_MS, LADDER_REACH_PROGRESS],
          ],
        },
        gesture
      );
      const reading = scope.take();
      scope.stop();
      gesture.finish('cancel');
      card.renderPuck(0);
      await settle(RELEASE_SETTLE_MS);
      return reading;
    };

    window.__sheetTreatments = THRESHOLD_TREATMENTS.map(({ value, label, sustains }) => ({
      value,
      label,
      sustains: sustains ?? null,
    }));
    window.__sheetOptions = OPTIONS.map(({ id, silentCancel }) => ({
      id,
      silentCancel: silentCancel === true,
    }));
    window.__sheetPresets = PRESETS.map(({ id, outcome }) => ({ id, outcome }));
    window.__sheetClips = () =>
      Object.fromEntries(
        [...clips.entries()].map(([name, clip]) => [name, clip ? clip.peak : null])
      );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
