// Node.js 내장 모듈만 사용하여 PNG 아이콘 생성
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePNG(size, maskable = false) {
  const bg = [15, 23, 42]; // #0f172a
  const fg = [99, 102, 241]; // #6366f1
  const white = [226, 232, 240];

  const raw = Buffer.alloc(size * size * 4 + size);
  let p = 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * (maskable ? 0.34 : 0.4);
  const innerR = size * (maskable ? 0.2 : 0.24);

  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let col = bg;
      if (dist <= r) col = fg;
      if (dist <= innerR) col = white;
      // 중앙 문서 느낌 가로줄 3개
      if (Math.abs(dy) < r && Math.abs(dx) < size * 0.22) {
        const lineYs = [-size * 0.07, 0, size * 0.07];
        for (const ly of lineYs) {
          if (Math.abs(dy - ly) < size * 0.018) col = bg;
        }
      }
      raw[p++] = col[0];
      raw[p++] = col[1];
      raw[p++] = col[2];
      raw[p++] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), makePNG(192));
fs.writeFileSync(path.join(outDir, "icon-512.png"), makePNG(512));
fs.writeFileSync(path.join(outDir, "icon-512-maskable.png"), makePNG(512, true));
console.log("icons created:", fs.readdirSync(outDir));