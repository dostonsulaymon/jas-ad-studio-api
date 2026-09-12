/** The assets module's public contract (R-7). */

export type AssetKind = 'reference' | 'model_input';

export interface StoredAsset {
  id: string;
  projectId: string;
  width: number;
  height: number;
  bytes: number;
  isPrimary: boolean;
}
