/**
 * PromptLayer — Icon Generator (Zero Dependencies)
 * Run: node generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, pixels) {
    const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // CRC32
    const crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c;
    }
    function crc32(buf) {
        let crc = -1;
        for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ -1) >>> 0;
    }

    function makeChunk(type, data) {
        const total = Buffer.alloc(4 + type.length + data.length + 4);
        total.writeUInt32BE(data.length, 0);
        Buffer.from(type).copy(total, 4);
        data.copy(total, 4 + type.length);
        const crc = crc32(total.slice(4, 4 + type.length + data.length));
        total.writeUInt32BE(crc, total.length - 4);
        return total;
    }

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

    // Raw image data with filter bytes
    const stride = 1 + width * 4;
    const raw = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        raw[y * stride] = 0; // no filter
        for (let x = 0; x < width; x++) {
            const si = (y * width + x) * 4;
            const di = y * stride + 1 + x * 4;
            raw[di] = pixels[si]; raw[di + 1] = pixels[si + 1]; raw[di + 2] = pixels[si + 2]; raw[di + 3] = pixels[si + 3];
        }
    }

    const compressed = zlib.deflateSync(raw);

    return Buffer.concat([
        SIGNATURE,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', compressed),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

function inRoundedRect(x, y, w, h, r) {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
    if (x >= w - r && y < r) return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r;
    if (x < r && y >= h - r) return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r;
    if (x >= w - r && y >= h - r) return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r;
    return true;
}

function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function drawIcon(size) {
    const px = new Uint8Array(size * size * 4);
    const r = Math.round(size * 0.22);
    const s = size / 24;
    const bolt = [[13 * s, 2 * s], [3 * s, 14 * s], [12 * s, 14 * s], [11 * s, 22 * s], [21 * s, 10 * s], [12 * s, 10 * s]];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (inRoundedRect(x, y, size, size, r)) {
                if (pointInPolygon(x + 0.5, y + 0.5, bolt)) {
                    px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 255;
                } else {
                    const t = (x + y) / (size * 2);
                    px[i] = Math.round(99 + 40 * t);
                    px[i + 1] = Math.round(102 - 10 * t);
                    px[i + 2] = Math.round(241 + 5 * t);
                    px[i + 3] = 255;
                }
            }
        }
    }
    return px;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
    const pixels = drawIcon(size);
    const png = createPNG(size, size, pixels);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
    console.log(`✓ icon${size}.png (${png.length} bytes)`);
});

console.log('\n⚡ All icons generated!');
