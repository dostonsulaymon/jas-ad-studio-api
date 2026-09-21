import { createZodDto } from 'nestjs-zod';
import { ownerProOrderSchema, proGrantSchema, proOrderSchema, proStatusSchema, rejectProOrderSchema } from './public/pro.port';

export class ProStatusDto extends createZodDto(proStatusSchema) {}
export class ProGrantDto extends createZodDto(proGrantSchema) {}
export class ProOrderDto extends createZodDto(proOrderSchema) {}
export class OwnerProOrderDto extends createZodDto(ownerProOrderSchema) {}
export class RejectProOrderDto extends createZodDto(rejectProOrderSchema) {}
