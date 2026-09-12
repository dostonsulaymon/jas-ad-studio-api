CREATE TABLE "credit_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_non_negative" CHECK ("credit_accounts"."available" >= 0 AND "credit_accounts"."reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"order_id" uuid,
	"generation_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_type_check" CHECK ("credit_ledger"."type" IN ('purchase','owner_grant','reserve','debit','release')),
	CONSTRAINT "credit_ledger_amount_check" CHECK ("credit_ledger"."amount" > 0),
	CONSTRAINT "credit_ledger_grant_needs_note" CHECK ("credit_ledger"."type" <> 'owner_grant' OR ("credit_ledger"."note" IS NOT NULL AND length(btrim("credit_ledger"."note")) > 0)),
	CONSTRAINT "credit_ledger_purchase_needs_order" CHECK ("credit_ledger"."type" <> 'purchase' OR "credit_ledger"."order_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "credit_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_uzs" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text NOT NULL,
	"payer_reference" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	CONSTRAINT "credit_orders_status_check" CHECK ("credit_orders"."status" IN ('pending','paid','rejected','cancelled')),
	CONSTRAINT "credit_orders_method_check" CHECK ("credit_orders"."payment_method" IN ('card_transfer','payme','click','other')),
	CONSTRAINT "credit_orders_credits_check" CHECK ("credit_orders"."credits" > 0 AND "credit_orders"."amount_uzs" > 0),
	CONSTRAINT "credit_orders_reference_len" CHECK ("credit_orders"."payer_reference" IS NULL OR length("credit_orders"."payer_reference") <= 120),
	CONSTRAINT "credit_orders_paid_needs_confirmer" CHECK (("credit_orders"."status" = 'paid') = ("credit_orders"."confirmed_at" IS NOT NULL)),
	CONSTRAINT "credit_orders_rejected_needs_reason" CHECK ("credit_orders"."status" <> 'rejected' OR "credit_orders"."rejection_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"credits" integer NOT NULL,
	"price_uzs" bigint,
	"is_active" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_packs_credits_check" CHECK ("credit_packs"."credits" > 0),
	CONSTRAINT "credit_packs_price_check" CHECK ("credit_packs"."price_uzs" IS NULL OR "credit_packs"."price_uzs" > 0),
	CONSTRAINT "credit_packs_active_needs_price" CHECK (NOT "credit_packs"."is_active" OR "credit_packs"."price_uzs" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_order_id_credit_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."credit_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_orders" ADD CONSTRAINT "credit_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_orders" ADD CONSTRAINT "credit_orders_pack_id_credit_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."credit_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_orders" ADD CONSTRAINT "credit_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_one_purchase_per_order" ON "credit_ledger" USING btree ("order_id") WHERE "credit_ledger"."type" = 'purchase';--> statement-breakpoint
CREATE INDEX "credit_orders_user_idx" ON "credit_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_orders_pending_idx" ON "credit_orders" USING btree ("created_at") WHERE "credit_orders"."status" = 'pending';