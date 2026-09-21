/**
 * Shapes for the contract (D-031, T-09). Per-module, never a root-level file: a root file
 * sits at the entrypoint layer and R-7's boundary lint rejects a module importing it.
 * That was learned the hard way in T-09.
 */
import { createZodDto } from 'nestjs-zod';
import { heroPhotosSchema } from '../settings/public/settings.port';
import {
  ownerProOrderSchema,
  proGrantSchema,
  proStatusSchema,
  rejectProOrderSchema,
} from '../pro/public/pro.port';
import {
  galleryExampleInputSchema,
  galleryMediaSchema,
  ownerGalleryExampleSchema,
  ownerGalleryListSchema,
} from '../gallery/public/gallery.port';
import {
  ownerGenerationSchema,
  ownerSpendDaySchema,
} from './public/owner-reports.port';
import {
  paymentInstructionsSchema,
  proSubscriptionSchema,
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
export class ProSubscriptionDto extends createZodDto(proSubscriptionSchema) {}

/**
 * The gallery's owner-facing shapes (D-090). Built here from the gallery module's port
 * schemas rather than imported from its dto file, because R-7 allows a module to read
 * another's public contract and nothing else — the same reason T-09 put DTO classes
 * per-module in the first place.
 */
export class OwnerGalleryListDto extends createZodDto(ownerGalleryListSchema) {}
export class OwnerGalleryExampleDto extends createZodDto(ownerGalleryExampleSchema) {}
export class GalleryExampleInputDtoClass extends createZodDto(galleryExampleInputSchema) {}

export class ProGrantDto extends createZodDto(proGrantSchema) {}
export class ProStatusDto extends createZodDto(proStatusSchema) {}
export class OwnerProOrderDto extends createZodDto(ownerProOrderSchema) {}
export class RejectProOrderDto extends createZodDto(rejectProOrderSchema) {}
export class GalleryMediaDto extends createZodDto(galleryMediaSchema) {}

/** D-091. Declared here for the same R-7 reason as the gallery classes above. */
export class HeroPhotosDto extends createZodDto(heroPhotosSchema) {}
