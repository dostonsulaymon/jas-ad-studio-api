CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"goal" text NOT NULL,
	"format_id" text NOT NULL,
	"platform" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"duration_seconds" integer DEFAULT 10 NOT NULL,
	"audience" text,
	"offer" jsonb,
	"confirmed_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gallery_inspiration_id" text,
	"brief_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_duration_check" CHECK ("projects"."duration_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id","created_at");