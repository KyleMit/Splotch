// Reads the facts about an MPEG-1 Layer III file that decide what the app holds
// after decodeAudioData: channel count, sample rate, and the gapless sample count
// the LAME/Xing tag declares. Browsers trim encoder delay and padding by that tag,
// so a looped clip keeps its length only if the tag stays accurate. The same tag
// records the encoder's VBR method and quality indicator.

const ID3V2_HEADER_BYTES = 10;
const ID3V2_FOOTER_FLAG = 0x10;
const FRAME_HEADER_BYTES = 4;
const MPEG1_LAYER3_SAMPLES_PER_FRAME = 1152;
const MPEG1_LAYER3_BITRATES_KBPS = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const MPEG1_SAMPLE_RATES_HZ = [44100, 48000, 32000];
const MONO_CHANNEL_MODE = 3;
const MPEG1_SIDE_INFO_BYTES = { mono: 17, stereo: 32 };
const XING_FLAG_FRAMES = 1;
const XING_FLAG_BYTES = 2;
const XING_FLAG_TOC = 4;
const XING_FLAG_QUALITY = 8;
const XING_TOC_BYTES = 100;
const LAME_VBR_METHOD_OFFSET = 9;
const LAME_DELAY_PADDING_OFFSET = 21;

function id3v2Length(bytes) {
  if (bytes.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const footer = bytes[5] & ID3V2_FOOTER_FLAG ? ID3V2_HEADER_BYTES : 0;
  return ID3V2_HEADER_BYTES + size + footer;
}

function readFrameHeader(bytes, offset) {
  if (offset + FRAME_HEADER_BYTES > bytes.length) return null;
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[offset + 1] >> 3) & 3;
  const layer = (bytes[offset + 1] >> 1) & 3;
  if (version !== 3 || layer !== 1) {
    throw new Error(`frame at byte ${offset} is not MPEG-1 Layer III`);
  }
  const bitrateKbps = MPEG1_LAYER3_BITRATES_KBPS[bytes[offset + 2] >> 4];
  const sampleRate = MPEG1_SAMPLE_RATES_HZ[(bytes[offset + 2] >> 2) & 3];
  if (!bitrateKbps || !sampleRate) throw new Error(`frame at byte ${offset} has a reserved field`);
  const padding = (bytes[offset + 2] >> 1) & 1;
  const channels = bytes[offset + 3] >> 6 === MONO_CHANNEL_MODE ? 1 : 2;
  const length = Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding;
  return { sampleRate, channels, length };
}

function readXingTag(bytes, frameOffset, channels) {
  const xing =
    frameOffset + FRAME_HEADER_BYTES + MPEG1_SIDE_INFO_BYTES[channels === 1 ? 'mono' : 'stereo'];
  const tag = bytes.toString('latin1', xing, xing + 4);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = bytes.readUInt32BE(xing + 4);
  let lame = xing + 8;
  if (flags & XING_FLAG_FRAMES) lame += 4;
  if (flags & XING_FLAG_BYTES) lame += 4;
  if (flags & XING_FLAG_TOC) lame += XING_TOC_BYTES;
  let qualityIndicator = null;
  if (flags & XING_FLAG_QUALITY) {
    qualityIndicator = bytes.readUInt32BE(lame);
    lame += 4;
  }
  const at = lame + LAME_DELAY_PADDING_OFFSET;
  return {
    qualityIndicator,
    vbrMethod: bytes[lame + LAME_VBR_METHOD_OFFSET] & 0x0f,
    delay: (bytes[at] << 4) | (bytes[at + 1] >> 4),
    padding: ((bytes[at + 1] & 0x0f) << 8) | bytes[at + 2],
  };
}

export function describeMp3(bytes) {
  let offset = id3v2Length(bytes);
  const first = readFrameHeader(bytes, offset);
  if (!first) throw new Error('no MPEG audio frame after the ID3v2 tag');
  const xingTag = readXingTag(bytes, offset, first.channels);
  if (!xingTag) throw new Error('first frame carries no Xing/Info gapless tag');
  offset += first.length;

  const channelCounts = new Set();
  let audioFrames = 0;
  for (let frame = readFrameHeader(bytes, offset); frame; frame = readFrameHeader(bytes, offset)) {
    if (frame.sampleRate !== first.sampleRate) {
      throw new Error(`frame at byte ${offset} changes the sample rate`);
    }
    channelCounts.add(frame.channels);
    audioFrames += 1;
    offset += frame.length;
  }
  if (channelCounts.size !== 1) throw new Error('frames mix mono and stereo channel modes');

  const [channels] = channelCounts;
  const samples = audioFrames * MPEG1_LAYER3_SAMPLES_PER_FRAME - xingTag.delay - xingTag.padding;
  return {
    channels,
    sampleRate: first.sampleRate,
    samples,
    // decodeAudioData yields Float32 PCM: four bytes per sample per channel.
    decodedBytes: samples * channels * 4,
    vbrMethod: xingTag.vbrMethod,
    qualityIndicator: xingTag.qualityIndicator,
  };
}
