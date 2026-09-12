import { Global, Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreditsController } from './credits.controller';
import { OrdersService } from './orders.service';
import { PacksService } from './packs.service';
import { CREDIT_ADMIN, CREDIT_LEDGER } from './public/credits.port';

/**
 * Global so `owner` can resolve the two tokens without importing this file (R-7).
 *
 * Two tokens, not one: CREDIT_LEDGER is what P4 will inject to reserve and debit, and
 * CREDIT_ADMIN is the owner surface. Keeping them apart means the generation path cannot
 * reach confirmOrder just because it holds a reference to the module.
 */
@Global()
@Module({
  controllers: [CreditsController],
  providers: [
    PacksService,
    AccountsService,
    OrdersService,
    { provide: CREDIT_LEDGER, useExisting: AccountsService },
    { provide: CREDIT_ADMIN, useExisting: OrdersService },
  ],
  exports: [CREDIT_LEDGER, CREDIT_ADMIN],
})
export class CreditsModule {}
