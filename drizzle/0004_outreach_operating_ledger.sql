CREATE TABLE `candidateIdentities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`canonicalName` varchar(255) NOT NULL,
	`canonicalEmail` varchar(320),
	`canonicalPhone` varchar(50),
	`location` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidateIdentities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidateSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateIdentityId` int NOT NULL,
	`candidateId` int NOT NULL,
	`platformId` int NOT NULL,
	`externalId` varchar(255),
	`profileUrl` text,
	`profileHash` varchar(128),
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidateSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaignReadinessChecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('ready','warning','blocked') NOT NULL,
	`checksJson` text NOT NULL,
	`blockersJson` text,
	`warningsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignReadinessChecks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`campaignId` int NOT NULL,
	`candidateId` int NOT NULL,
	`userId` int NOT NULL,
	`decision` enum('approved','rejected') NOT NULL,
	`decisionReason` text,
	`approvedContentSnapshot` text,
	`approvedSubjectSnapshot` varchar(500),
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messageApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageSendAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`campaignId` int NOT NULL,
	`candidateId` int NOT NULL,
	`platformId` int NOT NULL,
	`status` enum('blocked','started','succeeded','failed') NOT NULL DEFAULT 'started',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`errorMessage` text,
	`externalMessageId` varchar(255),
	`confirmationText` text,
	`retryCount` int NOT NULL DEFAULT 0,
	`rateLimitState` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messageSendAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidateResponses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`messageId` int,
	`platformId` int NOT NULL,
	`rawContent` text NOT NULL,
	`normalizedContent` text,
	`classification` enum('interested','not_interested','more_info','unavailable','no_response','unknown') NOT NULL DEFAULT 'unknown',
	`confidence` int NOT NULL DEFAULT 0,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`source` enum('manual','platform','import') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candidateResponses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queueJobRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`campaignId` int,
	`messageId` int,
	`queueName` enum('messages','discovery') NOT NULL,
	`jobType` varchar(100) NOT NULL,
	`status` enum('waiting','active','completed','failed','delayed','cancelled') NOT NULL DEFAULT 'waiting',
	`payloadJson` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `queueJobRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rateLimitEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platformId` int,
	`campaignId` int,
	`eventType` varchar(100) NOT NULL,
	`severity` enum('info','warning','blocked') NOT NULL DEFAULT 'info',
	`detailJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rateLimitEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credentialEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platformId` int NOT NULL,
	`eventType` enum('saved','tested','failed','disconnected') NOT NULL,
	`status` enum('ok','warning','error') NOT NULL DEFAULT 'ok',
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credentialEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int NOT NULL,
	`campaignId` int,
	`action` varchar(120) NOT NULL,
	`actor` enum('user','system') NOT NULL DEFAULT 'system',
	`source` varchar(120),
	`beforeState` text,
	`afterState` text,
	`riskLevel` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`approvalId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
