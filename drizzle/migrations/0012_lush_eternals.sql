CREATE TABLE "pro_access" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_until" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'owner_grant' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "gallery_examples" ADD COLUMN "prompt_access" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "pro_access" ADD CONSTRAINT "pro_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_access" ADD CONSTRAINT "pro_access_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;