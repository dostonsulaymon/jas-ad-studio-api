/**
 * DTO classes exist only so the contract has shapes in it (D-031, T-09). @nestjs/swagger
 * reads decorator metadata and a TypeScript interface leaves none at runtime, which is
 * why these routes documented as bare URLs with no request or response schema.
 *
 * Each wraps a zod schema that already existed, so no shape is defined twice, and they
 * add nothing at runtime — validation stays where it was, in the controller's .parse().
 */
import { createZodDto } from 'nestjs-zod';
import { briefSchema } from '../ai/public/brief.schema';
import { projectSummarySchema, projectDetailSchema } from './public/projects.port';

export class BriefDto extends createZodDto(briefSchema) {}
export class ProjectSummaryDto extends createZodDto(projectSummarySchema) {}
export class ProjectDetailDto extends createZodDto(projectDetailSchema) {}
