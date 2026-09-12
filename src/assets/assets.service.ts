import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { DomainError } from '../common/errors/app.error';
import { PG_POOL } from '../common/db/tokens';
import { PROJECT_OWNERSHIP, type ProjectOwnership } from '../projects/public/projects.port';
import { processUpload, type RenderedCopy } from './image.pipeline';
import type { AssetKind, StoredAsset } from './public/assets.port';
import { FileStorage } from './storage';
import type { ReferenceImage } from '../ai/public/provider.port';

export class AssetNotFoundError extends DomainError {
  readonly code = 'ASSET_NOT_FOUND';
  readonly status = 404;
}

/** Source 01 §8: one to four photos, all of the same product and variant. */
export const MAX_PHOTOS_PER_PROJECT = 4;

export class TooManyPhotosError extends DomainError {
  readonly code = 'TOO_MANY_PHOTOS';
  readonly status = 400;
}

interface AssetDbRow {
  id: string;
  project_id: string;
  width: number;
  height: number;
  bytes: number;
  is_primary: boolean;
}

const INVALID_TEXT_REPRESENTATION = '22P02';

@Injectable()
export class AssetsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PROJECT_OWNERSHIP) private readonly projects: ProjectOwnership,
    private readonly storage: FileStorage,
  ) {}

  /**
   * The ownership check is the first line and it throws before a single byte is decoded.
   * Uploading into someone else's project must cost an attacker nothing of ours.
   */
  async upload(userId: string, projectId: string, bytes: Buffer): Promise<StoredAsset> {
    await this.projects.getOwned(userId, projectId);

    const existing = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM assets WHERE project_id = $1 AND kind = 'reference'`,
      [projectId],
    );
    if (Number(existing.rows[0]?.count ?? 0) >= MAX_PHOTOS_PER_PROJECT) {
      throw new TooManyPhotosError(`A project holds at most ${String(MAX_PHOTOS_PER_PROJECT)} photos`);
    }

    const processed = await processUpload(bytes);

    // Written before the rows exist, so a failed insert leaves an orphan file rather
    // than a row pointing at nothing. An orphan file is sweepable; a dangling row is a
    // 500 on read.
    const referencePath = await this.storage.write(processed.reference.bytes);
    const modelInputPath = await this.storage.write(processed.modelInput.bytes);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const reference = await insertAsset(client, {
        projectId,
        userId,
        kind: 'reference',
        path: referencePath,
        copy: processed.reference,
        isPrimary: Number(existing.rows[0]?.count ?? 0) === 0,
      });

      await insertAsset(client, {
        projectId,
        userId,
        kind: 'model_input',
        path: modelInputPath,
        copy: processed.modelInput,
        isPrimary: false,
      });

      await client.query('COMMIT');
      return toStored(reference);
    } catch (error) {
      await client.query('ROLLBACK');
      await this.storage.remove(referencePath);
      await this.storage.remove(modelInputPath);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * The ownership filter is in the SQL. There is no version of this that fetches first
   * and compares afterwards, so there is no version that forgets to compare.
   */
  async readReference(
    userId: string,
    assetId: string,
  ): Promise<{ bytes: Buffer; contentType: 'image/jpeg' }> {
    const rows = await this.query<{ path: string }>(
      `SELECT a.path FROM assets a
         JOIN projects p ON p.id = a.project_id
        WHERE a.id = $2 AND a.user_id = $1 AND a.kind = 'reference'
          AND p.deleted_at IS NULL`,
      [userId, assetId],
    );

    const path = rows[0]?.path;
    if (!path) throw new AssetNotFoundError('No reference asset with that id for this user');

    return { bytes: await this.storage.read(path), contentType: 'image/jpeg' };
  }

  /**
   * The bytes the model sees: the 1024 px model-input copies, primary photo first.
   * Ownership is enforced by getOwned() before a single file is touched.
   */
  async readModelInputs(userId: string, projectId: string): Promise<ReferenceImage[]> {
    await this.projects.getOwned(userId, projectId);

    const rows = await this.query<{ path: string }>(
      `SELECT a.path FROM assets a
         JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = $2 AND a.user_id = $1 AND a.kind = 'model_input'
          AND p.deleted_at IS NULL
        ORDER BY a.is_primary DESC, a.created_at ASC`,
      [userId, projectId],
    );

    return Promise.all(
      rows.map(async (row) => ({
        bytes: await this.storage.read(row.path),
        // The pipeline writes both copies as JPEG q90 (R-6), whatever came in.
        mimeType: 'image/jpeg' as const,
      })),
    );
  }

  async listFor(userId: string, projectId: string): Promise<StoredAsset[]> {
    await this.projects.getOwned(userId, projectId);

    const rows = await this.query<AssetDbRow>(
      `SELECT id, project_id, width, height, bytes, is_primary FROM assets
        WHERE project_id = $2 AND user_id = $1 AND kind = 'reference'
        ORDER BY created_at ASC`,
      [userId, projectId],
    );

    return rows.map(toStored);
  }

  /**
   * Deletes both copies: they are one upload as far as a seller is concerned, and a
   * model-input copy of a photo the seller removed must not survive to reach a model.
   */
  async delete(userId: string, assetId: string): Promise<void> {
    const rows = await this.query<{ path: string }>(
      `DELETE FROM assets
        WHERE user_id = $1
          AND project_id = (SELECT project_id FROM assets WHERE id = $2 AND user_id = $1)
          AND created_at = (SELECT created_at FROM assets WHERE id = $2 AND user_id = $1)
        RETURNING path`,
      [userId, assetId],
    );

    if (rows.length === 0) throw new AssetNotFoundError('No asset with that id for this user');

    for (const row of rows) {
      await this.storage.remove(row.path);
    }
  }

  /** A malformed uuid must look exactly like any other miss, never like a 500. */
  private async query<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      const { rows } = await this.pool.query<T>(sql, params);
      return rows;
    } catch (error) {
      if (isInvalidUuid(error)) return [];
      throw error;
    }
  }
}

interface InsertInput {
  projectId: string;
  userId: string;
  kind: AssetKind;
  path: string;
  /** Each row describes its own file, so width and height come from that copy. */
  copy: RenderedCopy;
  isPrimary: boolean;
}

async function insertAsset(client: PoolClient, input: InsertInput): Promise<AssetDbRow> {
  const { rows } = await client.query<AssetDbRow>(
    `INSERT INTO assets (project_id, user_id, kind, path, width, height, bytes, sha256, is_primary)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, project_id, width, height, bytes, is_primary`,
    [
      input.projectId,
      input.userId,
      input.kind,
      input.path,
      input.copy.width,
      input.copy.height,
      input.copy.bytes.byteLength,
      createHash('sha256').update(input.copy.bytes).digest('hex'),
      input.isPrimary,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('Asset insert returned no row');
  return row;
}

function isInvalidUuid(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === INVALID_TEXT_REPRESENTATION
  );
}

function toStored(row: AssetDbRow): StoredAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    isPrimary: row.is_primary,
  };
}
