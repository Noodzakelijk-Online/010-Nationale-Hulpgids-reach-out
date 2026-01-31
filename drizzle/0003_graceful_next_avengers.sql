ALTER TABLE `campaigns` MODIFY COLUMN `status` enum('draft','active','paused','completed','scheduled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `isScheduled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `scheduledFor` timestamp;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `isRecurring` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `recurringPattern` varchar(50);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `lastExecutedAt` timestamp;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `nextExecutionAt` timestamp;