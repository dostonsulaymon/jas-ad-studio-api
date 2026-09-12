CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"target_id" text NOT NULL,
	"prompt_version" text,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"est_cost_usd" numeric(10, 6),
	"error_code" text,
	"questions_uz" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_uz" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generations_status_check" CHECK ("generations"."status" IN ('queued','running','ready','needs_input','refused','failed')),
	CONSTRAINT "generations_lease_pairing" CHECK (("generations"."lease_token" IS NULL) = ("generations"."lease_until" IS NULL)),
	CONSTRAINT "generations_finished_pairing" CHECK (("generations"."status" IN ('ready','needs_input','refused','failed')) = ("generations"."finished_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "needs_input_cache" (
	"input_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"questions_uz" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"generation_id" uuid PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"prompt_en" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs_input_cache" ADD CONSTRAINT "needs_input_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs_input_cache" ADD CONSTRAINT "needs_input_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generations_user_key" ON "generations" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generations_one_active_per_user" ON "generations" USING btree ("user_id") WHERE "generations"."status" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "generations_sweep_idx" ON "generations" USING btree ("lease_until") WHERE "generations"."status" = 'running';--> statement-breakpoint
CREATE INDEX "generations_spend_idx" ON "generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "needs_input_project_idx" ON "needs_input_cache" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;