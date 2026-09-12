/** See projects.dto.ts: shapes for the contract, nothing at runtime. */
import { createZodDto } from 'nestjs-zod';
import { currentUserSchema } from './public/auth.port';

export class CurrentUserDto extends createZodDto(currentUserSchema) {}
