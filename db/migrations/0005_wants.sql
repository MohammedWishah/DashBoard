CREATE TABLE `wants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`url` text,
	`created_at` text NOT NULL,
	`ready_at` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`decided_at` text,
	`expense_id` text,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wants_user_idx` ON `wants` (`user_id`);