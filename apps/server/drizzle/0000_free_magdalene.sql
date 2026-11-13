CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`username` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_expires_at` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `choices` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`target_scene_id` text,
	`text` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`conditions` text DEFAULT '[]' NOT NULL,
	`effects` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_choices_scene_id` ON `choices` (`scene_id`);--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`current_scene_id` text NOT NULL,
	`inventory` text DEFAULT '[]' NOT NULL,
	`variables` text DEFAULT '{}' NOT NULL,
	`visited_scene_ids` text DEFAULT '[]' NOT NULL,
	`log` text DEFAULT '[]' NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`undo_stack` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_game_sessions_quest_id` ON `game_sessions` (`quest_id`);--> statement-breakpoint
CREATE INDEX `idx_game_sessions_updated_at` ON `game_sessions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_scene_id` text,
	`initial_variables` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`ending` text DEFAULT 'none' NOT NULL,
	`pos_x` real DEFAULT 80 NOT NULL,
	`pos_y` real DEFAULT 80 NOT NULL,
	`image_url` text,
	`audio_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scenes_quest_id` ON `scenes` (`quest_id`);