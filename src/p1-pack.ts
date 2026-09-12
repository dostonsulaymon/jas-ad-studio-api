import 'reflect-metadata';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Builds a folder laid out for pasting into a video generator by hand: one numbered
 * subfolder per product holding the photo and the prompt as bare text, so there is no
 * markdown to pick through and nothing to select around.
 */
const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function promptFrom(report: string): string | null {
  const start = report.indexOf('## promptEn');
  if (start === -1) return null;

  const open = report.indexOf('```text', start);
  const close = report.indexOf('```', open + 7);
  if (open === -1 || close === -1) return null;

  return report.slice(open + 7, close).trim();
}

function newestReport(reports: string[], product: string): string | undefined {
  return reports
    .filter((f) => f.startsWith(`${product}-`))
    .sort()
    .pop();
}

function main(): void {
  const productsDir = process.argv[2] ?? 'trial';
  const outDir = process.argv[3] ?? 'out/pack';

  const reports = readdirSync('out').filter((f) => f.endsWith('.md'));
  const products = readdirSync(productsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const index: string[] = ['# Test pack', '', '| # | Product | Style | Words | Status |', '|---|---|---|---|---|'];
  let n = 0;

  for (const product of products) {
    const report = newestReport(reports, product);
    if (!report) continue;

    const body = readFileSync(join('out', report), 'utf8');
    const prompt = promptFrom(body);
    const status = /\| Status:? \|? `?(\w+)`?/.exec(body)?.[1] ?? (prompt ? 'ready' : 'needs_input');

    n += 1;
    const slot = join(outDir, `${String(n).padStart(2, '0')}-${product}`);
    mkdirSync(slot, { recursive: true });

    const photo = readdirSync(join(productsDir, product)).find((f) => PHOTO.has(extname(f).toLowerCase()));
    if (photo) {
      copyFileSync(join(productsDir, product, photo), join(slot, `photo${extname(photo)}`));
    }

    if (prompt) writeFileSync(join(slot, 'prompt.txt'), `${prompt}\n`, 'utf8');
    copyFileSync(join('out', report), join(slot, 'full-report.md'));

    const brief: unknown = JSON.parse(readFileSync(join(productsDir, product, 'brief.json'), 'utf8'));
    const style = (brief as { style: string }).style;
    const words = prompt ? prompt.trim().split(/\s+/).length : 0;

    index.push(
      `| ${String(n)} | ${product} | ${style} | ${words === 0 ? '—' : String(words)} | ${status} |`,
    );
  }

  index.push(
    '',
    '## How to use',
    '',
    'Each folder has the photo and `prompt.txt`. Open the text file, select all, copy,',
    'and paste it into the generator with the photo. `full-report.md` has the Uzbek shot',
    'plan and the validator results if you want them.',
    '',
    'After generating, put the video in its own folder as `video.mp4` — then one command',
    'checks every one of them against its reference photo.',
  );

  writeFileSync(join(outDir, 'README.md'), `${index.join('\n')}\n`, 'utf8');
  console.log(`${String(n)} products -> ${outDir}`);
}

main();
