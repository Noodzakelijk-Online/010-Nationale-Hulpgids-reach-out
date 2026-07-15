ALTER TABLE `campaigns` MODIFY COLUMN `status` enum('draft','active','paused','completed','scheduled','archived') NOT NULL DEFAULT 'draft';
