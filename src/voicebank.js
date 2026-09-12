// ============================================================
// 성우 녹음 보관함
//  · 부모가 직접 녹음한 소리를 기기(IndexedDB)에 저장한다
//  · 저장된 녹음은 즉시 앱 전체에 반영된다 (audio.js 재생 1순위)
//  · "음성 파일 내보내기"로 wav 묶음(zip)을 받아 assets/audio 에 넣으면
//    다른 기기(태블릿)에서도 그대로 재생된다
//
//  재생 우선순위:  녹음(IndexedDB)  →  assets/audio 파일  →  브라우저 TTS
// ============================================================

const DB_NAME = 'hangul-voice';
const STORE = 'clips';
const urls = new Map();     // key -> objectURL (메모리 캐시, 재생용)
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function request(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.onerror = () => rej(t.error);
    t.oncomplete = () => res(req ? req.result : undefined);
  }));
}

/** 앱 시작 시 1회 — 저장된 녹음을 메모리에 올린다 */
export async function initVoiceBank() {
  if (!('indexedDB' in window)) return 0;
  try {
    const keys = await request('readonly', (s) => s.getAllKeys());
    const blobs = await request('readonly', (s) => s.getAll());
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
    keys.forEach((k, i) => { if (blobs[i]) urls.set(k, URL.createObjectURL(blobs[i])); });
    return urls.size;
  } catch (e) {
    console.warn('녹음 보관함을 열지 못했습니다', e);
    return 0;
  }
}

export const recordedUrl = (key) => urls.get(key) || null;
export const hasClip = (key) => urls.has(key);
export const clipCount = () => urls.size;

export async function saveClip(key, blob) {
  await request('readwrite', (s) => s.put(blob, key));
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.set(key, URL.createObjectURL(blob));
}

export async function deleteClip(key) {
  await request('readwrite', (s) => s.delete(key));
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.delete(key);
}

export async function clearClips() {
  await request('readwrite', (s) => s.clear());
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
}

export const getClip = (key) => request('readonly', (s) => s.get(key));

// ── 녹음기 ────────────────────────────────────────────────
export const canRecord = () =>
  !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

let stream = null;

/** 마이크 사용 권한을 한 번만 받아 재사용한다 */
export async function openMic() {
  if (stream && stream.active) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  return stream;
}

export function closeMic() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** 녹음 시작 → stop() 을 호출하면 blob 을 돌려주는 핸들 */
export async function startRecording() {
  const s = await openMic();
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
    .find((m) => !m || MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
  return {
    stop: () => new Promise((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      rec.stop();
    }),
    cancel: () => { try { rec.stop(); } catch {} },
  };
}

// ── 내보내기: webm/opus → wav → zip ────────────────────────
const OUT_RATE = 22050;   // 사람 목소리에는 충분하고 용량이 절반

/** 앞뒤 무음을 다듬는다 (PRD 권장: 0.1초 이내) */
function trimSilence(data, rate, threshold = 0.012, pad = 0.06) {
  let start = 0, end = data.length - 1;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  if (start >= end) return data;
  const p = Math.round(rate * pad);
  return data.subarray(Math.max(0, start - p), Math.min(data.length, end + p));
}

let decodeCtx = null;
function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!decodeCtx) decodeCtx = new AC();
  return decodeCtx;
}

/** 여러 채널을 모노 한 줄로 합친다 */
export function toMono(buf) {
  const src = buf.getChannelData(0);
  const mono = new Float32Array(src.length);
  mono.set(src);
  for (let c = 1; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] * c + ch[i]) / (c + 1);
  }
  return mono;
}

/** 파일(File) 또는 주소(URL)에서 오디오를 읽어 AudioBuffer 로 */
export async function decodeAudio(fileOrUrl) {
  const bytes = typeof fileOrUrl === 'string'
    ? await (await fetch(fileOrUrl)).arrayBuffer()
    : await fileOrUrl.arrayBuffer();
  return audioCtx().decodeAudioData(bytes);
}

/** 오디오 blob → 모노 22.05kHz 16bit wav */
export async function toWav(blob) {
  const buf = await decodeAudio(blob);
  return encodeWav(toMono(buf), buf.sampleRate);
}

