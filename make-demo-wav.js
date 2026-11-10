// One-shot generator for a 4-second 440 Hz sine WAV demo track.
const fs = require('fs');
const path = require('path');

const rate = 44100, dur = 4, n = rate * dur, bytes = n * 4;
const buf = Buffer.alloc(44 + bytes);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(bytes, 40);

for (let i = 0; i < n; i++) {
  const t = i / rate;
  const env = Math.min(1, (dur - t) * 8); // fade out
  const v = Math.sin(2 * Math.PI * 440 * t) * 0.25 * env;
  const s = Math.round(v * 32767);
  buf.writeInt16LE(s, 44 + i * 4);
  buf.writeInt16LE(s, 46 + i * 4);
}

const out = path.join(__dirname, 'demo-library', 'Tone.wav');
fs.writeFileSync(out, buf);
console.log('WAV written:', out, buf.length, 'bytes');
