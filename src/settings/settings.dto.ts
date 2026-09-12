/**
 * Shapes for the contract (D-031, T-09). Per-module, never a root-level file: a root file
 * sits at the entrypoint layer and R-7's boundary lint rejects a module importing it.
 */
import { createZodDto } from 'nestjs-zod';
import { publicSettingsSchema } from './public/settings.port';

export class PublicSettingsDto extends createZodDto(publicSettingsSchema) {}
