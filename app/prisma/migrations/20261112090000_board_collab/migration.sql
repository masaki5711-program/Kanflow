-- Whiteboard B7: who is viewing a sheet, saved versions of a sheet, comments on a sheet / element.
--
-- board_presence: one row per person and open sheet, refreshed every few seconds while the sheet is open; read back
--   as "seen in the last 20 s". Ids and the selected element ids only — never content.
-- board_sheet_version: a saved state of a sheet (automatic, at most one per 10 minutes while people draw, or saved
--   by hand with a name). The oldest automatic versions go first above the per-sheet limit.
-- board_comment: a comment on a sheet or one of its elements; @mentions notify ("mentioned", entity "board").
--
-- All three go with their sheet (FK cascade), and so with the board.
-- board_presence has no index on "seenAt": it changes on every refresh, and an index on it would stop in-place updates.
--
-- Lock impact: three new, empty tables; each foreign key takes a brief SHARE ROW EXCLUSIVE lock on "board_sheet" /
-- "board" (no scan: the new tables are empty). Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "board_presence" (
    "sheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" VARCHAR(120) NOT NULL,
    "selection" JSONB NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_presence_pkey" PRIMARY KEY ("sheetId","userId")
);

-- CreateTable
CREATE TABLE "board_sheet_version" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL DEFAULT '',
    "auto" BOOLEAN NOT NULL DEFAULT true,
    "elements" JSONB NOT NULL,
    "elementCount" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdByName" VARCHAR(120) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_sheet_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_comment" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "elementId" VARCHAR(40),
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_sheet_version_sheetId_createdAt_idx" ON "board_sheet_version"("sheetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "board_comment_boardId_createdAt_idx" ON "board_comment"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "board_comment_sheetId_elementId_idx" ON "board_comment"("sheetId", "elementId");

-- AddForeignKey
ALTER TABLE "board_presence" ADD CONSTRAINT "board_presence_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "board_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_sheet_version" ADD CONSTRAINT "board_sheet_version_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "board_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_comment" ADD CONSTRAINT "board_comment_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_comment" ADD CONSTRAINT "board_comment_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "board_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
