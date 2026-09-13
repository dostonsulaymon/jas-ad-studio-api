import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DomainError } from '../common/errors/app.error';
import { PG_POOL } from '../common/db/tokens';
import { briefSchema, type Brief } from '../ai/public/brief.schema';
import { GalleryExampleNotFoundError } from '../gallery/public/gallery.errors';
import { GALLERY_READER, type GalleryReader } from '../gallery/public/gallery.port';
import type {
  ProjectBriefReader,
  ProjectOwnership,
  ProjectDetail,
  ProjectSummary,
} from './public/projects.port';

export class ProjectNotFoundError extends DomainError {
  readonly code = 'PROJECT_NOT_FOUND';
  readonly status = 404;
}

/** The brief fields a project stores. Mirrors briefSchema minus the server-side pieces. */
export interface ProjectInput {
  productName: string;
  description: string;
  goal: string;
  formatId: string;
  platform: string;
  aspectRatio: string;
  durationSeconds: number;
  audience: string | null;
  offer: unknown;
  confirmedClaims: unknown;
  galleryInspirationId: string | null;
}

interface ProjectDbRow {
  id: string;
  name: string;
  format_id: string;
  duration_seconds: number;
  aspect_ratio: string;
  created_at: Date;
}

interface BriefDbRow {
  name: string;
  description: string;
  goal: string;
  format_id: string;
  platform: string;
  aspect_ratio: string;
  duration_seconds: number;
  audience: string | null;
  offer: unknown;
  confirmed_claims: unknown;
  gallery_inspiration_id: string | null;
}

/** Postgres raises this when a uuid cannot be parsed. */
const INVALID_TEXT_REPRESENTATION = '22P02';

const RETURNED_COLUMNS = 'id, name, format_id, duration_seconds, aspect_ratio, created_at';

