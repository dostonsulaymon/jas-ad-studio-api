import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { EVENT_LOG, type EventLog } from '../events/public/events.port';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { CurrentUser } from '../auth/public/auth.port';
import { User } from '../auth/public/current-user.decorator';
import { SessionGuard } from '../auth/public/session.guard';
import { AccountsService } from './accounts.service';
import { CreateOrderDto, CreditBalanceDto, CreditOrderDto, CreditPackDto } from './credits.dto';
import { OrdersService } from './orders.service';
import { PacksService } from './packs.service';
import { createOrderSchema, type CreditBalance, type CreditOrderSummary, type CreditPack } from './public/credits.port';

/**
 * Spec §3: the pack list works signed out. Everything else takes the caller's own id from
 * the session — no route accepts a user id from a client, so there is nothing to tamper
 * with. CSRF is the global guard in app.module.ts, so state-changing routes are covered
 * without each controller opting in.
 */
@Controller()
export class CreditsController {
  constructor(
    private readonly packs: PacksService,
    private readonly orders: OrdersService,
    private readonly accounts: AccountsService,
    @Inject(EVENT_LOG) private readonly events: EventLog,
  ) {}

  @Get('packs')
  @ApiOperation({
    summary: 'Packs for sale. Empty until the owner prices and activates one (A8).',
  })
  @ApiOkResponse({ type: CreditPackDto, isArray: true })
  listPacks(): Promise<CreditPack[]> {
    return this.packs.listSellable();
  }

  @Get('credits/balance')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "The caller's credit balance. A new account is at zero (D-010)." })
  @ApiOkResponse({ type: CreditBalanceDto })
  balance(@User() user: CurrentUser): Promise<CreditBalance> {
    return this.accounts.getBalance(user.id);
  }

  @Post('orders')
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: 'Place an order for a pack. It stays pending until the owner confirms (D-008).',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({ type: CreditOrderDto })
  async create(@User() user: CurrentUser, @Body() body: unknown): Promise<CreditOrderSummary> {
    const order = await this.orders.create(user.id, createOrderSchema.parse(body));
    await this.events.record('order_created', user.id, { credits: order.credits, paymentMethod: order.paymentMethod });
    return order;
  }

  @Get('orders')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "The caller's own orders, newest first." })
  @ApiOkResponse({ type: CreditOrderDto, isArray: true })
  list(@User() user: CurrentUser): Promise<CreditOrderSummary[]> {
    return this.orders.listFor(user.id);
  }

  /** 200: a cancel changes an order's status, it does not create one (D-076). */
  @Post('orders/:id/cancel')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Cancel your own pending order. 404 if it is not yours." })
  @ApiOkResponse({ type: CreditOrderDto })
  cancel(@User() user: CurrentUser, @Param('id') id: string): Promise<CreditOrderSummary> {
    return this.orders.cancel(user.id, id);
  }
}
