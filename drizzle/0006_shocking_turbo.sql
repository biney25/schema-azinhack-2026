CREATE TABLE `consent_choices` (
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`enabled` integer NOT NULL,
	`notice_version` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `purpose`)
);
--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`enabled` integer NOT NULL,
	`notice_version` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_consent_events_owner_created` ON `consent_events` (`owner_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_owner_state` ON `jobs` (`owner_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_jobs_due` ON `jobs` (`state`,`available_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jobs_dedupe` ON `jobs` (`owner_id`,`kind`,`dedupe_key`);--> statement-breakpoint
ALTER TABLE `assets` ADD `checksum` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `text_size` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `question_mode` text DEFAULT 'gentle' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `onboarding_step` text DEFAULT 'welcome' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `preferences_version` integer DEFAULT 1 NOT NULL;

--> statement-breakpoint
CREATE TRIGGER shares_explicit_consent BEFORE INSERT ON shares
WHEN NOT EXISTS(SELECT 1 FROM consent_choices c JOIN profiles p ON p.id=c.owner_id WHERE c.owner_id=NEW.owner_id AND c.purpose='sharing' AND c.enabled=1 AND p.status='active')
BEGIN SELECT RAISE(ABORT,'sharing_not_allowed'); END;
--> statement-breakpoint
CREATE TRIGGER members_explicit_consent BEFORE INSERT ON members
WHEN NEW.state='pending' AND NOT EXISTS(SELECT 1 FROM circles s JOIN consent_choices c ON c.owner_id=s.owner_id JOIN profiles p ON p.id=s.owner_id WHERE s.id=NEW.circle_id AND c.purpose='sharing' AND c.enabled=1 AND p.status='active')
BEGIN SELECT RAISE(ABORT,'sharing_not_allowed'); END;
