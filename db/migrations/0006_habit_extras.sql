CREATE TABLE `energy_checkins` (
	`user_id` text DEFAULT '' NOT NULL,
	`day` text NOT NULL,
	`level` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
ALTER TABLE `habits` ADD `tiny` text;--> statement-breakpoint
ALTER TABLE `habits` ADD `time_of_day` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `archived_at` text;--> statement-breakpoint
-- Rename case-duplicate category names (keep the oldest) so the unique index below can be created.
UPDATE `categories` SET `name` = `name` || ' (' || substr(`id`, 1, 4) || ')' WHERE rowid NOT IN (SELECT min(rowid) FROM `categories` GROUP BY `user_id`, lower(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_unique` ON `categories` (`user_id`,lower("name"));