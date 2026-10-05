CREATE TABLE `crew_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`phone` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`role_interest` text NOT NULL,
	`instagram` text,
	`tiktok` text,
	`other_social` text,
	`network_types` text NOT NULL,
	`availability` text NOT NULL,
	`evenings_available` integer NOT NULL,
	`weekends_available` integer NOT NULL,
	`promoter_invite_range` text,
	`promoter_experience` integer,
	`promoter_experience_notes` text,
	`host_interests` text NOT NULL,
	`motivation` text NOT NULL,
	`referral_source` text NOT NULL,
	`referral_code_used` text,
	`referral_code_status` text,
	`campaign` text,
	`event_id` text,
	`qr_campaign` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_content` text,
	`utm_term` text,
	`referring_url` text,
	`landing_path` text,
	`entry_point` text,
	`attribution_json` text,
	`application_status` text DEFAULT 'submitted' NOT NULL,
	`required_consent_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`marketing_consent_at` integer,
	`sync_status` text DEFAULT 'not_configured' NOT NULL,
	`sync_attempts` integer DEFAULT 0 NOT NULL,
	`sync_error` text,
	`synced_at` integer,
	`external_id` text,
	`duplicate_attempts` integer DEFAULT 0 NOT NULL,
	`last_duplicate_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_applications_email_uq` ON `crew_applications` (`email_normalized`);--> statement-breakpoint
CREATE INDEX `crew_applications_phone_idx` ON `crew_applications` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `crew_applications_created_idx` ON `crew_applications` (`created_at`);--> statement-breakpoint
CREATE INDEX `crew_applications_ref_idx` ON `crew_applications` (`referral_code_used`);--> statement-breakpoint
CREATE INDEX `crew_applications_sync_idx` ON `crew_applications` (`sync_status`);--> statement-breakpoint
CREATE TABLE `crew_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`session_id` text,
	`props` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_events_name_idx` ON `crew_events` (`name`,`created_at`);