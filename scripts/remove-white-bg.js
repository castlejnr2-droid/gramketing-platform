/**
 * One-time script: strips the white background from public/gramketing-logo.png
 * by replacing every pixel whose R, G, and B channels are all >= 240 with
 * fully transparent, then saves the result back in place.
 *
 * Run with: node scripts/remove-white-bg.js
 */

const sharp = require('sharp');
const path  = require('path');

const file = path.join(__dirname, '..', 'public', 'gramketing-logo.png');

async function main() {
  const img  = sharp(file).ensureAlpha();
  const { width, height } = await img.metadata();

  const raw  = await img.raw().toBuffer();
  const data = new Uint8Array(raw);

  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= 240 && g >= 240 && b >= 240) {
      data[i + 3] = 0; // make fully transparent
      changed++;
    }
  }

  await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(file);

  console.log(`Done — ${changed} pixels made transparent, saved to ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
