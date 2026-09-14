/** The assets module's public contract (R-7). */
import { z } from 'zod';
import type { ReferenceImage } from '../../ai/public/provider.port';

export type AssetKind = 'reference' | 'model_input';

/** width and height describe the stored reference copy, not the upload (D-066). */
export const storedAssetSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  isPrimary: z.boolean(),
});

export type StoredAsset = z.infer<typeof storedAssetSchema>;

/**
 * P4's worker needs the MODEL-INPUT copies, and `assets` owns both the rows and the
 * files. R-7 forbids `generation` from reading either, so the contract grows one token.
 *
 * It hands back `ReferenceImage` from the ai port, so the worker passes the bytes to
 * generateAdPackage untouched and no third shape is invented for the same thing.
 */
export const MODEL_INPUT_READER = Symbol('MODEL_INPUT_READER');

/**
 * D-021: a deleted project's photos, rows and files. `projects` calls it after its own
 * soft delete; it cannot reach assets' tables or files itself (R-7).
 */
export const PROJECT_ASSET_PURGER = Symbol('PROJECT_ASSET_PURGER');

export interface ProjectAssetPurger {
  /** Removes every asset row and file of the caller's project. Returns the rows removed. */
  purgeProject(userId: string, projectId: string): Promise<number>;
}

export interface ModelInputReader {
  /**
   * The model-input copies for a project the caller owns, primary first. Resolves only on
   * ownership, and an empty array means the project has no photos yet — not that the
   * project is someone else's, which throws instead.
   */
  readModelInputs(userId: string, projectId: string): Promise<ReferenceImage[]>;
}
