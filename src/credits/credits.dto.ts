/** Shapes for the contract (D-031, T-09). Per-module, never a root-level file (R-7). */
import { createZodDto } from 'nestjs-zod';
import {
  createOrderSchema,
  creditBalanceSchema,
  creditOrderSummarySchema,
  creditPackSchema,
} from './public/credits.port';

export class CreditBalanceDto extends createZodDto(creditBalanceSchema) {}
export class CreditPackDto extends createZodDto(creditPackSchema) {}
export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class CreditOrderDto extends createZodDto(creditOrderSummarySchema) {}
