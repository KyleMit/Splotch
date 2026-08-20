const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
const SOUND_EFFECTS_PATH = '/v1/sound-generation';
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 120_000;

const SOUND_EFFECT_MODEL = 'eleven_text_to_sound_v2';
export const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
export const OUTPUT_FORMATS = Object.freeze([
  'mp3_22050_32',
  'mp3_24000_48',
  'mp3_44100_32',
  'mp3_44100_64',
  'mp3_44100_96',
  'mp3_44100_128',
  'mp3_44100_192',
  'pcm_8000',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_32000',
  'pcm_44100',
  'pcm_48000',
  'ulaw_8000',
  'alaw_8000',
  'opus_48000_32',
  'opus_48000_64',
  'opus_48000_96',
  'opus_48000_128',
  'opus_48000_192',
]);

export class ElevenLabsApiError extends Error {
  constructor(message, { status, code, type, param, requestId, retryAfterMs } = {}) {
    super(message);
    this.name = 'ElevenLabsApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.param = param;
    this.requestId = requestId;
    this.retryAfterMs = retryAfterMs;
  }
}

export class ElevenLabsSoundEffectsClient {
  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    onRetry = () => undefined,
    maxRetries = DEFAULT_MAX_RETRIES,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  }) {
    if (!apiKey?.trim()) throw new Error('ElevenLabs API key is required.');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('maxRetries must be a non-negative integer.');
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error('requestTimeoutMs must be greater than zero.');
    }

    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
    this.onRetry = onRetry;
    this.maxRetries = maxRetries;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async generateSoundEffect(options) {
    const request = normalizeSoundEffectRequest(options);
    const url = new URL(SOUND_EFFECTS_PATH, this.baseUrl);
    url.searchParams.set('output_format', request.outputFormat);

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) {
          throw new ElevenLabsApiError('ElevenLabs returned an empty audio response.', {
            status: response.status,
            requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
          });
        }
        return {
          bytes,
          contentType: response.headers.get('content-type'),
          characterCost: parseOptionalNumber(response.headers.get('character-cost')),
          requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
          outputFormat: request.outputFormat,
        };
      }

      const error = await readApiError(response);
      if (!isRetryable(response.status) || attempt >= this.maxRetries) throw error;

      const retryDelayMs =
        error.retryAfterMs ?? Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
      this.onRetry({ attempt: attempt + 1, delayMs: retryDelayMs, error });
      await this.sleepImpl(retryDelayMs);
    }
  }
}

export function normalizeSoundEffectRequest(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Sound-effect options must be an object.');
  }

  const text = typeof options.text === 'string' ? options.text.trim() : '';
  if (!text) throw new Error('text must be a non-empty string.');

  const durationSeconds = options.durationSeconds;
  if (durationSeconds !== null && durationSeconds !== undefined) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 30) {
      throw new Error('durationSeconds must be null for automatic duration or between 0.5 and 30.');
    }
  }

  const promptInfluence = options.promptInfluence ?? 0.3;
  if (!Number.isFinite(promptInfluence) || promptInfluence < 0 || promptInfluence > 1) {
    throw new Error('promptInfluence must be between 0 and 1.');
  }

  const loop = options.loop ?? false;
  if (typeof loop !== 'boolean') throw new Error('loop must be a boolean.');

  const modelId = options.modelId ?? SOUND_EFFECT_MODEL;
  if (modelId !== SOUND_EFFECT_MODEL) {
    throw new Error(`modelId must be ${SOUND_EFFECT_MODEL}.`);
  }

  const outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  if (!OUTPUT_FORMATS.includes(outputFormat)) {
    throw new Error(`outputFormat must be one of: ${OUTPUT_FORMATS.join(', ')}.`);
  }

  const body = {
    text,
    loop,
    prompt_influence: promptInfluence,
    model_id: modelId,
  };
  if (durationSeconds !== undefined) body.duration_seconds = durationSeconds;

  return { body, outputFormat };
}

export function outputExtension(outputFormat) {
  if (!OUTPUT_FORMATS.includes(outputFormat)) {
    throw new Error(`Unknown output format: ${outputFormat}.`);
  }
  if (outputFormat.startsWith('mp3_')) return '.mp3';
  if (outputFormat.startsWith('opus_')) return '.opus';
  if (outputFormat.startsWith('ulaw_')) return '.ulaw';
  if (outputFormat.startsWith('alaw_')) return '.alaw';
  return '.pcm';
}

async function readApiError(response) {
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  const raw = await response.text();
  let detail;
  try {
    detail = JSON.parse(raw).detail;
  } catch {
    detail = null;
  }

  const requestId =
    (detail && !Array.isArray(detail) ? detail.request_id : undefined) ??
    response.headers.get('request-id') ??
    response.headers.get('x-request-id');
  const message = describeDetail(detail, raw) || response.statusText || 'Request failed';
  const suffix = requestId ? ` (request ${requestId})` : '';

  return new ElevenLabsApiError(`ElevenLabs HTTP ${response.status}: ${message}${suffix}`, {
    status: response.status,
    code: detail && !Array.isArray(detail) ? detail.code : undefined,
    type: detail && !Array.isArray(detail) ? detail.type : undefined,
    param: detail && !Array.isArray(detail) ? detail.param : undefined,
    requestId,
    retryAfterMs,
  });
}

function describeDetail(detail, raw) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const path = Array.isArray(item.loc) ? item.loc.join('.') : null;
        return `${path ? `${path}: ` : ''}${item.msg ?? JSON.stringify(item)}`;
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    const prefix = detail.code ? `${detail.code}: ` : '';
    return `${prefix}${detail.message ?? JSON.stringify(detail)}`;
  }
  return raw.trim();
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
}

function parseOptionalNumber(value) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}
