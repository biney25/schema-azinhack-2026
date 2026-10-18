ALTER TABLE `shares` ADD `recipient_id` text;--> statement-breakpoint
ALTER TABLE `shares` ADD `state` text DEFAULT 'pending' NOT NULL;