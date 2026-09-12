import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { SettingsService } from './settings.service';

let db: TestDatabase;
let service: SettingsService;
let owner: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`DELETE FROM site_settings`);
  service = new SettingsService(db.pool);

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email, role) VALUES ('o','o@x.uz','owner')
     ON CONFLICT (google_sub) DO UPDATE SET email = 'o@x.uz' RETURNING id`,
  );
  owner = made.rows[0]?.id ?? '';
});

it('answers with null fields for a key that was never written, and writes nothing', async () => {
  expect(await service.getPaymentInstructions()).toEqual({
    cardNumber: null,
    cardHolder: null,
    paymeUrl: null,
    clickUrl: null,
    instructionsUz: null,
  });

  const { rows } = await db.pool.query(`SELECT key FROM site_settings`);
  expect(rows).toEqual([]);
});

it('stores payment instructions and records who set them', async () => {
  await service.setKey(
    'payment_instructions',
    { cardNumber: '8600123412341234', cardHolder: 'JAKHONGIR', instructionsUz: "Izohga ismingizni yozing" },
    owner,
  );

  const instructions = await service.getPaymentInstructions();
  expect(instructions.cardNumber).toBe('8600123412341234');
  expect(instructions.cardHolder).toBe('JAKHONGIR');
  expect(instructions.paymeUrl).toBeNull();

  const { rows } = await db.pool.query<{ updated_by: string }>(
    `SELECT updated_by FROM site_settings WHERE key = 'payment_instructions'`,
  );
  expect(rows[0]?.updated_by).toBe(owner);
});

it('refuses a plain-http payment link, so a seller is never sent to one', async () => {
  await expect(
    service.setKey('payment_instructions', { paymeUrl: 'http://payme.uz/x' }, owner),
  ).rejects.toThrow();

  const { rows } = await db.pool.query(`SELECT key FROM site_settings`);
  expect(rows).toEqual([]);
});

it('refuses a key that is not on the whitelist', async () => {
  await expect(service.setKey('admin_password', { x: 1 }, owner)).rejects.toBeInstanceOf(
    NotFoundException,
  );

  const { rows } = await db.pool.query(`SELECT key FROM site_settings`);
  expect(rows).toEqual([]);
});

it('reports payment as unconfigured until one of card, Payme or Click is set', async () => {
  expect(await service.isPaymentConfigured()).toBe(false);

  await service.setKey('payment_instructions', { paymeUrl: 'https://payme.uz/jas' }, owner);

  // Any one of the three is enough: the seller has somewhere to send money.
  expect(await service.isPaymentConfigured()).toBe(true);
});

it('overwrites rather than accumulating rows for the same key', async () => {
  await service.setKey('payment_instructions', { cardNumber: '8600111122223333' }, owner);
  await service.setKey('payment_instructions', { cardNumber: '9860444455556666' }, owner);

  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM site_settings WHERE key = 'payment_instructions'`,
  );
  expect(Number(rows[0]?.n)).toBe(1);
  expect((await service.getPaymentInstructions()).cardNumber).toBe('9860444455556666');
});

it('returns both keys together for the public endpoint', async () => {
  await service.setKey('payment_instructions', { cardNumber: '8600123412341234' }, owner);
  await service.setKey('support_contacts', { telegramUser: '@jas_support' }, owner);

  const published = await service.getPublic();
  expect(published.paymentInstructions.cardNumber).toBe('8600123412341234');
  expect(published.supportContacts.telegramUser).toBe('@jas_support');
});