@Injectable()
export class ProjectsService implements ProjectOwnership, ProjectBriefReader {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(GALLERY_READER) private readonly gallery: GalleryReader,
  ) {}

  /**
   * P6: the id was accepted and validated by nobody before this. A seller could store any
   * string at all, and nothing ever checked it named a real example — let alone a
   * published one. Checked on the way in, so a brief never holds an id the worker cannot
   * resolve.
   */
  private async assertSelectable(id: string | null): Promise<void> {
    if (id !== null && !(await this.gallery.isSelectable(id))) {
      throw new GalleryExampleNotFoundError(`No published gallery example: ${id}`);
    }
  }

  async create(userId: string, input: ProjectInput): Promise<ProjectSummary> {
    await this.assertSelectable(input.galleryInspirationId);

    const { rows } = await this.pool.query<ProjectDbRow>(
      `INSERT INTO projects
         (user_id, name, description, goal, format_id, platform, aspect_ratio,
          duration_seconds, audience, offer, confirmed_claims, gallery_inspiration_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${RETURNED_COLUMNS}`,
      [
        userId,
        input.productName,
        input.description,
        input.goal,
        input.formatId,
        input.platform,
        input.aspectRatio,
        input.durationSeconds,
        input.audience,
        input.offer === null ? null : JSON.stringify(input.offer),
        JSON.stringify(input.confirmedClaims),
        input.galleryInspirationId,
      ],
    );

    return toSummary(rows[0]);
  }

  async listFor(userId: string): Promise<ProjectSummary[]> {
    const { rows } = await this.pool.query<ProjectDbRow>(
      `SELECT ${RETURNED_COLUMNS} FROM projects
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`,
      [userId],
    );

    return rows.map(toSummary);
  }

  /**
   * The ownership check for the whole application. Every caller goes through here rather
   * than fetching and comparing afterwards: the filter is in the SQL, so there is no
   * version of this that forgets to compare.
   */
  async getOwned(userId: string, projectId: string): Promise<ProjectSummary> {
    const rows = await this.selectOwned(userId, projectId);
    if (!rows[0]) throw new ProjectNotFoundError('No live project with that id for this user');

    return toSummary(rows[0]);
  }

  /**
   * One project with the brief it was saved from, so a client can read a project back
   * and PATCH it without losing the eight fields the summary does not carry.
   *
   * Both halves come from queries that already filter on user_id and deleted_at, so the
   * ownership rule is unchanged: another user's id is a 404, never a 403.
   */
  async getOwnedDetail(userId: string, projectId: string): Promise<ProjectDetail> {
    const summary = await this.getOwned(userId, projectId);
    const brief = await this.readBrief(userId, projectId);
    return { ...summary, brief };
  }

  async update(userId: string, projectId: string, input: ProjectInput): Promise<ProjectSummary> {
    await this.assertSelectable(input.galleryInspirationId);

    const rows = await this.runOwned<ProjectDbRow>(
      `UPDATE projects
          SET name = $3, description = $4, goal = $5, format_id = $6, platform = $7,
              aspect_ratio = $8, duration_seconds = $9, audience = $10, offer = $11,
              confirmed_claims = $12, gallery_inspiration_id = $13,
              brief_version = brief_version + 1
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
        RETURNING ${RETURNED_COLUMNS}`,
      [
        userId,
        projectId,
        input.productName,
        input.description,
        input.goal,
        input.formatId,
        input.platform,
        input.aspectRatio,
        input.durationSeconds,
        input.audience,
        input.offer === null ? null : JSON.stringify(input.offer),
        JSON.stringify(input.confirmedClaims),
        input.galleryInspirationId,
      ],
    );

    if (!rows[0]) throw new ProjectNotFoundError('No live project with that id for this user');
    return toSummary(rows[0]);
  }

  /**
   * The whole brief, for the worker. Every field the wizard collected, read back through
   * briefSchema so a row written by an older brief version cannot reach the model as a
   * shape it does not expect.
   */
  async readBrief(userId: string, projectId: string): Promise<Brief> {
    const { rows } = await this.pool.query<BriefDbRow>(
      `SELECT name, description, goal, format_id, platform, aspect_ratio, duration_seconds,
              audience, offer, confirmed_claims, gallery_inspiration_id
         FROM projects
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [userId, projectId],
    );

    const row = rows[0];
    if (!row) throw new ProjectNotFoundError('No project with that id for this user');

    return briefSchema.parse({
      productName: row.name,
      description: row.description,
      goal: row.goal,
      formatId: row.format_id,
      platform: row.platform,
      aspectRatio: row.aspect_ratio,
      durationSeconds: row.duration_seconds,
      audience: row.audience,
      offer: row.offer,
      confirmedClaims: row.confirmed_claims,
      galleryInspirationId: row.gallery_inspiration_id,
    });
  }

  async softDelete(userId: string, projectId: string): Promise<void> {
    const rows = await this.runOwned<{ id: string }>(
      `UPDATE projects SET deleted_at = now()
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [userId, projectId],
    );

    if (!rows[0]) throw new ProjectNotFoundError('No live project with that id for this user');
  }

  private selectOwned(userId: string, projectId: string): Promise<ProjectDbRow[]> {
    return this.runOwned<ProjectDbRow>(
      `SELECT ${RETURNED_COLUMNS} FROM projects
        WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [userId, projectId],
    );
  }

  /**
   * A malformed uuid must look exactly like any other miss. Letting 22P02 escape would
   * both leak a driver message and tell a prober that their id was merely the wrong
   * shape rather than the wrong owner.
   */
  private async runOwned<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      const { rows } = await this.pool.query<T>(sql, params);
      return rows;
    } catch (error) {
      if (isInvalidUuid(error)) return [];
      throw error;
    }
  }
}

function isInvalidUuid(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === INVALID_TEXT_REPRESENTATION
  );
}

function toSummary(row: ProjectDbRow | undefined): ProjectSummary {
  if (!row) throw new ProjectNotFoundError('Project row was not returned');

  return {
    id: row.id,
    name: row.name,
    formatId: row.format_id,
    durationSeconds: row.duration_seconds,
    aspectRatio: row.aspect_ratio,
    createdAt: row.created_at.toISOString(),
  };
}
