// Builds one comparison sheet per generated video: the reference photo beside frames
// sampled across the clip, so fidelity drift is visible in a single image.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';

const packDir = process.argv[2] ?? 'out/pack';
const FRAMES = 6;
const CELL = 320;
const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const slots = readdirSync(packDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

let built = 0;

for (const slot of slots) {
  const dir = join(packDir, slot);
  const video = readdirSync(dir).find((f) => /\.(mp4|mov|webm)$/i.test(f));
  if (!video) continue;

  const photo = readdirSync(dir).find((f) => PHOTO.has(extname(f).toLowerCase()));
  if (!photo) {
    console.log(`  ${slot}: video but no reference photo, skipped`);
    continue;
  }

  const tmp = join(dir, '.frames');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const duration = Number(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1', join(dir, video),
    ]).toString().trim(),
  );

  // Sampled across the clip rather than at a fixed rate, so the sheet covers the whole
  // thing whatever its length.
  const step = duration / (FRAMES + 1);
  for (let i = 1; i <= FRAMES; i += 1) {
    execFileSync('ffmpeg', [
      '-v', 'error', '-ss', String((step * i).toFixed(2)), '-i', join(dir, video),
      '-frames:v', '1', '-vf', `scale=${CELL}:-1`, join(tmp, `f${String(i)}.jpg`), '-y',
    ]);
  }

  const cells = [
    { input: await label(join(dir, photo), 'REFERENCE'), top: 0, left: 0 },
  ];
  const frames = readdirSync(tmp).sort();
  for (const [i, f] of frames.entries()) {
    const n = i + 1;
    cells.push({
      input: await label(join(tmp, f), `${(step * n).toFixed(1)}s`),
      top: Math.floor(n / 4) * CELL,
      left: (n % 4) * CELL,
    });
  }

  const rows = Math.ceil((frames.length + 1) / 4);
  await sharp({ create: { width: CELL * 4, height: CELL * rows, channels: 3, background: '#111' } })
    .composite(cells)
    .jpeg({ quality: 88 })
    .toFile(join(packDir, `sheet-${slot}.jpg`));

  rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${slot}: ${duration.toFixed(1)}s -> sheet-${slot}.jpg`);
  built += 1;
}

console.log(built === 0 ? 'No videos found. Put each one in its slot as video.mp4.' : `${built} sheet(s) in ${packDir}`);

async function label(file, text) {
  const base = await sharp(file)
    .resize(CELL, CELL, { fit: 'contain', background: '#111' })
    .toBuffer();
  const tag = Buffer.from(
    `<svg width="${CELL}" height="26"><rect width="100%" height="100%" fill="#000" opacity="0.65"/>` +
      `<text x="8" y="18" font-family="sans-serif" font-size="15" fill="#fff">${text}</text></svg>`,
  );

  return sharp(base).composite([{ input: tag, top: CELL - 26, left: 0 }]).jpeg().toBuffer();
}
