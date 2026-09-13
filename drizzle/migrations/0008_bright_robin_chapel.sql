CREATE TABLE "gallery_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_uz" text NOT NULL,
	"category" text NOT NULL,
	"style" text NOT NULL,
	"video_path" text NOT NULL,
	"poster_path" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"duration_seconds" real NOT NULL,
	"prompt_en" text NOT NULL,
	"concept_uz" text NOT NULL,
	"creative_preset" jsonb NOT NULL,
	"source_type" text NOT NULL,
	"source_note" text DEFAULT '' NOT NULL,
	"flow_model" text,
	"flow_mode" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "gallery_examples_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "gallery_examples" ADD CONSTRAINT "gallery_examples_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;