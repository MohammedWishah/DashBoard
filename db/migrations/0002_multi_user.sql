CREATE TABLE `agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_hash_unique` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_user_idx` ON `agent_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text DEFAULT '' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "key", "value") SELECT '', "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
ALTER TABLE `categories` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
ALTER TABLE `debt_payments` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `debt_payments_user_idx` ON `debt_payments` (`user_id`);--> statement-breakpoint
ALTER TABLE `debts` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `debts_user_idx` ON `debts` (`user_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `expenses_user_spent_on_idx` ON `expenses` (`user_id`,`spent_on`);--> statement-breakpoint
ALTER TABLE `income` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `income_user_received_on_idx` ON `income` (`user_id`,`received_on`);--> statement-breakpoint
ALTER TABLE `projects` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
ALTER TABLE `recurring_bills` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `recurring_bills_user_idx` ON `recurring_bills` (`user_id`);--> statement-breakpoint
ALTER TABLE `savings_contributions` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `savings_contributions_user_idx` ON `savings_contributions` (`user_id`);--> statement-breakpoint
ALTER TABLE `savings_goals` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `savings_goals_user_idx` ON `savings_goals` (`user_id`);--> statement-breakpoint
ALTER TABLE `shipped_events` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `shipped_events_user_idx` ON `shipped_events` (`user_id`);