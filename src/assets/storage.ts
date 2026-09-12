import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Spec §7.4: photos live on a private volume under random paths and are never publicly
 * addressable. Nothing here is derived from user input — not the filename, not the
 * directory — so there is no input to traverse with.
 */
export class FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async write(bytes: Buffer): Promise<string> {
    // Two levels of fan-out so no single directory accumulates every photo on the box.
    const name = randomBytes(16).toString('hex');
    const path = join(name.slice(0, 2), name.slice(2, 4), name.slice(4));
    const absolute = this.resolveWithin(path);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);

    return path;
  }

  /**
   * async so a refused path rejects rather than throwing synchronously. Callers await
   * this; a sync throw escapes their try/catch and reads as a different failure.
   */
  async read(path: string): Promise<Buffer> {
    return readFile(this.resolveWithin(path));
  }

  /** Idempotent: a retried delete must not turn into a 500. */
  async remove(path: string): Promise<void> {
    await rm(this.resolveWithin(path), { force: true });
  }

  /**
   * The only place a path becomes absolute. Every read and write goes through it, so a
   * stored path that somehow contained a traversal still cannot escape the volume.
   */
  private resolveWithin(path: string): string {
    const absolute = resolve(this.root, path);

    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new Error(`Refusing to touch a path outside the storage root: ${path}`);
    }

    return absolute;
  }
}
