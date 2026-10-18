ALTER TABLE `profiles` ADD `archive_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER entries_archive_insert AFTER INSERT ON entries BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id=NEW.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER entries_archive_update AFTER UPDATE ON entries BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id IN (OLD.owner_id,NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER entries_archive_delete AFTER DELETE ON entries BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id=OLD.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER assets_archive_insert AFTER INSERT ON assets BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id=NEW.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER assets_archive_update AFTER UPDATE ON assets BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id IN (OLD.owner_id,NEW.owner_id);
END;
--> statement-breakpoint
CREATE TRIGGER assets_archive_delete AFTER DELETE ON assets BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id=OLD.owner_id;
END;
--> statement-breakpoint
CREATE TRIGGER profile_archive_update AFTER UPDATE OF name,birthday,theme ON profiles
WHEN OLD.name IS NOT NEW.name OR OLD.birthday IS NOT NEW.birthday OR OLD.theme IS NOT NEW.theme
BEGIN
  UPDATE profiles SET archive_revision=archive_revision+1 WHERE id=NEW.id;
END;
