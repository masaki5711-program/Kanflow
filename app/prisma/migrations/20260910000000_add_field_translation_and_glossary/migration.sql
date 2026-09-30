-- Both-language storage + background translation queue for user-entered text,
-- and the shared translation glossary. Additive only: two new tables, no
-- existing column is touched.

CREATE TABLE `field_translation` (
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `field` VARCHAR(64) NOT NULL,
    `source_locale` CHAR(2) NOT NULL,
    `source_hash` VARCHAR(64) NOT NULL,
    `text_ja` TEXT NULL,
    `text_id` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `model` VARCHAR(128) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `translated_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `field_translation_status_priority_requested_at_idx`(`status`, `priority` DESC, `requested_at`),
    PRIMARY KEY (`entity_type`, `entity_id`, `field`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `glossary` (
    `id` VARCHAR(191) NOT NULL,
    `source_locale` CHAR(2) NOT NULL,
    `target_locale` CHAR(2) NOT NULL,
    `term` VARCHAR(255) NOT NULL,
    `term_norm` VARCHAR(255) NOT NULL,
    `translation` VARCHAR(500) NOT NULL,
    `note` TEXT NULL,
    `auto_reverse` BOOLEAN NOT NULL DEFAULT false,
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `glossary_source_locale_target_locale_term_norm_key`(`source_locale`, `target_locale`, `term_norm`),
    INDEX `glossary_source_locale_target_locale_idx`(`source_locale`, `target_locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
