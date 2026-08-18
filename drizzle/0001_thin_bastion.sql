CREATE TABLE `line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`price` decimal(10,2) NOT NULL,
	`category` varchar(100),
	CONSTRAINT `line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`purchaseId` int NOT NULL,
	`type` enum('warranty_7day','warranty_1day','return_7day','return_1day') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`isRead` int NOT NULL DEFAULT 0,
	`targetDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`merchantName` varchar(255) NOT NULL,
	`purchaseDate` timestamp NOT NULL,
	`totalAmount` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`category` varchar(100) NOT NULL DEFAULT 'Electronics',
	`receiptUrl` text,
	`receiptFileKey` text,
	`warrantyDurationMonths` int NOT NULL DEFAULT 12,
	`warrantyExpiryDate` timestamp,
	`returnWindowDays` int NOT NULL DEFAULT 30,
	`returnDeadlineDate` timestamp,
	`notes` text,
	`rawExtractedData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
