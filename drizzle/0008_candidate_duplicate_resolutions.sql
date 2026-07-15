CREATE TABLE `candidateDuplicateResolutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`targetCandidateId` int NOT NULL,
	`sourceCandidateId` int NOT NULL,
	`decision` enum('merged','not_duplicate') NOT NULL,
	`confidence` int NOT NULL DEFAULT 0,
	`reasonsJson` text,
	`decisionReason` text NOT NULL,
	`resolvedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidateDuplicateResolutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `candidateDuplicateResolutions` ADD CONSTRAINT `candidateDuplicateResolutions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidateDuplicateResolutions` ADD CONSTRAINT `candidateDuplicateResolutions_targetCandidateId_candidates_id_fk` FOREIGN KEY (`targetCandidateId`) REFERENCES `candidates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidateDuplicateResolutions` ADD CONSTRAINT `candidateDuplicateResolutions_sourceCandidateId_candidates_id_fk` FOREIGN KEY (`sourceCandidateId`) REFERENCES `candidates`(`id`) ON DELETE cascade ON UPDATE no action;