/** 모노 샘플 → 무음 정리 + 음량 평준화 + 22.05kHz 16bit wav 바이트 */
export function encodeWav(mono, sampleRate, { trim = true } = {}) {
  const trimmed = trim ? trimSilence(mono, sampleRate) : mono;

  // 선형 보간 리샘플
  const ratio = OUT_RATE / sampleRate;
  const outLen = Math.max(1, Math.round(trimmed.length * ratio));
  const out = new Int16Array(outLen);
  let peak = 0;
  for (let i = 0; i < trimmed.length; i++) peak = Math.max(peak, Math.abs(trimmed[i]));
  const gain = peak > 0.01 ? Math.min(3, 0.92 / peak) : 1;   // 볼륨 고르게
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio;
    const i0 = Math.floor(pos), i1 = Math.min(trimmed.length - 1, i0 + 1);
    const v = (trimmed[i0] + (trimmed[i1] - trimmed[i0]) * (pos - i0)) * gain;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }

  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const txt = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  const bytes = out.length * 2;
  txt(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); txt(8, 'WAVE');
  txt(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, OUT_RATE, true);
  dv.setUint32(28, OUT_RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  txt(36, 'data'); dv.setUint32(40, bytes, true);

  const wav = new Uint8Array(44 + bytes);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(out.buffer, out.byteOffset, bytes), 44);
  return wav;
}

// ── 긴 녹음 나누기 ─────────────────────────────────────────
/**
 * 무음을 기준으로 발화 구간을 찾는다.
 * @param {Float32Array} mono
 * @param {number} rate
 * @param {Object} opt thresholdDb(소리로 치는 기준) · minGap(끊는 무음 길이) · minLen(너무 짧은 건 버림) · pad(앞뒤 여유)
 * @returns {Array<{start:number,end:number}>} 초 단위
 */
export function detectSegments(mono, rate, opt = {}) {
  const thresholdDb = opt.thresholdDb ?? -35;
  const minGap = opt.minGap ?? 0.3;
  const minLen = opt.minLen ?? 0.25;
  const pad = opt.pad ?? 0.06;

  const win = Math.max(1, Math.round(rate * 0.02));      // 20ms
  const limit = Math.pow(10, thresholdDb / 20);
  const loud = [];
  for (let i = 0; i + win <= mono.length; i += win) {
    let sum = 0;
    for (let k = 0; k < win; k++) { const v = mono[i + k]; sum += v * v; }
    loud.push(Math.sqrt(sum / win) >= limit);
  }

  const gapWins = Math.max(1, Math.round(minGap / 0.02));
  const segs = [];
  let start = -1, quiet = 0;
  for (let i = 0; i < loud.length; i++) {
    if (loud[i]) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0) {
      quiet += 1;
      if (quiet >= gapWins) {
        segs.push([start, i - quiet + 1]);
        start = -1; quiet = 0;
      }
    }
  }
  if (start >= 0) segs.push([start, loud.length]);

  const dur = mono.length / rate;
  return segs
    .map(([a, b]) => ({
      start: Math.max(0, (a * win) / rate - pad),
      end: Math.min(dur, (b * win) / rate + pad),
    }))
    .filter((s) => s.end - s.start >= minLen);
}

/** AudioBuffer 의 한 구간을 잘라 wav blob 으로 */
export function sliceToWav(buf, startSec, endSec) {
  const mono = toMono(buf);
  const a = Math.max(0, Math.floor(startSec * buf.sampleRate));
  const b = Math.min(mono.length, Math.ceil(endSec * buf.sampleRate));
  const bytes = encodeWav(mono.subarray(a, b), buf.sampleRate);
  return new Blob([bytes], { type: 'audio/wav' });
}

// ── 최소 ZIP(무압축 store) 작성기 ──────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** files: [{ name, data:Uint8Array }] → zip Blob */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);  // 0x0800 = 파일명 UTF-8
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);   // 시각은 고정값
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true); dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, f.data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);

    offset += local.length + f.data.length;
  }

  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/** 녹음 전체를 wav 묶음으로 내보낸다 */
export async function exportVoicePack() {
  const keys = [...urls.keys()].sort();
  const files = [];
  for (const key of keys) {
    const blob = await getClip(key);
    if (!blob) continue;
    files.push({ name: `${key}.wav`, data: await toWav(blob) });
  }
  if (!files.length) return null;
  files.push({
    name: '넣는-방법.txt',
    data: new TextEncoder().encode(
      '이 파일들을 앱 폴더의 assets/audio/ 안에 그대로 넣으세요.\r\n' +
      '파일 이름은 바꾸지 마세요. 넣으면 태블릿에서도 이 목소리로 재생됩니다.\r\n' +
      `녹음 ${files.length}개\r\n`),
  });
  return makeZip(files);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
