CREATE TABLE `candidateQualificationDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`decision` enum('qualified','not_qualified','needs_review') NOT NULL,
	`reason` text NOT NULL,
	`sensitiveAssumptionsAcknowledged` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidateQualificationDecisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `candidateQualificationDecisions` ADD CONSTRAINT `candidateQualificationDecisions_candidateId_candidates_id_fk` FOREIGN KEY (`candidateId`) REFERENCES `candidates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidateQualificationDecisions` ADD CONSTRAINT `candidateQualificationDecisions_campaignId_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidateQualificationDecisions` ADD CONSTRAINT `candidateQualificationDecisions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
