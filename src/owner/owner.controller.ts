import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Pool } from 'pg';
import type { CurrentUser } from '../auth/public/auth.port';
import { User } from '../auth/public/current-user.decorator';
import { SessionGuard } from '../auth/public/session.guard';
import { PG_POOL } from '../common/db/tokens';
import { withTransaction } from '../common/db/transaction';
import {
  CREDIT_ADMIN,
  grantSchema,
  packEditSchema,
  rejectOrderSchema,
  type ConfirmResult,
  type CreditAdminPort,
  type CreditBalance,
  type CreditOrderSummary,
  type AdminPack,
  type OrderStatus,
  type OwnerOrder,
  type OwnerUser,
} from '../credits/public/credits.port';
import {
  SETTINGS_ADMIN,
  type PaymentInstructions,
  type SettingsAdmin,
  type SupportContacts,
} from '../settings/public/settings.port';
import { AUDIT_WRITER, type AuditWriter } from './public/audit.port';
import { OwnerReportsService } from './owner-reports.service';
import type { OwnerGeneration, OwnerSpendDay } from './public/owner-reports.port';
import { OwnerGuard } from './owner.guard';
import {
  AdminPackDto,
  CreditBalanceDto,
  CreditOrderSummaryDto,
  GrantDto,
  OwnerOrderDto,
  OwnerUserDto,
  OwnerGenerationDto,
  OwnerSpendDayDto,
  PackEditDto,
  PaymentInstructionsDto,
  RejectOrderDto,
  SupportContactsDto,
} from './owner.dto';

const DEFAULT_LIMIT = 100;
/** Thirty days of spend: enough to see a trend without turning a panel into a report. */
const SPEND_DAYS = 30;

/**
 * D-037. Every write runs in ONE transaction that also carries its audit row, and the
 * transaction is opened here — in the owner module — then passed down into credits.
 *
 * That is what avoids a module cycle. The alternative, credits writing the audit row,
 * would break R-7 (a module writing another module's table); injecting an audit writer
 * into credits would make the two modules mutually dependent. Instead the owner module
 * owns the transaction and credits merely joins it, through the same Executor parameter
 * P4 will use.
 */
