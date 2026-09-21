import { createZodDto } from 'nestjs-zod';
import { proGrantSchema, proStatusSchema } from './public/pro.port';

export class ProStatusDto extends createZodDto(proStatusSchema) {}
export class ProGrantDto extends createZodDto(proGrantSchema) {}
