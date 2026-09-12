/**
 * Shapes for the contract (D-031, T-09). Per-module, never a root-level file: a root file
 * sits at the entrypoint layer and R-7's boundary lint rejects a module importing it.
 * That was learned the hard way in T-09.
 */
import { createZodDto } from 'nestjs-zod';
import {
  ownerGenerationSchema,
  ownerSpendDaySchema,
} from './public/owner-reports.port';
import {
  paymentInstructionsSchema,
  supportContactsSchema,
} from '../settings/public/settings.port';
import {
  adminPackSchema,
  creditBalanceSchema,
  creditOrderSummarySchema,
  grantSchema,
  ownerOrderSchema,
  ownerUserSchema,
  packEditSchema,
  rejectOrderSchema,
} from '../credits/public/credits.port';

export class OwnerOrderDto extends createZodDto(ownerOrderSchema) {}
export class CreditOrderSummaryDto extends createZodDto(creditOrderSummarySchema) {}
export class RejectOrderDto extends createZodDto(rejectOrderSchema) {}
export class GrantDto extends createZodDto(grantSchema) {}
export class CreditBalanceDto extends createZodDto(creditBalanceSchema) {}
export class PackEditDto extends createZodDto(packEditSchema) {}
export class AdminPackDto extends createZodDto(adminPackSchema) {}
export class OwnerUserDto extends createZodDto(ownerUserSchema) {}
export class OwnerGenerationDto extends createZodDto(ownerGenerationSchema) {}
export class OwnerSpendDayDto extends createZodDto(ownerSpendDaySchema) {}

/**
 * Declared here rather than imported from `settings/settings.dto.ts`: R-7 lets a module
 * import any module's PORT but never another module's files, and these wrap the settings
 * port's own schemas, so no shape is defined twice.
 *
 * One DTO per key rather than one union DTO for a `:key` route — `createZodDto` cannot
 * wrap a z.union (it needs statically known members), and a generated client types two
 * named bodies better than one anyOf.
 */
export class PaymentInstructionsDto extends createZodDto(paymentInstructionsSchema) {}
export class SupportContactsDto extends createZodDto(supportContactsSchema) {}
