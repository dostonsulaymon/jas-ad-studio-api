import { Controller, Get, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SessionGuard } from '../auth/public/session.guard';
import { User } from '../auth/public/current-user.decorator';
import type { CurrentUser } from '../auth/public/auth.port';
import { ProOrderDto, ProStatusDto } from './pro.dto';
import { ProService } from './pro.service';
import { OptionalSessionGuard, type RequestWithUser } from '../auth/public/session.guard';
import type { ProOrder, ProStatus } from './public/pro.port';

@Controller('pro')
export class ProController {
  constructor(private readonly pro: ProService) {}

  /**
   * Answers for a signed-out visitor too, with `hasPro: false`, so the landing page can
   * ask once and render the gallery the same way in both cases. Guarding it would make
   * the signed-out path an error to be handled instead of an answer.
   */
  @Get('me')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({ summary: 'Whether this caller may open PRO prompts. Works signed out.' })
  @ApiOkResponse({ type: ProStatusDto })
  @Header('Cache-Control', 'no-store')
  status(@Req() request: RequestWithUser): Promise<ProStatus> {
    return this.pro.status(request.user?.id ?? null);
  }

  /**
   * D-102: the seller asks to buy PRO and Jakhongir confirms the transfer by hand, exactly as a
   * credit order works (D-008). Nothing here takes money; it records that somebody wants to pay.
   *
   * 200 rather than 201, and pressing it twice gives back the order that already exists: the
   * database holds one pending order per seller, so a double tap cannot queue two payments
   * (D-076, and the same rule as `confirm_credit_order`).
   */
  @Post('orders')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask to buy PRO. The owner confirms the payment by hand.' })
  @ApiOkResponse({ type: ProOrderDto })
  placeOrder(@User() user: CurrentUser): Promise<ProOrder> {
    return this.pro.placeOrder(user.id);
  }

  @Get('orders')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "This seller's own PRO orders, newest first." })
  @ApiOkResponse({ type: ProOrderDto, isArray: true })
  @Header('Cache-Control', 'no-store')
  listMyOrders(@User() user: CurrentUser): Promise<ProOrder[]> {
    return this.pro.listMyOrders(user.id);
  }
}
