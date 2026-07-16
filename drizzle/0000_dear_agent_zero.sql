CREATE TABLE `case_patents` (
	`case_id` text NOT NULL,
	`patent_id` text NOT NULL,
	`status` text DEFAULT 'unrated' NOT NULL,
	`comment` text,
	`exclusion_reason` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`case_id`, `patent_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patent_id`) REFERENCES `patents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`reference_number` text,
	`technical_field` text,
	`memo` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`case_id` text,
	`patent_id` text,
	`request_payload` text NOT NULL,
	`response_payload` text,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patent_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`patent_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`result` text,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`patent_id`) REFERENCES `patents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patent_analyses_patent_id_unique` ON `patent_analyses` (`patent_id`);--> statement-breakpoint
CREATE TABLE `patents` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_number` text NOT NULL,
	`application_number` text,
	`country_code` text,
	`kind_code` text,
	`title` text,
	`abstract` text,
	`claims_text` text,
	`assignees` text,
	`ipc_codes` text,
	`cpc_codes` text,
	`cited_publications` text,
	`publication_date` text,
	`filing_date` text,
	`jpo_data` text,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patents_publication_number_unique` ON `patents` (`publication_number`);--> statement-breakpoint
CREATE TABLE `search_results` (
	`search_run_id` text NOT NULL,
	`patent_id` text NOT NULL,
	`rank` integer NOT NULL,
	`matched_terms` text,
	PRIMARY KEY(`search_run_id`, `patent_id`),
	FOREIGN KEY (`search_run_id`) REFERENCES `search_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patent_id`) REFERENCES `patents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_run_terms` (
	`search_run_id` text NOT NULL,
	`search_term_id` text NOT NULL,
	PRIMARY KEY(`search_run_id`, `search_term_id`),
	FOREIGN KEY (`search_run_id`) REFERENCES `search_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_term_id`) REFERENCES `search_terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`conditions` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`result_count` integer,
	`bytes_billed` integer,
	`executed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`parent_term_id` text,
	`term_type` text NOT NULL,
	`text` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
