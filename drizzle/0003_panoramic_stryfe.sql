CREATE TABLE `billing_checkouts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`claim` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `period` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `provider_plan` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `paid_until` text;
--> statement-breakpoint
CREATE TRIGGER entries_media_insert BEFORE INSERT ON entries
WHEN EXISTS(SELECT 1 FROM json_each(NEW.assets) j WHERE NOT EXISTS(SELECT 1 FROM assets a WHERE a.id=j.value AND a.owner_id=NEW.owner_id AND a.state='ready'))
BEGIN SELECT RAISE(ABORT,'entry_media_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER entries_media_update BEFORE UPDATE OF assets ON entries
WHEN EXISTS(SELECT 1 FROM json_each(NEW.assets) j WHERE NOT EXISTS(SELECT 1 FROM assets a WHERE a.id=j.value AND a.owner_id=NEW.owner_id AND a.state='ready'))
BEGIN SELECT RAISE(ABORT,'entry_media_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_delete_claim BEFORE UPDATE OF state ON assets
WHEN NEW.state='deleting' AND EXISTS(SELECT 1 FROM entries e,json_each(e.assets) j WHERE j.value=NEW.id)
BEGIN SELECT RAISE(ABORT,'asset_in_use'); END;
--> statement-breakpoint
CREATE TRIGGER entries_active_owner BEFORE INSERT ON entries
WHEN NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=NEW.owner_id AND p.status='active')
BEGIN SELECT RAISE(ABORT,'account_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER entries_active_update BEFORE UPDATE ON entries
WHEN NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=NEW.owner_id AND p.status='active')
BEGIN SELECT RAISE(ABORT,'account_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_active_owner BEFORE INSERT ON assets
WHEN NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=NEW.owner_id AND p.status='active')
BEGIN SELECT RAISE(ABORT,'account_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER assets_ready_owner BEFORE UPDATE OF state ON assets
WHEN NEW.state='ready' AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=NEW.owner_id AND p.status='active')
BEGIN SELECT RAISE(ABORT,'account_unavailable'); END;
--> statement-breakpoint
CREATE INDEX idx_assets_owner_id ON assets(owner_id,id);
--> statement-breakpoint
CREATE INDEX idx_members_user_state ON members(user_id,state,circle_id);
