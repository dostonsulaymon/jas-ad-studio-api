import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { PacksService } from './packs.service';
import { PackNotAvailableError } from './public/credits.errors';
import { packEditSchema } from './public/credits.port';

let db: TestDatabase;
let service: PacksService;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  // NOT truncateAll(): the seeded packs are migration data, and this suite is about them.
  await db.pool.query(`DELETE FROM credit_ledger`);
  await db.pool.query(`DELETE FROM credit_orders`);
  await db.pool.query(
    `UPDATE credit_packs SET is_active = false, price_uzs = CASE id
       WHEN 'pack_1' THEN 9000 WHEN 'pack_5' THEN 40000 ELSE 105000 END`,
  );
  service = new PacksService(db.pool);
});

it('ships the three packs of D-009, priced but inactive', async () => {
  const all = await service.listAll();

  expect(all).toEqual([
    { id: 'pack_1', credits: 1, priceUzs: 9000, isActive: false, sortOrder: 1 },
    { id: 'pack_5', credits: 5, priceUzs: 40000, isActive: false, sortOrder: 2 },
    { id: 'pack_15', credits: 15, priceUzs: 105000, isActive: false, sortOrder: 3 },
  ]);
});

it('offers nothing for sale until an owner activates a pack (A8)', async () => {
  // The placeholder prices exist in the table and are still invisible to sellers. This is
  // the acceptance criterion "no price is displayed until the owner configures packs".
  expect(await service.listSellable()).toEqual([]);
});

it('refuses to activate a pack without re-stating its price (D-072)', () => {
  const result = packEditSchema.safeParse({ isActive: true });

  expect(result.success).toBe(false);
  expect(result.error?.issues[0]?.path).toEqual(['priceUzs']);
});

it('activates a pack when the price is stated in the same request', async () => {
  const edit = packEditSchema.parse({ priceUzs: 12000, isActive: true });
  const updated = await service.setPack('pack_1', edit);

  expect(updated).toMatchObject({ id: 'pack_1', priceUzs: 12000, isActive: true });
  expect(await service.listSellable()).toEqual([
    { id: 'pack_1', credits: 1, priceUzs: 12000, sortOrder: 1 },
  ]);
});

it('leaves untouched fields alone on a partial edit', async () => {
  await service.setPack('pack_5', packEditSchema.parse({ priceUzs: 44000, isActive: true }));
  await service.setPack('pack_5', packEditSchema.parse({ sortOrder: 9 }));

  const pack = (await service.listAll()).find((row) => row.id === 'pack_5');
  expect(pack).toEqual({
    id: 'pack_5',
    credits: 5,
    priceUzs: 44000,
    isActive: true,
    sortOrder: 9,
  });
});

it('refuses an unknown pack', async () => {
  await expect(
    service.setPack('pack_999', packEditSchema.parse({ sortOrder: 1 })),
  ).rejects.toBeInstanceOf(PackNotAvailableError);
});

it('refuses a zero or negative price at the schema, before the database sees it', () => {
  expect(packEditSchema.safeParse({ priceUzs: 0 }).success).toBe(false);
  expect(packEditSchema.safeParse({ priceUzs: -5 }).success).toBe(false);
});

it('getSellable refuses an inactive pack, so an order cannot snapshot it', async () => {
  await expect(service.getSellable('pack_1')).rejects.toBeInstanceOf(PackNotAvailableError);

  await service.setPack('pack_1', packEditSchema.parse({ priceUzs: 9000, isActive: true }));
  expect(await service.getSellable('pack_1')).toEqual({
    id: 'pack_1',
    credits: 1,
    priceUzs: 9000,
    sortOrder: 1,
  });
});

it('seeds payment instructions with no card number in the migration', async () => {
  const { rows } = await db.pool.query<{ value: Record<string, unknown> }>(
    `SELECT value FROM site_settings WHERE key = 'payment_instructions'`,
  );

  // The migration file is committed and this repo will have a remote.
  expect(rows[0]?.value).toEqual({
    cardNumber: null,
    cardHolder: null,
    paymeUrl: null,
    clickUrl: null,
    instructionsUz: null,
  });
});

it('seeds the D-023 support contacts, which are published, not secret', async () => {
  const { rows } = await db.pool.query<{ value: Record<string, unknown> }>(
    `SELECT value FROM site_settings WHERE key = 'support_contacts'`,
  );

  expect(rows[0]?.value).toEqual({
    telegramUser: '@dostonsulaymon_wk',
    telegramBot: '@apl_league_standings_bot',
    email: 'dostonqosimiy19@gmail.com',
  });
});
