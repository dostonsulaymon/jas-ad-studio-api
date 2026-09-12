/**
 * The projects module's only export to other modules (R-7). `assets` uses it to prove
 * ownership before touching a file.
 */
import { z } from 'zod';
import { briefSchema, type Brief } from '../../ai/public/brief.schema';

/**
 * The TypeScript type is derived from the schema rather than written beside it, so the
 * shape the API documents and the shape the code passes around cannot drift (D-031).
 */
export const projectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  formatId: z.string(),
  durationSeconds: z.number(),
  aspectRatio: z.string(),
  /**
   * The wire type, not the database type. JSON has no Date, so this was always an ISO
   * string once serialised — z.date() merely claimed otherwise, and zod 4 refuses to put
   * it in a JSON Schema at all.
   */
  createdAt: z.iso.datetime(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/**
 * One project, with the brief it was saved from.
 *
 * The summary alone cannot round-trip: PATCH requires all 11 brief fields and the
 * summary carries 3, so a client that read a project back and saved it would silently
 * wipe the other 8. Source 01 §20 asks for exactly that flow, so the detail shape
 * exists to make it possible.
 */
export const projectDetailSchema = projectSummarySchema.extend({
  brief: briefSchema,
});

export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** DI token for the ownership check `assets` depends on. */
export const PROJECT_OWNERSHIP = Symbol('PROJECT_OWNERSHIP');

export interface ProjectOwnership {
  /** Resolves only if the project exists, is live, and belongs to this user. */
  getOwned(userId: string, projectId: string): Promise<ProjectSummary>;
}

/**
 * P4's worker needs the WHOLE brief to call the model, not the summary a listing shows.
 * `projects` owns the row, so R-7 puts the read here rather than letting `generation`
 * query the table.
 */
export const PROJECT_BRIEF_READER = Symbol('PROJECT_BRIEF_READER');

export interface ProjectBriefReader {
  /**
   * The brief as the seller submitted it, for a project they own. Resolves only on
   * ownership, the same 404-not-403 rule as getOwned.
   */
  readBrief(userId: string, projectId: string): Promise<Brief>;
}
