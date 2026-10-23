CREATE TABLE `ops_canonical_roles` (
	`canonical_role_id` text PRIMARY KEY NOT NULL,
	`role_key` text NOT NULL,
	`display_name` text NOT NULL,
	`legacy_display_name` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`match_class` text NOT NULL,
	`legacy_role_key` text,
	`department` text NOT NULL,
	`department_key` text NOT NULL,
	`workstream` text NOT NULL,
	`entity_id` text NOT NULL,
	`opportunity_type` text NOT NULL,
	`engagement_type` text NOT NULL,
	`baseline_headcount` integer NOT NULL,
	`headcount_model` text NOT NULL,
	`event_applicability` text NOT NULL,
	`event_applicability_key` text NOT NULL,
	`seniority` text NOT NULL,
	`reports_to` text NOT NULL,
	`reports_to_role_key` text,
	`reports_to_canonical_id` text,
	`reports_to_org_unit` text,
	`status` text NOT NULL,
	`role_summary` text NOT NULL,
	`pre_event_responsibilities` text NOT NULL,
	`load_in_responsibilities` text NOT NULL,
	`live_event_responsibilities` text NOT NULL,
	`closeout_responsibilities` text NOT NULL,
	`dress_code` text NOT NULL,
	`credential_level` text NOT NULL,
	`training_requirements` text NOT NULL,
	`import_version` text NOT NULL,
	`source_system` text NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_canonical_roles_role_key_uq` ON `ops_canonical_roles` (`role_key`);--> statement-breakpoint
ALTER TABLE `ops_template_roles` ADD `canonical_role_id` text;--> statement-breakpoint
ALTER TABLE `ops_template_roles` ADD `enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `ops_template_roles` ADD `required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ops_templates` ADD `entity_id` text;--> statement-breakpoint
ALTER TABLE `ops_templates` ADD `updated_at` integer;