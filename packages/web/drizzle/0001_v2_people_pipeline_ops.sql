CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `crew_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text,
	`actor_label` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`revision` integer,
	`note` text,
	`data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_audit_entity_idx` ON `crew_audit` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `crew_audit_action_idx` ON `crew_audit` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `crew_opportunities` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`operator_entity` text NOT NULL,
	`role_keys` text NOT NULL,
	`status` text NOT NULL,
	`accepts_applications` integer DEFAULT false NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crew_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`operation` text NOT NULL,
	`op_version` integer DEFAULT 1 NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 8 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claimed_by` text,
	`claim_expires_at` integer,
	`last_error` text,
	`last_error_class` text,
	`receipt_id` text,
	`canonical_id` text,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_outbox_idem_uq` ON `crew_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `crew_outbox_due_idx` ON `crew_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `crew_outbox_agg_idx` ON `crew_outbox` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE TABLE `crew_people` (
	`id` text PRIMARY KEY NOT NULL,
	`email_normalized` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone_normalized` text,
	`phone_shared` integer DEFAULT false NOT NULL,
	`user_id` text,
	`linked_at` integer,
	`linked_via` text,
	`authority` text DEFAULT 'local_staging' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_people_email_uq` ON `crew_people` (`email_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `crew_people_user_uq` ON `crew_people` (`user_id`);--> statement-breakpoint
CREATE INDEX `crew_people_phone_idx` ON `crew_people` (`phone_normalized`);--> statement-breakpoint
CREATE TABLE `crew_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crew_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `person_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`revoked_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_link_tokens_hash_uq` ON `person_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `person_link_tokens_person_idx` ON `person_link_tokens` (`person_id`);--> statement-breakpoint
CREATE TABLE `serve_interest` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email_normalized` text NOT NULL,
	`phone_normalized` text,
	`city` text,
	`areas` text NOT NULL,
	`availability` text NOT NULL,
	`notes` text,
	`consent_version` text NOT NULL,
	`consent_at` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`authority` text DEFAULT 'local_staging' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serve_interest_email_uq` ON `serve_interest` (`email_normalized`);--> statement-breakpoint
CREATE TABLE `staff_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`event_id` text,
	`department_key` text,
	`granted_by` text NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` text
);
--> statement-breakpoint
CREATE INDEX `staff_memberships_user_idx` ON `staff_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `crew_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text NOT NULL,
	`format` text NOT NULL,
	`scheduled_at` integer,
	`interviewer_user_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_interviews_app_idx` ON `crew_interviews` (`application_id`);--> statement-breakpoint
CREATE TABLE `crew_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`person_id` text NOT NULL,
	`terms_id` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	`issued_by` text NOT NULL,
	`responded_at` integer,
	`response_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_offers_person_idx` ON `crew_offers` (`person_id`);--> statement-breakpoint
CREATE INDEX `crew_offers_app_idx` ON `crew_offers` (`application_id`);--> statement-breakpoint
CREATE TABLE `crew_qualifications` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`qualification_key` text NOT NULL,
	`verified_by` text NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `crew_qualifications_person_idx` ON `crew_qualifications` (`person_id`);--> statement-breakpoint
CREATE TABLE `crew_scorecards` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text NOT NULL,
	`rubric_version` text NOT NULL,
	`scores` text NOT NULL,
	`evidence` text NOT NULL,
	`recommendation` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crew_scorecards_app_idx` ON `crew_scorecards` (`application_id`);--> statement-breakpoint
CREATE TABLE `crew_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`terms_key` text NOT NULL,
	`version` integer NOT NULL,
	`operator_entity` text NOT NULL,
	`role_key` text NOT NULL,
	`title` text NOT NULL,
	`duties` text NOT NULL,
	`compensation` text NOT NULL,
	`pay_basis` text NOT NULL,
	`schedule` text NOT NULL,
	`engagement_arrangement` text NOT NULL,
	`acceptance_requirements` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`retired_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_terms_key_version_uq` ON `crew_terms` (`terms_key`,`version`);--> statement-breakpoint
