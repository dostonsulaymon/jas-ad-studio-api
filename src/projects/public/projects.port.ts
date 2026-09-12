/**
 * The projects module's only export to other modules (R-7). `assets` uses it to prove
 * ownership before touching a file.
 */
import { z } from 'zod';

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

/** DI token for the ownership check `assets` depends on. */
export const PROJECT_OWNERSHIP = Symbol('PROJECT_OWNERSHIP');

export interface ProjectOwnership {
  /** Resolves only if the project exists, is live, and belongs to this user. */
  getOwned(userId: string, projectId: string): Promise<ProjectSummary>;
}
