CREATE TABLE "pro_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_uzs" bigint NOT NULL,
	"days" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payer_reference" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "pro_orders" ADD CONSTRAINT "pro_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_orders" ADD CONSTRAINT "pro_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- One pending PRO order per seller: the second attempt returns the first rather than
-- queueing two payments for the same thing. Enforced by the database, like every other
-- money rule here, not by a read-then-write in application code.
CREATE UNIQUE INDEX "pro_orders_one_pending_per_user" ON "pro_orders" ("user_id") WHERE "status" = 'pending';
