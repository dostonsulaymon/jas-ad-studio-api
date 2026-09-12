-- Seed data, not schema. A custom migration (drizzle-kit generate --custom) so no
-- generated file is hand-edited.

-- D-009 fixes the three packs at 1 / 5 / 15 credits. D-072: they carry editable
-- placeholder prices and ship INACTIVE.
--
-- These three figures are placeholders chosen by Claude, NOT prices Jakhongir has agreed.
-- They exist so the flow is walkable and so the owner edits a number rather than invents
-- a record. Two independent rules keep them away from sellers:
--   1. is_active = false, and GET /packs returns only active, priced packs — so the list
--      is empty today, which is what Addendum A §A8 requires.
--   2. Activation must re-state the price (packEditSchema), so a placeholder cannot go
--      live by one careless toggle.
--
-- ON CONFLICT DO NOTHING: re-running migrations must never overwrite a price the owner
-- has since set.
INSERT INTO "credit_packs" ("id", "credits", "price_uzs", "is_active", "sort_order") VALUES
  ('pack_1',   1,   9000, false, 1),
  ('pack_5',   5,  40000, false, 2),
  ('pack_15', 15, 105000, false, 3)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- D-008 / Addendum A §A4 step 2. Structure only: every field null.
--
-- NO CARD NUMBER IS SEEDED. This file is committed and this repo will have a remote, so
-- the owner sets it through PATCH /api/owner/settings/payment_instructions.
INSERT INTO "site_settings" ("key", "value") VALUES
  ('payment_instructions', '{"cardNumber":null,"cardHolder":null,"paymeUrl":null,"clickUrl":null,"instructionsUz":null}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- D-023 already records these three, and they are published support addresses rather
-- than secrets, so seeding them saves the owner a step.
INSERT INTO "site_settings" ("key", "value") VALUES
  ('support_contacts', '{"telegramUser":"@dostonsulaymon_wk","telegramBot":"@apl_league_standings_bot","email":"dostonqosimiy19@gmail.com"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
