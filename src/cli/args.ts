export interface CliArgs {
  product: string;
  model: string | undefined;
  target: string;
  maxSpendUsd: number;
  outDir: string;
}

export class CliArgsError extends Error {}

const USAGE = `Usage:
  pnpm p1:generate --product fixtures/<name> --max-spend-usd <n> [--model <id>] [--target <id>] [--out <dir>]`;

export function parseArgs(argv: string[], defaults: { target: string }): CliArgs {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) continue;

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new CliArgsError(`${token} needs a value\n\n${USAGE}`);
    }

    flags.set(token.slice(2), next);
    i += 1;
  }

  const product = flags.get('product');
  if (product === undefined) throw new CliArgsError(`--product is required\n\n${USAGE}`);

  // No default: a run that cannot exceed a cap it was never given is not capped.
  const rawCap = flags.get('max-spend-usd');
  if (rawCap === undefined) {
    throw new CliArgsError(
      `--max-spend-usd is required. A run with no cap can spend without limit.\n\n${USAGE}`,
    );
  }

  const maxSpendUsd = Number(rawCap);
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd <= 0) {
    throw new CliArgsError(`--max-spend-usd must be a positive number, got "${rawCap}"`);
  }

  return {
    product,
    model: flags.get('model'),
    target: flags.get('target') ?? defaults.target,
    maxSpendUsd,
    outDir: flags.get('out') ?? 'out',
  };
}
