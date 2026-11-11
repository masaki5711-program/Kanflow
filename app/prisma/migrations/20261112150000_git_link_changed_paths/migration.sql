-- N6 (docs/integration/gitstation-operations-plan.md §4): the files an open merge request changes, for the overlap
-- warning against other people's declared scope (作業の宣言の範囲).
--
-- git_link.changedPaths:         JSON array of repository-relative paths (at most 300); files withheld from the
--                                service account are never named. null = not read (closed MR, or not read yet).
-- git_link.changedPathsComplete: false = the listing was cut short (paths beyond it were not compared).
-- git_link.changedPathsAt:       when it was read; read again once the MR changed after it.
-- MR links only, all nullable: existing rows stay null until the sync reads them.
--
-- Lock impact: ADD COLUMN without a default is a catalogue change (no table rewrite). Append-only: never edit an
-- applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "changedPaths" JSONB,
ADD COLUMN     "changedPathsComplete" BOOLEAN,
ADD COLUMN     "changedPathsAt" TIMESTAMP(3);
