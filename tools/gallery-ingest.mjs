// Turns the P1 test pack into gallery entries: probes each clip, cuts a poster, copies
// both onto the media volume under content-addressed names, and writes the metadata it
// can honestly derive.
//
// It writes to out/gallery-ingest.json, NOT to content/gallery.json. Two reasons: the
// content file must stay valid at all times (an invalid one stops the boot, by design),
// and the fields this tool cannot know must be filled by somebody who watched the clip.
//
// What it never does: invent a category, a creative preset, or a Flow model. A preset is
// a judgement about a film somebody watched; a script that guesses one is a script that
// fabricates content, which source 01 §42 forbids and the schema would reject anyway.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const packDir = process.argv[2] ?? 'out/pack';
const mediaRoot = process.argv[3] ?? process.env.GALLERY_MEDIA_ROOT ?? './storage/gallery';
const outFile = 'out/gallery-ingest.json';

const TODO = 'TODO';
const EMPTY_PRESET = {
  environment: '',
  lighting: '',
  cameraLanguage: '',
  pacing: '',
  mood: '',
};

function probe(video) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,duration',
    '-of', 'json',
    video,
  ]);
  const stream = JSON.parse(raw.toString()).streams[0];
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    durationSeconds: Math.round(Number(stream.duration) * 10) / 10,
  };
}

function aspectRatioOf({ width, height }) {
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 1) < 0.02) return '1:1';
  return TODO;
}

/** The report's H1 is the concept title; the "Xabar" section is the Uzbek concept line. */
function readReport(dir) {
  const file = join(dir, 'full-report.md');
  if (!existsSync(file)) return { titleUz: TODO, conceptUz: TODO };

  const text = readFileSync(file, 'utf8');
  const title = /^#\s+(.+)$/m.exec(text);
  const xabar = /^##\s+Xabar\s*\n+([\s\S]*?)(?=\n##\s|\n$)/m.exec(text);

  return {
    titleUz: title?.[1]?.trim() ?? TODO,
    conceptUz: xabar?.[1]?.trim().replace(/\s+/g, ' ') ?? TODO,
  };
}

mkdirSync(mediaRoot, { recursive: true });
mkdirSync('out', { recursive: true });

const slots = readdirSync(packDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const examples = [];
const todos = [];
let sortOrder = 0;

for (const slot of slots) {
  const dir = join(packDir, slot);
  const video = readdirSync(dir).find((f) => /\.(mp4|webm)$/i.test(f));
  if (!video) continue;

  const videoFile = join(dir, video);
  const dimensions = probe(videoFile);
  const hash = createHash('sha256').update(readFileSync(videoFile)).digest('hex').slice(0, 16);

  const videoPath = `${hash}${extname(video).toLowerCase()}`;
  const posterPath = `${hash}.jpg`;

  copyFileSync(videoFile, join(mediaRoot, videoPath));

  // One second in: far enough past a fade-from-black to show the product.
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-ss', '1.0', '-i', videoFile,
    '-frames:v', '1', '-q:v', '3',
    join(mediaRoot, posterPath),
  ]);

  const promptFile = join(dir, 'prompt.txt');
  const { titleUz, conceptUz } = readReport(dir);

  sortOrder += 1;
  examples.push({
    id: slot,
    slug: slot,
    titleUz,
    category: TODO,
    style: TODO,
    videoPath,
    posterPath,
    aspectRatio: aspectRatioOf(dimensions),
    durationSeconds: dimensions.durationSeconds,
    promptEn: existsSync(promptFile) ? readFileSync(promptFile, 'utf8').trim() : TODO,
    conceptUz,
    creativePreset: { ...EMPTY_PRESET },
    sourceType: 'app-prompt',
    sourceNote: '',
    flowModel: null,
    flowMode: null,
    isPublished: false,
    sortOrder,
  });

  const missing = [];
  if (titleUz === TODO) missing.push('titleUz');
  if (conceptUz === TODO) missing.push('conceptUz');
  todos.push(`  ${slot}: category, style, creativePreset (5 fields), sourceNote, flowModel, flowMode${missing.length ? `, ${missing.join(', ')}` : ''}`);

  console.log(`  ${slot}: ${dimensions.width}x${dimensions.height}, ${dimensions.durationSeconds}s -> ${videoPath}`);
}

writeFileSync(outFile, `${JSON.stringify({ examples }, null, 2)}\n`);

console.log(`\n${examples.length} clip(s) ingested into ${mediaRoot}`);
console.log(`Metadata written to ${outFile}\n`);
console.log('Still needed for each, by a human who watched the clip:');
console.log(todos.join('\n'));
console.log(`
Nothing is published. Every entry ships isPublished:false, and the schema refuses to
publish one without flowModel, flowMode and a source note (D-011, source 01 §42).
Merge the completed entries into content/gallery.json when they are ready.`);
