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

  const settings = { volume: 0.8, readyDing: true };

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

  function setVolume(value) {
    settings.volume = value;
    if (master) master.gain.value = value;
  }

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

  function ladderStep(progress, noteCount) {
    return Math.round(clamp(progress / PITCH_CAP_PROGRESS, 0, 1) * (noteCount - 1));
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

  function readyDing(out, level = 0.32) {
    if (settings.readyDing) playOneShot('ready-ding', out, level);
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
  const BASELINE_PITCH_CAP = 1.4;
  const BASELINE_READY_INTERVAL_MS = 240;
  const BASELINE_READY_GAIN_MULTIPLIER = 0.55;
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

  const BUBBLE_BASE_HZ = 330;
  const BUBBLE_NOTE_COUNT = 13;
  const BUBBLE_DURATION_S = 0.11;
  const BUBBLE_RISE_START_RATIO = 0.86;
  const BUBBLE_RISE_END_RATIO = 1.08;
  const BUBBLE_DROPLET_RATIO = 3.2;
  const BUBBLE_TRILL_INTERVAL_MS = 250;
  const BUBBLE_TRILL_DROP_STEPS = 2;

  const XYLO_BASE_HZ = 392;
  const XYLO_NOTE_COUNT = 15;
  const XYLO_BAR_PARTIAL_RATIO = 3.01;
  const XYLO_BODY_DECAY_S = 0.26;
  const XYLO_PARTIAL_DECAY_S = 0.09;
  const XYLO_READY_INTERVAL_MS = 300;

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

  const OPTIONS = [
    {
      id: 'baseline',
      name: 'Shipped today',
      tag: 'baseline',
      hue: 'var(--faint)',
      blurb:
        'A faithful port of what is on main after #1181 — sine bubble dots on a 0.055 progress gate, a 240 ms ready pulse, and clear-pop.mp3 on commit.',
      notes: [
        'Level-matched to the other cards so the comparison is about character, not loudness; the sheet masters through a soft ceiling, which only the densest flick on this card reaches.',
        'Pitch is a continuous exponential glide, so two adjacent dots can land a few cents apart.',
        'On a fast flick the 0.055 progress gate still fires about fifteen dots inside 260 ms — five deep once the 85 ms envelopes overlap — so a quick clear reads as a buzz rather than as bubbles.',
        'Releasing short of the threshold is silent — nothing tells the child the drawing survived.',
        'Its commit clip plays at this sheet’s shared commit level rather than the shipped 0.3, so the commit picker compares clips instead of card mixes.',
      ],
      commit: 'baseline-clear-pop',
      create(out) {
        const base = engineBase(out, BASELINE_LEVEL_MATCH);
        let lastProgress = 0;
        let readyProgress = 0;

        const dot = (progress, multiplier = 1) => {
          const variation = 1 + (Math.random() * 2 - 1) * BASELINE_PITCH_VARIATION;
          const frequency =
            BASELINE_START_HZ *
            Math.pow(BASELINE_END_HZ / BASELINE_START_HZ, progress) *
            variation;
          const peak =
            (BASELINE_GAIN_MIN +
              (BASELINE_GAIN_MAX - BASELINE_GAIN_MIN) *
                Math.pow(progress, BASELINE_GAIN_EXPONENT)) *
            multiplier;
          tone(base.bus, {
            frequency: frequency * BASELINE_PITCH_START_RATIO,
            endFrequency: frequency,
            glideS: BASELINE_PITCH_SETTLE_S,
            peak,
            attackS: BASELINE_ATTACK_S,
            durationS: BASELINE_DURATION_S,
          });
        };

        return {
          start() {},
          update(progress) {
            const bubbleProgress = Math.min(Math.max(progress, 0) / BASELINE_PITCH_CAP, 1);
            base.crossing(
              progress,
              () => {
                readyProgress = bubbleProgress;
                base.pulse(BASELINE_READY_INTERVAL_MS, () =>
                  dot(readyProgress, BASELINE_READY_GAIN_MULTIPLIER)
                );
              },
              () => base.stopPulses()
            );
            if (base.isReady) readyProgress = bubbleProgress;
            if (Math.abs(bubbleProgress - lastProgress) < BASELINE_DOT_PROGRESS_STEP) return;
            lastProgress = bubbleProgress;
            dot(bubbleProgress);
          },
          commit(commitSound) {
            base.teardown(0.05);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            base.teardown(0.05);
          },
        };
      },
    },

    {
      id: 'bubble-ladder',
      name: 'Bubble Ladder',
      tag: 'refinement',
      hue: 'var(--c-blue)',
      blurb:
        'The shipped water-bubble idea, tuned into a tune: each bubble snaps to a note of a pentatonic scale, so dragging out plays a rising melody and dragging back plays it in reverse.',
      notes: [
        'Snapping to a scale removes the microtonal wobble of a continuous glide — every dot is consonant with the one before it.',
        'A dot now fires when the *note* changes rather than on a fixed distance gate, so the rhythm follows the hand instead of the sample rate.',
        'The bubble chirps upward (0.86× → 1.08×) like real bubble resonance, with a droplet tick riding the attack.',
        'Ready state trills between the top note and two scale steps down, so holding sounds different from climbing.',
        'Releasing short of the threshold plays three descending bubbles — the ladder unwinding.',
      ],
      commit: 'commit-pop-sparkle',
      level: 0.97,
      create(out) {
        const base = engineBase(out, this.level);
        let lastStep = -1;
        let topStep = 0;
        let trillHigh = true;

        const bubble = (step, multiplier = 1) => {
          const frequency = ladderFrequency(BUBBLE_BASE_HZ, step);
          tone(base.bus, {
            frequency: frequency * BUBBLE_RISE_START_RATIO,
            endFrequency: frequency * BUBBLE_RISE_END_RATIO,
            peak: 0.22 * multiplier,
            attackS: 0.003,
            durationS: BUBBLE_DURATION_S,
          });
          noiseBurst(base.bus, {
            peak: 0.06 * multiplier,
            durationS: 0.014,
            frequency: frequency * BUBBLE_DROPLET_RATIO,
            q: 6,
          });
        };

        return {
          start() {},
          update(progress) {
            base.crossing(
              progress,
              () => {
                readyDing(out, 0.3);
                base.pulse(BUBBLE_TRILL_INTERVAL_MS, () => {
                  bubble(trillHigh ? topStep : Math.max(0, topStep - BUBBLE_TRILL_DROP_STEPS), 0.45);
                  trillHigh = !trillHigh;
                });
              },
              () => {
                base.stopPulses();
                bubble(Math.max(0, topStep - 4), 0.3);
              }
            );
            const step = ladderStep(Math.max(progress, 0), BUBBLE_NOTE_COUNT);
            topStep = step;
            if (step === lastStep) return;
            lastStep = step;
            bubble(step);
          },
          commit(commitSound) {
            base.teardown(0.05);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            base.stopPulses();
            for (let i = 0; i < 3; i += 1) {
              setTimeout(() => bubble(Math.max(0, lastStep - i * 2), 0.4), i * 55);
            }
            setTimeout(() => base.teardown(0.06), 220);
          },
        };
      },
    },

    {
      id: 'xylophone',
      name: 'Toy Xylophone',
      tag: 'fresh take',
      hue: 'var(--c-yellow)',
      blurb:
        'The same distance-to-note ladder played on a wooden toy xylophone — mallet click, bar partial, fast decay. Drag out and you run up the bars; drag back and you run down them.',
      notes: [
        'A struck-bar timbre (fundamental plus an inharmonic 3.01× partial) reads as a physical object being played, not as a synthesizer.',
        'Fifteen bars across the full drag, so a long pull is a longer run — the gesture writes the melody.',
        'Ready state taps the top bar softly against a shaker tick instead of repeating the climb.',
        'Pairs with the magic-poof commit: wood, wood, wood, sparkle.',
      ],
      commit: 'commit-magic-poof',
      level: 0.53,
      create(out) {
        const base = engineBase(out, this.level);
        let lastStep = -1;
        let topStep = 0;
        let shakerTurn = false;

        const pluck = (step, multiplier = 1) => {
          const frequency = ladderFrequency(XYLO_BASE_HZ, step);
          tone(base.bus, {
            frequency,
            peak: 0.24 * multiplier,
            attackS: 0.002,
            durationS: XYLO_BODY_DECAY_S,
          });
          tone(base.bus, {
            frequency: frequency * XYLO_BAR_PARTIAL_RATIO,
            peak: 0.07 * multiplier,
            attackS: 0.001,
            durationS: XYLO_PARTIAL_DECAY_S,
          });
          noiseBurst(base.bus, {
            peak: 0.09 * multiplier,
            durationS: 0.008,
            frequency: 2600,
            q: 1,
          });
        };

        return {
          start() {},
          update(progress) {
            base.crossing(
              progress,
              () => {
                readyDing(out, 0.26);
                base.pulse(XYLO_READY_INTERVAL_MS, () => {
                  if (shakerTurn) {
                    noiseBurst(base.bus, {
                      peak: 0.05,
                      durationS: 0.02,
                      frequency: 7000,
                      q: 0.7,
                      type: 'highpass',
                    });
                  } else pluck(topStep, 0.4);
                  shakerTurn = !shakerTurn;
                });
              },
              () => base.stopPulses()
            );
            const step = ladderStep(Math.max(progress, 0), XYLO_NOTE_COUNT);
            topStep = step;
            if (step === lastStep) return;
            lastStep = step;
            pluck(step);
          },
          commit(commitSound) {
            base.teardown(0.05);
            playOneShot(commitSound, out, COMMIT_LEVEL);
          },
          cancel() {
            base.stopPulses();
            for (let i = 0; i < 2; i += 1) {
              setTimeout(() => pluck(Math.max(0, lastStep - 3 - i * 3), 0.35), i * 70);
            }
            setTimeout(() => base.teardown(0.06), 200);
          },
        };
      },
    },

    {
      id: 'balloon',
      name: 'Balloon Inflate',
      tag: 'fresh take',
      hue: 'var(--c-red)',
      blurb:
        'Pulling the button away stretches a balloon: rubber creak plus a resonant hiss that climbs and tightens. Past the threshold it wobbles like it is about to go. Let go early and it deflates.',
      notes: [
        'Noise-based, so tracking the hand exactly never produces the harsh glide a bare oscillator does — the reason ADR-0131 rejected the continuous-tone option.',
        'Two layers move together: a recorded rubber-stretch loop speeding up 0.9× → 1.3×, and a synthesized band whose centre climbs 320 → 2600 Hz as its Q tightens 1 → 7.',
        'The ready cue is physical rather than musical: a 6 → 11 Hz wobble that says "about to burst" without adding a new sound.',
        'Cancel finally has an answer — the deflating squeak, which is exactly what a child expects when they pull back.',
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
                readyDing(out, 0.2);
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
      name: 'Scrubbed Tape',
      tag: 'new delivery',
      hue: 'var(--c-purple)',
      blurb:
        'One authored recording, but the drag moves the playhead instead of the clock. Overlapping grains resynthesize whatever moment the hand is pointing at, so a real recording tracks a gesture of any length — forwards, backwards, or held still.',
      notes: [
        'ADR-0131 rejected "one crescendo, pitch-shifted": the recording fought the gesture and rate changes read as a cartoon. Granular scrubbing removes both problems — position is the hand, pitch stays true.',
        'Holding still is not a special case: the grains keep overlapping at one spot and it becomes a shimmering freeze, which *is* the ready state.',
        'Position maps through the clip’s cumulative energy rather than its duration, so a dead patch in a generated file is skipped instead of becoming a silent stretch of the drag.',
        'Swap the source and the whole gesture re-skins with no code change — the drag character becomes an asset, which is exactly what ADR-0131 lists as the shipped design’s cost.',
        'Try the zipper: a drag that unzips is about the most literal thing a two-year-old could be handed.',
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
            base.crossing(progress, () => readyDing(out, 0.26), () => {});
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
      name: 'Stacking Stems',
      tag: 'new delivery',
      hue: 'var(--c-green)',
      blurb:
        'Three looping beds play from the first millisecond, all silent but one. Distance opens their faders in turn — hum, then sparkle, then shimmer — the way a game scores a rising action.',
      notes: [
        'Nothing is pitched or stretched, so there is no artifact to hide and no authored length to outrun. The gesture can last a quarter second or ten.',
        'Overlapping smoothstep windows mean the texture *changes character*, not just volume: a child hears which part of the journey they are in.',
        'A master lowpass opens 600 Hz → 12 kHz alongside the faders, which is what makes the top of the drag feel like arrival rather than just loud.',
        'Ready adds a slow tremolo on the shimmer bed only, leaving the rest of the mix steady.',
        'The obvious cost: three decoded loops resident instead of one small pop — worth measuring against the startup budget before shipping it.',
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
                readyDing(out, 0.24);
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
      name: 'Rocket Countdown',
      tag: 'fresh take',
      hue: 'var(--c-orange)',
      blurb:
        'Engines spin up as you pull away. Hold past the threshold and it counts you down — three rising ticks, then a held throb. Let go and it lifts off; pull back and it spins down.',
      notes: [
        'Gives the hold a *story* instead of a metronome. The ready pulse stops being "still here" and becomes "3 — 2 — 1".',
        'Rumble loop plus a sawtooth whine climbing 55 → 190 Hz through an opening lowpass, so the build reads even at low volume on a tablet speaker.',
        'The spin-down on cancel is the clearest "nothing happened" of any option here — pitch and cutoff both fall away.',
        'Riskiest for a two-year-old: it is the loudest, busiest idea on the sheet, and the countdown only pays off if the hold lasts about a second and a half.',
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
      name: 'Quiet Detent',
      tag: 'restraint',
      hue: 'var(--c-pink)',
      blurb:
        'The minimal answer. No bed, no melody — nine soft detent ticks spaced along the pull, like a dial with notches, a single bell at the point of no return, and a page turn on release.',
      notes: [
        'Information carried by *rate*, not by volume or pitch: drag fast and the ticks blur, drag slowly and they separate. Nothing has to get louder.',
        'The most defensible option in a room with a sleeping sibling, and the least likely to become the reason a parent turns sound off.',
        'It leans hardest on the threshold bell, which is the one moment today has no sound for at all.',
        'The honest risk: it may read as "cheap" next to the richer options — worth checking whether a two-year-old still understands the pull without a rising bed.',
      ],
      commit: 'commit-paper-whoosh',
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
                readyDing(out, 0.34);
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
    { id: 'flick', label: 'Flick', hint: '0 → 1.15 in 260 ms', frames: [[0, 0], [260, 1.15]], outcome: 'commit' },
    { id: 'slow', label: 'Slow pull', hint: '0 → 1.35 over 1.9 s', frames: [[0, 0], [1900, 1.35]], outcome: 'commit' },
    { id: 'hold', label: 'Hold at ready', hint: 'arrive at 1.05, hold 2 s', frames: [[0, 0], [700, 1.05], [2700, 1.09]], outcome: 'commit' },
    { id: 'waver', label: 'Second thoughts', hint: '0.85 → 0.35 → 1.2', frames: [[0, 0], [600, 0.85], [1100, 0.35], [1800, 1.2]], outcome: 'commit' },
    { id: 'abandon', label: 'Chicken out', hint: 'to 0.75, then release', frames: [[0, 0], [700, 0.75]], outcome: 'cancel' },
  ];

  const PAD_THRESHOLD_PX = 96;
  const PAD_SCRIPT_ANGLE_RAD = -0.35;
  const SEQUENCE_GAP_MS = 700;
  const RELEASE_SETTLE_MS = 900;
  const CLIP_PROBE_MS = 700;
  const PROBE_GAP_MS = 150;

  const COMMIT_CHOICES = [
    { value: 'commit-pop-sparkle', label: 'Bubble pop + sparkle' },
    { value: 'commit-magic-poof', label: 'Magic poof + chime' },
    { value: 'commit-confetti-sparkle', label: 'Confetti burst' },
    { value: 'commit-paper-whoosh', label: 'Paper page turn' },
    { value: 'commit-whoomp-gulp', label: 'Whoomp gulp' },
    { value: 'commit-toy-boing', label: 'Toy boing' },
    { value: 'commit-rocket-liftoff', label: 'Rocket lift-off' },
    { value: 'baseline-clear-pop', label: 'clear-pop.mp3 (shipped)' },
  ];

  const BENCH_ONE_SHOTS = [
    ...COMMIT_CHOICES,
    { value: 'ready-ding', label: 'Threshold bell' },
    { value: 'cancel-deflate', label: 'Cancel: deflate' },
    { value: 'cancel-soft-settle', label: 'Cancel: soft settle' },
  ];

  const BENCH_BEDS = [
    { value: 'scrub-bubble-cauldron', label: 'Scrub source: bubbling water' },
    { value: 'scrub-zipper', label: 'Scrub source: zipper' },
    { value: 'scrub-slide-whistle', label: 'Scrub source: slide whistle' },
    { value: 'scrub-magic-riser', label: 'Scrub source: magic riser' },
    { value: 'stem-low-hum', label: 'Stem: low hum' },
    { value: 'stem-mid-sparkle', label: 'Stem: mid sparkle' },
    { value: 'stem-high-shimmer', label: 'Stem: high shimmer' },
    { value: 'stem-rocket-rumble', label: 'Stem: rocket rumble' },
    { value: 'stem-balloon-stretch', label: 'Stem: balloon stretch' },
    { value: 'stem-water-fill', label: 'Stem: water fill (unused)' },
  ];

  const BED_PREVIEW_S = 3;

  let activeGesture = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function select(choices, initial) {
    const node = el('select');
    for (const { value, label } of choices) {
      const option = el('option', null, label);
      option.value = value;
      node.append(option);
    }
    node.value = initial;
    return node;
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
    }
  }

  function startGesture(card) {
    activeGesture?.finish('cancel');
    activeGesture = new Gesture(card);
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

  async function playGestureFrames(card, preset) {
    await ensureAudio();
    const gesture = startGesture(card);
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
    const ring = el('div', 'ring');
    const anchor = el('button', 'anchor');
    anchor.type = 'button';
    anchor.setAttribute('aria-label', `Drag to clear — ${card.option.name}`);
    anchor.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9Z"/></svg>';
    const puck = el('div', 'puck');
    const readout = el('div', 'readout', '0.00');
    ring.style.width = `${PAD_THRESHOLD_PX * 2}px`;
    ring.style.height = `${PAD_THRESHOLD_PX * 2}px`;
    pad.append(ring, puck, anchor, readout);

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
      await ensureAudio();
      origin = { x: event.clientX, y: event.clientY };
      startGesture(card);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    card.pad = pad;
    card.puck = puck;
    card.readout = readout;
    return pad;
  }

  function buildCard(option) {
    const root = el('article', 'opt');
    root.style.setProperty('--hue', option.hue);
    root.id = `option-${option.id}`;

    const card = {
      option,
      root,
      controls: { commit: () => commitSelect.value, source: () => sourceSelect?.value },
      render(progress) {
        const capped = clamp(progress / PITCH_CAP_PROGRESS, 0, 1);
        meterFill.style.transform = `scaleX(${capped})`;
        root.classList.toggle('is-ready', progress >= COMMIT_PROGRESS);
        card.readout.textContent = progress.toFixed(2);
      },
      renderPuck(progress) {
        const distance = Math.min(progress, PITCH_CAP_PROGRESS) * PAD_THRESHOLD_PX;
        card.puck.style.transform =
          `translate(${Math.cos(PAD_SCRIPT_ANGLE_RAD) * distance}px, ${Math.sin(PAD_SCRIPT_ANGLE_RAD) * distance}px)`;
        card.puck.style.opacity = progress > 0.02 ? '1' : '0';
      },
    };

    const head = el('div', 'opt-head');
    head.append(el('span', 'tag', option.tag), el('h3', null, option.name));
    const blurb = el('p', 'blurb', option.blurb);

    const meter = el('div', 'meter');
    const meterFill = el('i');
    meter.append(meterFill, el('span', 'mark ready-mark'), el('span', 'mark cap-mark'));

    const presets = el('div', 'presets');
    for (const preset of PRESETS) {
      const button = el('button', 'ghost', preset.label);
      button.type = 'button';
      button.title = preset.hint;
      button.addEventListener('click', () => runPreset(card, preset));
      presets.append(button);
    }
    const tour = el('button', 'ghost tour', 'Tour all five');
    tour.type = 'button';
    tour.addEventListener('click', async () => {
      for (const preset of PRESETS) {
        await runPreset(card, preset);
        await new Promise((resolve) => setTimeout(resolve, SEQUENCE_GAP_MS));
      }
    });
    presets.append(tour);

    const controls = el('div', 'opt-controls');
    const commitSelect = select(COMMIT_CHOICES, option.commit);
    controls.append(labelled('Commit sound', commitSelect));
    let sourceSelect = null;
    if (option.sources) {
      sourceSelect = select(option.sources, option.sources[0].value);
      controls.append(labelled('Source clip', sourceSelect));
    }

    const notes = el('details', 'notes');
    notes.append(el('summary', null, 'Design notes'));
    const list = el('ul');
    for (const note of option.notes) list.append(el('li', null, note));
    notes.append(list);

    root.append(head, blurb, buildPad(card), meter, presets, controls, notes);
    card.render(0);
    card.renderPuck(0);
    return card;
  }

  function labelled(text, control) {
    const wrap = el('label', 'field');
    wrap.append(el('span', null, text), control);
    return wrap;
  }

  function drawWaveform(canvas, clip) {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    if (!clip) {
      context.fillStyle = 'rgba(210,75,63,.8)';
      context.fillRect(0, height / 2 - 1, width, 2);
      return;
    }
    const data = clip.buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const scale = 1 / Math.max(clip.peak, 0.001);
    context.fillStyle = getComputedStyle(canvas).color;
    for (let x = 0; x < width; x += 1) {
      let magnitude = 0;
      const from = x * step;
      for (let i = from; i < from + step && i < data.length; i += 1) {
        magnitude = Math.max(magnitude, Math.abs(data[i]));
      }
      const bar = Math.max(1, magnitude * scale * height * 0.92);
      context.fillRect(x, (height - bar) / 2, 1, bar);
    }
  }

  function buildBenchRow({ value, label }, { loop }) {
    const row = el('div', 'bench-row');
    const play = el('button', 'ghost', '▶');
    play.type = 'button';
    play.setAttribute('aria-label', `Play ${label}`);
    const canvas = el('canvas', 'wave');
    canvas.width = 260;
    canvas.height = 34;
    const name = el('span', 'bench-name', label);
    const meta = el('span', 'bench-meta', '…');

    play.addEventListener('click', async () => {
      await ensureAudio();
      if (!loop) return playOneShot(value, master, 0.6);
      const layer = startLoop(value, master, 0);
      if (!layer) return;
      rampTo(layer.gain.gain, layer.unit, 0.05);
      setTimeout(() => fadeOutAndStop(layer, 0.15), BED_PREVIEW_S * 1000);
    });

    row.append(play, name, canvas, meta);
    row.dataset.clip = value;
    return { row, canvas, meta, value };
  }

  function boot() {
    const grid = document.querySelector('[data-options]');
    const cards = OPTIONS.map((option) => {
      const card = buildCard(option);
      grid.append(card.root);
      return card;
    });

    const oneShotRows = BENCH_ONE_SHOTS.map((entry) => buildBenchRow(entry, { loop: false }));
    const bedRows = BENCH_BEDS.map((entry) => buildBenchRow(entry, { loop: true }));
    const oneShotList = document.querySelector('[data-bench-oneshots]');
    const bedList = document.querySelector('[data-bench-beds]');
    for (const { row } of oneShotRows) oneShotList.append(row);
    for (const { row } of bedRows) bedList.append(row);

    // Rendered here rather than in gen.mjs so the counts cannot drift from the
    // arrays that produce the cards.
    document.querySelector('[data-option-count]').innerHTML =
      `<b>${OPTIONS.length}</b> options`;
    document.querySelector('[data-preset-count]').innerHTML =
      `<b>${PRESETS.length}</b> scripted gestures`;

    const volume = document.querySelector('[data-volume]');
    volume.value = String(settings.volume);
    volume.addEventListener('input', () => setVolume(Number(volume.value)));

    const bell = document.querySelector('[data-ready-bell]');
    bell.checked = settings.readyDing;
    bell.addEventListener('change', () => {
      settings.readyDing = bell.checked;
    });

    const sequencePreset = document.querySelector('[data-sequence-preset]');
    for (const preset of PRESETS) {
      const option = el('option', null, preset.label);
      option.value = preset.id;
      sequencePreset.append(option);
    }
    sequencePreset.value = 'slow';

    document.querySelector('[data-sequence-run]').addEventListener('click', async () => {
      const preset = PRESETS.find((entry) => entry.id === sequencePreset.value);
      for (const card of cards) {
        card.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.root.classList.add('is-spotlit');
        await runPreset(card, preset);
        card.root.classList.remove('is-spotlit');
        await new Promise((resolve) => setTimeout(resolve, SEQUENCE_GAP_MS));
      }
    });

    document.querySelector('[data-stop]').addEventListener('click', () => {
      activeGesture?.finish('cancel');
    });

    const status = document.querySelector('[data-status]');
    document.querySelector('[data-enable]').addEventListener('click', async () => {
      status.textContent = 'Loading sounds…';
      await ensureAudio();
      status.textContent = `${clips.size} clips loaded — press a trash button and drag away.`;
      document.body.classList.add('audio-ready');
      for (const { canvas, meta, value } of [...oneShotRows, ...bedRows]) {
        const clip = clipFor(value);
        drawWaveform(canvas, clip);
        meta.textContent = clip
          ? `${clip.duration.toFixed(2)}s · peak ${clip.peak.toFixed(2)}`
          : 'missing';
      }
    });

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
      await ensureAudio();
      const scope = meter();
      const gesture = await playGestureFrames(card, preset);
      const drag = scope.take();
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
      await ensureAudio();
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

    window.__sheetOptions = OPTIONS.map((option) => option.id);
    window.__sheetPresets = PRESETS.map((preset) => preset.id);
    window.__sheetClips = () =>
      Object.fromEntries(
        [...clips.entries()].map(([name, clip]) => [name, clip ? clip.peak : null])
      );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
