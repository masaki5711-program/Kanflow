-- AlterTable: User.tokenVersion — every JWT carries the version it was issued
-- with; admins bump it (deactivate / role change / password reset) to revoke
-- all of the user's sessions immediately. Additive, default 0: tokens issued
-- before this column existed have no claim and are treated as version 0, so
-- nobody is logged out by the deploy itself.
ALTER TABLE `User` ADD COLUMN `tokenVersion` INTEGER NOT NULL DEFAULT 0;
