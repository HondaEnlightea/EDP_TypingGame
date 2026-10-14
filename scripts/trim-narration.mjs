import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../public/narration/', import.meta.url));
for (const name of readdirSync(directory).filter(name => name.endsWith('.wav'))) {
  const path = `${directory}/${name}`;
  const wav = readFileSync(path);
  let dataOffset = 0;
  let dataLength = 0;
  let sampleRate = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const chunk = wav.toString('ascii', offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    if (chunk === 'fmt ') {
      if (wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt16LE(offset + 22) !== 16) throw new Error('Expected mono 16-bit PCM.');
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (chunk === 'data') { dataOffset = offset + 8; dataLength = length; break; }
    offset += 8 + length + length % 2;
  }
  if (!dataOffset || !sampleRate) throw new Error(`Invalid WAV: ${name}`);
  let first = 0;
  let last = dataLength / 2 - 1;
  while (first < last && Math.abs(wav.readInt16LE(dataOffset + first * 2)) < 140) first++;
  while (last > first && Math.abs(wav.readInt16LE(dataOffset + last * 2)) < 140) last--;
  first = Math.max(0, first - Math.floor(sampleRate * .012));
  last = Math.min(dataLength / 2 - 1, last + Math.floor(sampleRate * .1));
  const pcm = wav.subarray(dataOffset + first * 2, dataOffset + (last + 1) * 2);
  const header = Buffer.from(wav.subarray(0, dataOffset));
  header.writeUInt32LE(pcm.length, dataOffset - 4);
  const result = Buffer.concat([header, pcm, wav.subarray(dataOffset + dataLength)]);
  result.writeUInt32LE(result.length - 8, 4);
  writeFileSync(path, result);
}
console.log('Narration silence trimmed.');
