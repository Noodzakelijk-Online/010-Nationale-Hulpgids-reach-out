CREATE TABLE `messageSnippets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`language` enum('nl','en') NOT NULL DEFAULT 'nl',
	`tonePreset` enum('careful','warm','concise') NOT NULL DEFAULT 'careful',
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messageSnippets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messageSnippets` ADD CONSTRAINT `messageSnippets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
