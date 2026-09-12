import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { FileStorage } from './storage';

let root: string;
let storage: FileStorage;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jas-storage-'));
  storage = new FileStorage(root);
});

it('writes under a random path containing no user or project id', async () => {
  const path = await storage.write(Buffer.from('hello'));

  expect(path).not.toContain('..');
  expect(path).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+$/);
  expect(readFileSync(join(root, path)).toString()).toBe('hello');
});

it('never returns the same path twice', async () => {
  const paths = await Promise.all([1, 2, 3, 4, 5].map(() => storage.write(Buffer.from('x'))));

  expect(new Set(paths).size).toBe(paths.length);
});

it('reads back exactly what was written', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0x00, 0x10, 0xff]);
  const path = await storage.write(bytes);

  await expect(storage.read(path)).resolves.toEqual(bytes);
});

it('refuses to read outside the storage root', async () => {
  await expect(storage.read('../../etc/passwd')).rejects.toThrow(/outside/i);
});

it('refuses an absolute path', async () => {
  await expect(storage.read('/etc/passwd')).rejects.toThrow(/outside/i);
});

it('refuses a traversal that only escapes after a valid-looking prefix', async () => {
  await expect(storage.read('ab/cd/../../../../etc/passwd')).rejects.toThrow(/outside/i);
});

it('removes a file, and removing it again is not an error', async () => {
  const path = await storage.write(Buffer.from('x'));

  await storage.remove(path);
  await expect(storage.read(path)).rejects.toThrow();
  // Deletion must be idempotent: a retried request must not 500.
  await expect(storage.remove(path)).resolves.toBeUndefined();
});

it('refuses to remove outside the storage root', async () => {
  await expect(storage.remove('../../etc/passwd')).rejects.toThrow(/outside/i);
});
