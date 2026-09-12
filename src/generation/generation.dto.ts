/** Shapes for the contract (D-031, T-09). Per-module, never a root-level file (R-7). */
import { createZodDto } from 'nestjs-zod';
import {
  acceptedGenerationSchema,
  generationDetailSchema,
} from './public/generation.port';

export class AcceptedGenerationDto extends createZodDto(acceptedGenerationSchema) {}
export class GenerationDetailDto extends createZodDto(generationDetailSchema) {}
