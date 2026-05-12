-- Adds Asaas-related columns to Users and creates SubscriptionEvents table

ALTER TABLE `Users`
  ADD COLUMN `asaas_customer_id` VARCHAR(255) NULL,
  ADD COLUMN `asaas_subscription_id` VARCHAR(255) NULL,
  ADD COLUMN `subscription_status` VARCHAR(50) NULL,
  ADD COLUMN `subscription_plan` VARCHAR(100) NULL,
  ADD COLUMN `subscription_started_at` DATETIME NULL,
  ADD COLUMN `subscription_ends_at` DATETIME NULL,
  ADD COLUMN `subscription_meta` JSON NULL;


CREATE TABLE IF NOT EXISTS `SubscriptionEvents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `asaas_event` VARCHAR(100) NULL,
  `asaas_payment_id` VARCHAR(255) NULL,
  `asaas_customer_id` VARCHAR(255) NULL,
  `status` VARCHAR(50) NULL,
  `amount` DECIMAL(10,2) NULL,
  `raw_payload` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`)
);
