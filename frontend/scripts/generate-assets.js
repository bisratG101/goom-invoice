import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const publicDir = path.resolve('frontend/public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate favicon.svg (Vector logo with dark square and electric blue slash/triangle)
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="#0B0B0C"/>
  <path d="M8 22L16 10L24 22H8Z" fill="#1F6FFF"/>
  <circle cx="16" cy="18" r="3" fill="#FFFFFF"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf8');

// 2. Generate robots.txt
const robotsTxt = `User-agent: *
Allow: /
Disallow: /app/
Disallow: /api/
Sitemap: https://goominvoice.com/sitemap.xml
`;
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt, 'utf8');

// 3. Generate 1200x630 OG image PNG
// Helper to compute CRC32
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc ^ byte) & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
      byte = byte >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

const width = 1200;
const height = 630;

// Scanlines with filter byte 0 (None)
// Format: 1 filter byte + width * 3 bytes (RGB)
const raw = Buffer.alloc(height * (1 + width * 3));
let offset = 0;

for (let y = 0; y < height; y++) {
  raw[offset++] = 0; // Filter None
  for (let x = 0; x < width; x++) {
    // Subtle dark gradient from #0B0B0C to #111827 with blue glow in center/right
    const dx = x - 750;
    const dy = y - 315;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Background base: near black (#0B0B0C)
    let r = 11;
    let g = 11;
    let b = 12;

    // Center/Right subtle blue glow
    if (dist < 400) {
      const factor = (1 - dist / 400);
      r = Math.min(255, Math.floor(r + 20 * factor));
      g = Math.min(255, Math.floor(g + 60 * factor));
      b = Math.min(255, Math.floor(b + 180 * factor));
    }

    // Top border electric blue highlight line
    if (y < 4) {
      r = 31;
      g = 111;
      b = 255;
    }

    raw[offset++] = r;
    raw[offset++] = g;
    raw[offset++] = b;
  }
}

const compressed = zlib.deflateSync(raw, { level: 9 });

// Build PNG
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(width, 0);
ihdrData.writeUInt32BE(height, 4);
ihdrData[8] = 8; // bit depth
ihdrData[9] = 2; // color type: RGB
ihdrData[10] = 0; // compression
ihdrData[11] = 0; // filter
ihdrData[12] = 0; // interlace

const ihdrChunk = makeChunk('IHDR', ihdrData);
const idatChunk = makeChunk('IDAT', compressed);
const iendChunk = makeChunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync(path.join(publicDir, 'og-image.png'), png);
console.log('Public assets generated successfully: favicon.svg, robots.txt, og-image.png (1200x630)');
