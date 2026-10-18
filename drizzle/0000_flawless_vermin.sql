CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assets_owner` ON `assets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_owner` ON `audit` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`owner_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `blocked_id`)
);
--> statement-breakpoint
CREATE TABLE `circles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_circles_owner` ON `circles` (`owner_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`mood` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'rose' NOT NULL,
	`layout` text DEFAULT 'collage' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`people` text DEFAULT '[]' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`blocks` text DEFAULT '[]' NOT NULL,
	`assets` text DEFAULT '[]' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`ai_allowed` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entries_owner_date` ON `entries` (`owner_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `idx_entries_owner_updated` ON `entries` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`circle_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	PRIMARY KEY(`circle_id`, `email`)
);
--> statement-breakpoint
CREATE INDEX `idx_members_email_state` ON `members` (`email`,`state`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'rose' NOT NULL,
	`birthday` text,
	`ai_consent` integer DEFAULT 0 NOT NULL,
	`quiet` integer DEFAULT 0 NOT NULL,
	`onboarded` integer DEFAULT 0 NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`storage_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_profiles_email` ON `profiles` (`email`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`share_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`state` text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`email` text,
	`circle_id` text,
	`snapshot` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shares_owner` ON `shares` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_shares_email` ON `shares` (`email`);--> statement-breakpoint
CREATE INDEX `idx_shares_circle` ON `shares` (`circle_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`plan` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_owner` ON `subscriptions` (`owner_id`);--> statement-breakpoint
CREATE TABLE `usage` (
	`owner_id` text NOT NULL,
	`period` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `period`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
