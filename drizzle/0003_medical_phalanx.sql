CREATE TABLE `tag_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tagName` varchar(100) NOT NULL,
	`monthlyLimit` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tag_budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warranty_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`purchaseId` int NOT NULL,
	`status` enum('Submitted','Under Review','Repairing','Replacement Approved','Resolved','Rejected') NOT NULL DEFAULT 'Submitted',
	`issueDescription` text NOT NULL,
	`claimReference` varchar(100),
	`resolutionNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warranty_claims_id` PRIMARY KEY(`id`)
);
