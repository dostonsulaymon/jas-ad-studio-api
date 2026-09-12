/**
 * The projects module's only export to other modules (R-7). `assets` uses it to prove
 * ownership before touching a file.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  formatId: string;
  durationSeconds: number;
  aspectRatio: string;
  createdAt: Date;
}

/** DI token for the ownership check `assets` depends on. */
export const PROJECT_OWNERSHIP = Symbol('PROJECT_OWNERSHIP');

export interface ProjectOwnership {
  /** Resolves only if the project exists, is live, and belongs to this user. */
  getOwned(userId: string, projectId: string): Promise<ProjectSummary>;
}