@Controller('owner')
@UseGuards(SessionGuard, OwnerGuard)
export class OwnerController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(CREDIT_ADMIN) private readonly credits: CreditAdminPort,
    @Inject(SETTINGS_ADMIN) private readonly settings: SettingsAdmin,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly reports: OwnerReportsService,
  ) {}

  /** A read. Not audited — see the plan: a GET is not an action, and logging every list
   * would bury the rows that matter. */
  @Get('orders')
  @ApiOperation({ summary: 'The order queue, oldest first. Filter with ?status=pending.' })
  @ApiOkResponse({ type: OwnerOrderDto, isArray: true })
  listOrders(@Query('status') status?: string): Promise<OwnerOrder[]> {
    return this.credits.listOrders((status as OrderStatus | undefined) ?? null, DEFAULT_LIMIT);
  }

  /**
   * 200, not Nest's default 201 for a POST. Nothing is created: the order moves to `paid`
   * and, on a second call, nothing happens at all. A generated client that believed 201
   * would be describing a resource that does not exist (D-076).
   */
  @Post('orders/:id/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm a payment. Idempotent: a second confirm credits nothing (A8).',
  })
  @ApiOkResponse({ type: CreditOrderSummaryDto })
  confirm(@User() owner: CurrentUser, @Param('id') id: string): Promise<ConfirmResult> {
    return withTransaction(this.pool, async (tx) => {
      const result = await this.credits.confirmOrder(id, owner.id, tx);
      await this.audit.record(
        owner.id,
        'order.confirm',
        'credit_order',
        id,
        { credited: result.credited, alreadyPaid: result.alreadyPaid },
        tx,
      );
      return result;
    });
  }

  @Post('orders/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a payment with a reason the seller is shown.' })
  @ApiBody({ type: RejectOrderDto })
  @ApiOkResponse({ type: CreditOrderSummaryDto })
  reject(
    @User() owner: CurrentUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CreditOrderSummary> {
    const { reason } = rejectOrderSchema.parse(body);

    return withTransaction(this.pool, async (tx) => {
      const order = await this.credits.rejectOrder(id, owner.id, reason, tx);
      await this.audit.record(owner.id, 'order.reject', 'credit_order', id, { reason }, tx);
      return order;
    });
  }

  @Post('grants')
  @HttpCode(200)
  @ApiOperation({ summary: 'Grant credits by hand. The note is required (A3).' })
  @ApiBody({ type: GrantDto })
  @ApiOkResponse({ type: CreditBalanceDto })
  grant(@User() owner: CurrentUser, @Body() body: unknown): Promise<CreditBalance> {
    const input = grantSchema.parse(body);

    return withTransaction(this.pool, async (tx) => {
      const balance = await this.credits.grant(input, tx);
      await this.audit.record(
        owner.id,
        'credits.grant',
        'user',
        input.userId,
        { credits: input.credits, note: input.note },
        tx,
      );
      return balance;
    });
  }

  @Patch('packs/:id')
  @ApiOperation({
    summary: 'Edit a pack. Activating one requires stating its price in the same request.',
  })
  @ApiBody({ type: PackEditDto })
  @ApiOkResponse({ type: AdminPackDto })
  setPack(
    @User() owner: CurrentUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminPack> {
    const edit = packEditSchema.parse(body);

    return withTransaction(this.pool, async (tx) => {
      const pack = await this.credits.setPack(id, edit, tx);
      await this.audit.record(owner.id, 'pack.update', 'credit_pack', id, { ...edit }, tx);
      return pack;
    });
  }

  /**
   * D-008 and Addendum A §A4 step 2: where a seller sends the money. One route per key
   * rather than PATCH /settings/:key with a union body — see settings.dto.ts.
   */
  @Patch('settings/payment-instructions')
  @ApiOperation({ summary: 'Set the card number, Payme/Click links and Uzbek instructions.' })
  @ApiBody({ type: PaymentInstructionsDto })
  @ApiOkResponse({ type: PaymentInstructionsDto })
  setPaymentInstructions(
    @User() owner: CurrentUser,
    @Body() body: unknown,
  ): Promise<PaymentInstructions> {
    return this.writeSetting(owner.id, 'payment_instructions', body) as Promise<PaymentInstructions>;
  }

  /** D-023: the support account, bot and email, editable without a deploy. */
  @Patch('settings/support-contacts')
  @ApiOperation({ summary: 'Set the Telegram account, Telegram bot and support email.' })
  @ApiBody({ type: SupportContactsDto })
  @ApiOkResponse({ type: SupportContactsDto })
  setSupportContacts(
    @User() owner: CurrentUser,
    @Body() body: unknown,
  ): Promise<SupportContacts> {
    return this.writeSetting(owner.id, 'support_contacts', body) as Promise<SupportContacts>;
  }

  private writeSetting(
    ownerId: string,
    key: string,
    body: unknown,
  ): Promise<PaymentInstructions | SupportContacts> {
    return withTransaction(this.pool, async (tx) => {
      const stored = await this.settings.setKey(key, body, ownerId, tx);
      await this.audit.record(ownerId, 'setting.update', 'site_setting', key, {}, tx);
      return stored;
    });
  }

  /**
   * What has been generated, and what it cost per day (D-037).
   *
   * Read-only, and spend is the recorded cost of AI calls in USD, which is a different
   * number from credits and is never presented as one.
   */
  @Get('generations')
  @ApiOperation({ summary: 'Recent generations across all sellers, newest first. Read-only.' })
  @ApiOkResponse({ type: OwnerGenerationDto, isArray: true })
  listGenerations(): Promise<OwnerGeneration[]> {
    return this.reports.listGenerations(DEFAULT_LIMIT);
  }

  @Get('spend')
  @ApiOperation({ summary: 'Daily AI spend in USD for the last 30 days. Read-only.' })
  @ApiOkResponse({ type: OwnerSpendDayDto, isArray: true })
  listSpend(): Promise<OwnerSpendDay[]> {
    return this.reports.listSpendByDay(SPEND_DAYS);
  }

  /** A support view, not an export: no session token, no project, no photo. */
  @Get('users')
  @ApiOperation({ summary: 'Users with their credit balances. Read-only.' })
  @ApiOkResponse({ type: OwnerUserDto, isArray: true })
  listUsers(): Promise<OwnerUser[]> {
    return this.credits.listUsers(DEFAULT_LIMIT);
  }
}
