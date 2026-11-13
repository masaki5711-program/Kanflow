-- N10 (docs/integration/gitstation-operations-plan.md): the employee number of a merge request's author, as
-- GitStation's development status names it (author.employee_number, only with the user_employee_number scope).
-- "My blocked MRs" matches it against User.employeeNumber (ignoring case); it is never shown.
--
-- git_link.authorEmployeeNumber: MR links only, nullable — existing rows stay null until the sync reads them again
-- (null = unknown: GitLab, an older GitStation, no scope, or the author has none).
--
-- Lock impact: ADD COLUMN without a default is a catalogue change (no table rewrite). Append-only: never edit an
-- applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "authorEmployeeNumber" VARCHAR(64);
