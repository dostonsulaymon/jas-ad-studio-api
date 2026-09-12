/** See projects.dto.ts: shapes for the contract, nothing at runtime. */
import { createZodDto } from 'nestjs-zod';
import { storedAssetSchema } from './public/assets.port';

export class StoredAssetDto extends createZodDto(storedAssetSchema) {}