CREATE TABLE `crew_training_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`module_key` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`required_for` text NOT NULL,
	`verification` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_training_modules_key_version_uq` ON `crew_training_modules` (`module_key`,`version`);--> statement-breakpoint
CREATE TABLE `crew_training_records` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`module_id` text NOT NULL,
	`completed_at` integer,
	`verified_at` integer,
	`verified_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_training_records_uq` ON `crew_training_records` (`person_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `guest_promoter_links` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`valid_from` integer NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_promoter_links_code_uq` ON `guest_promoter_links` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_promoter_links_event_person_uq` ON `guest_promoter_links` (`event_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `guest_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`guest_key` text NOT NULL,
	`promoter_link_id` text,
	`registered_at` integer NOT NULL,
	`source` text DEFAULT 'test_fixture' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_registrations_event_guest_uq` ON `guest_registrations` (`event_id`,`guest_key`);--> statement-breakpoint
CREATE TABLE `guest_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`result` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`scanned_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guest_scans_event_idx` ON `guest_scans` (`event_id`,`registration_id`);--> statement-breakpoint
CREATE TABLE `ops_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role_key` text NOT NULL,
	`department_key` text NOT NULL,
	`offer_id` text,
	`shift_start_utc` integer,
	`shift_end_utc` integer,
	`shift_confirmed` integer DEFAULT false NOT NULL,
	`supervisor_person_id` text,
	`zones` text DEFAULT '[]' NOT NULL,
	`concurrent_with` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ops_assignments_event_idx` ON `ops_assignments` (`event_id`,`department_key`);--> statement-breakpoint
CREATE INDEX `ops_assignments_person_idx` ON `ops_assignments` (`person_id`);--> statement-breakpoint
CREATE TABLE `ops_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`at_utc` integer NOT NULL,
	`source` text NOT NULL,
	`corrects_id` text,
	`reason` text,
	`recorded_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ops_attendance_assignment_idx` ON `ops_attendance` (`assignment_id`,`at_utc`);--> statement-breakpoint
CREATE TABLE `ops_closeouts` (
	`event_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`coverage_issues` text,
	`training_feedback` text,
	`guest_service_feedback` text,
	`content_handoff` text,
	`incident_refs` text,
	`return_availability` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ops_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`zones` text NOT NULL,
	`issued_by` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_credentials_hash_uq` ON `ops_credentials` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ops_credentials_assignment_idx` ON `ops_credentials` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `ops_event_role_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role_key` text NOT NULL,
	`count` integer,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_event_role_overrides_uq` ON `ops_event_role_overrides` (`event_id`,`role_key`);--> statement-breakpoint
CREATE TABLE `ops_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`template_version_id` text NOT NULL,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`local_date` text,
	`date_confirmed` integer DEFAULT false NOT NULL,
	`resolved_milestones` text,
	`venue_name` text,
	`venue_confirmed` integer DEFAULT false NOT NULL,
	`planning_guests` integer,
	`is_planning_seed` integer DEFAULT false NOT NULL,
	`authority` text DEFAULT 'local_staging' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ops_org_units` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`authority_note` text
);
--> statement-breakpoint
CREATE TABLE `ops_provider_fulfillment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role_key` text NOT NULL,
	`provider` text NOT NULL,
	`count` integer,
	`status` text DEFAULT 'provisional' NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_provider_fulfillment_uq` ON `ops_provider_fulfillment` (`event_id`,`role_key`,`provider`);--> statement-breakpoint
CREATE TABLE `ops_reporting_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`relation` text NOT NULL,
	`child_key` text NOT NULL,
	`parent_key` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_reporting_lines_uq` ON `ops_reporting_lines` (`relation`,`child_key`,`parent_key`);--> statement-breakpoint
CREATE TABLE `ops_run_of_show` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`seq` integer NOT NULL,
	`milestone_key` text,
	`offset_min` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`department_key` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `ops_run_of_show_event_idx` ON `ops_run_of_show` (`event_id`,`seq`);--> statement-breakpoint
CREATE TABLE `ops_template_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`template_version_id` text NOT NULL,
	`role_key` text NOT NULL,
	`title` text NOT NULL,
	`group_key` text NOT NULL,
	`department_key` text NOT NULL,
	`slot_class` text NOT NULL,
	`workforce` text NOT NULL,
	`provider` text,
	`min_count` integer,
	`recommended_count` integer,
	`approved_count` integer,
	`confirmation` text DEFAULT 'proposed' NOT NULL,
	`supervisor_role_key` text,
	`responsibilities` text,
	`call_offset_min` integer,
	`release_offset_min` integer,
	`dress` text,
	`training` text DEFAULT '[]' NOT NULL,
	`qualifications` text DEFAULT '[]' NOT NULL,
	`zones` text DEFAULT '[]' NOT NULL,
	`phase_duties` text DEFAULT '{}' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_template_roles_uq` ON `ops_template_roles` (`template_version_id`,`role_key`);--> statement-breakpoint
CREATE TABLE `ops_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`planning_guests` integer,
	`planning_guest_range` text,
	`milestones` text NOT NULL,
	`source_note` text,
	`published_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_template_versions_uq` ON `ops_template_versions` (`template_id`,`version`);--> statement-breakpoint
CREATE TABLE `ops_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_templates_template_key_unique` ON `ops_templates` (`template_key`);--> statement-breakpoint
CREATE TABLE `cmp_budget_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`proposed_cents` integer NOT NULL,
	`approved_cents` integer,
	`actual_cents` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cmp_budget_lines_uq` ON `cmp_budget_lines` (`campaign_id`,`category`);--> statement-breakpoint
CREATE TABLE `cmp_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`concept` text NOT NULL,
	`code` text NOT NULL,
	`start_date` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`owner_user_id` text,
	`owner_label` text,
	`is_planning_seed` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cmp_campaigns_code_unique` ON `cmp_campaigns` (`code`);--> statement-breakpoint
CREATE TABLE `cmp_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`role_key` text NOT NULL,
	`label` text NOT NULL,
	`target` integer NOT NULL,
	`reserve` integer DEFAULT 0 NOT NULL,
	`existing_qualified` integer,
	`owner_label` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cmp_goals_uq` ON `cmp_goals` (`campaign_id`,`role_key`);--> statement-breakpoint
CREATE TABLE `cmp_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`label` text NOT NULL,
	`role_hint` text,
	`utm_source` text NOT NULL,
	`utm_medium` text NOT NULL,
	`utm_content` text,
	`qr_code` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cmp_links_campaign_idx` ON `cmp_links` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `cmp_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`phase` text,
	`day_offset` integer,
	`title` text NOT NULL,
	`channel` text,
	`owner_label` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cmp_tasks_campaign_idx` ON `cmp_tasks` (`campaign_id`,`kind`);--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `person_id` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `opportunity_key` text DEFAULT 'general_interest' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `pathway` text DEFAULT 'legacy_mixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `contract_version` text DEFAULT 'crew-application.v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `legacy_status` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `status_flags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `reviewer_user_id` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `review_due_at` integer;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `authority` text DEFAULT 'local_staging' NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `travel_range` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `relevant_experience` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `scenario_response` text;--> statement-breakpoint
ALTER TABLE `crew_applications` ADD `portfolio_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `crew_applications_email_opp_uq` ON `crew_applications` (`email_normalized`,`opportunity_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `crew_applications_person_opp_uq` ON `crew_applications` (`person_id`,`opportunity_key`);--> statement-breakpoint
-- Reviewed: the v1 email-only unique index is dropped only AFTER its (email, opportunity) replacement exists.
DROP INDEX `crew_applications_email_uq`;--> statement-breakpoint
CREATE INDEX `crew_applications_status_idx` ON `crew_applications` (`application_status`,`created_at`);