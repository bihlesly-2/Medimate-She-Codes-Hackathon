CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"detail" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"caretaker_id" uuid,
	"invited_phone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alert_detail" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checkups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"location" text,
	"notes" text,
	"remind_day_before" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"version" text NOT NULL,
	"channel" text NOT NULL,
	"scope" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"topic" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" uuid,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"medicine_name" text NOT NULL,
	"medicine_id" uuid,
	"dose_text" text NOT NULL,
	"frequency_text" text NOT NULL,
	"times" jsonb NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"refill_date" date,
	"notes" text,
	"timezone" text NOT NULL,
	"sms_reminders" boolean DEFAULT true NOT NULL,
	"caretaker_alerts" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicine_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medicine_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"notes" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"generic_name" text NOT NULL,
	"strength" text DEFAULT '' NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"info_status" text DEFAULT 'none' NOT NULL,
	"indications" text,
	"usage_notes" text,
	"warnings" text,
	"interactions" text,
	"storage" text,
	"side_effects" text,
	"source_authority" text,
	"source_url" text,
	"source_version_date" date,
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"verified_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicines_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"sender_id" uuid,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"period_days" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"trans_id" text,
	"checkout_url" text,
	"provider_status" text,
	"last_checked_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_trans_id_unique" UNIQUE("trans_id")
);
--> statement-breakpoint
CREATE TABLE "pharmacies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"area" text NOT NULL,
	"town" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"timezone" text DEFAULT 'Africa/Douala' NOT NULL,
	"verification_status" text DEFAULT 'draft' NOT NULL,
	"verified_until" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pharmacies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pharmacy_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens" text NOT NULL,
	"closes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_staff" (
	"user_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pharmacy_staff_user_id_pharmacy_id_pk" PRIMARY KEY("user_id","pharmacy_id")
);
--> statement-breakpoint
CREATE TABLE "pharmacy_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"price" numeric(12, 2),
	"currency" text DEFAULT 'XAF' NOT NULL,
	"stock_state" text DEFAULT 'unknown' NOT NULL,
	"quantity" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "pharmacy_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"status" text NOT NULL,
	"actor_id" uuid,
	"licence_number" text,
	"document_reference" text,
	"notes" text,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"severity" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"medicine_name" text,
	"show_to_clinician" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"channel" text,
	"actor_id" uuid,
	"idempotency_key" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"plan_id" uuid,
	"checkup_id" uuid,
	"ref_code" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"followup_sent_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_channel" text,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_occurrences_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"pharmacy_id" uuid NOT NULL,
	"stock_id" uuid,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"user_id" uuid,
	"body" text,
	"body_expires_at" timestamp with time zone,
	"command" text,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"segments" integer DEFAULT 1 NOT NULL,
	"encoding" text DEFAULT 'GSM-7' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_sessions" (
	"phone" text PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"pending" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"steps" integer NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"price" numeric(12, 2),
	"stock_state" text NOT NULL,
	"quantity" integer,
	"actor_id" uuid,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"trial_started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"premium_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"firebase_uid" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"date_of_birth" date,
	"language" text DEFAULT 'en' NOT NULL,
	"area" text,
	"timezone" text DEFAULT 'Africa/Douala' NOT NULL,
	"step_goal" integer DEFAULT 6000 NOT NULL,
	"water_target_ml" integer DEFAULT 2000 NOT NULL,
	"allergies" text,
	"conditions" text,
	"created_via" text DEFAULT 'web' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE "ussd_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"state" jsonb NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vital_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" numeric(8, 2) NOT NULL,
	"value2" numeric(8, 2),
	"unit" text NOT NULL,
	"entered_value" numeric(8, 2),
	"entered_unit" text,
	"measured_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_ml" integer NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_caretaker_id_users_id_fk" FOREIGN KEY ("caretaker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_plans" ADD CONSTRAINT "medication_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_plans" ADD CONSTRAINT "medication_plans_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_reviews" ADD CONSTRAINT "medicine_reviews_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_hours" ADD CONSTRAINT "pharmacy_hours_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD CONSTRAINT "pharmacy_stock_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD CONSTRAINT "pharmacy_stock_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_verifications" ADD CONSTRAINT "pharmacy_verifications_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_logs" ADD CONSTRAINT "reaction_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_occurrence_id_reminder_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."reminder_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_plan_id_medication_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."medication_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_checkup_id_checkups_id_fk" FOREIGN KEY ("checkup_id") REFERENCES "public"."checkups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_stock_id_pharmacy_stock_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."pharmacy_stock"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_logs" ADD CONSTRAINT "step_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_stock_id_pharmacy_stock_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."pharmacy_stock"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vital_readings" ADD CONSTRAINT "vital_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "care_links_patient_idx" ON "care_links" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "care_links_caretaker_idx" ON "care_links" USING btree ("caretaker_id");--> statement-breakpoint
CREATE INDEX "care_links_phone_idx" ON "care_links" USING btree ("invited_phone");--> statement-breakpoint
CREATE INDEX "checkups_user_idx" ON "checkups" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "consents_user_purpose_idx" ON "consents" USING btree ("user_id","purpose","seq");--> statement-breakpoint
CREATE INDEX "tips_status_lang_idx" ON "health_tips" USING btree ("status","language");--> statement-breakpoint
CREATE INDEX "inquiries_pharmacy_status_idx" ON "inquiries" USING btree ("pharmacy_id","status");--> statement-breakpoint
CREATE INDEX "inquiries_patient_idx" ON "inquiries" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "medication_plans" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "medicine_reviews_medicine_idx" ON "medicine_reviews" USING btree ("medicine_id","created_at");--> statement-breakpoint
CREATE INDEX "medicines_name_idx" ON "medicines" USING btree ("name");--> statement-breakpoint
CREATE INDEX "medicines_generic_idx" ON "medicines" USING btree ("generic_name");--> statement-breakpoint
CREATE INDEX "messages_inquiry_idx" ON "messages" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "otp_phone_created_idx" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "pharmacies_status_idx" ON "pharmacies" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "pharmacies_area_idx" ON "pharmacies" USING btree ("area");--> statement-breakpoint
CREATE INDEX "pharmacy_hours_pharmacy_idx" ON "pharmacy_hours" USING btree ("pharmacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_stock_unique" ON "pharmacy_stock" USING btree ("pharmacy_id","medicine_id");--> statement-breakpoint
CREATE INDEX "pharmacy_stock_medicine_fresh_idx" ON "pharmacy_stock" USING btree ("medicine_id","updated_at");--> statement-breakpoint
CREATE INDEX "pharmacy_verifications_pharmacy_idx" ON "pharmacy_verifications" USING btree ("pharmacy_id","created_at");--> statement-breakpoint
CREATE INDEX "reactions_user_idx" ON "reaction_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reminder_events_occurrence_idx" ON "reminder_events" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "occurrences_due_idx" ON "reminder_occurrences" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "occurrences_user_idx" ON "reminder_occurrences" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_logs_phone_idx" ON "sms_logs" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "steps_user_date_idx" ON "step_logs" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "stock_events_pharmacy_idx" ON "stock_events" USING btree ("pharmacy_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_trial_end_idx" ON "subscriptions" USING btree ("trial_ends_at");--> statement-breakpoint
CREATE INDEX "ussd_sessions_phone_idx" ON "ussd_sessions" USING btree ("phone","last_active_at");--> statement-breakpoint
CREATE INDEX "vitals_user_type_idx" ON "vital_readings" USING btree ("user_id","type","measured_at");--> statement-breakpoint
CREATE INDEX "water_user_date_idx" ON "water_logs" USING btree ("user_id","local_date");