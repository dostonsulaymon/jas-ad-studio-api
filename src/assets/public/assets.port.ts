/** The assets module's public contract (R-7). */
import { z } from 'zod';

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
