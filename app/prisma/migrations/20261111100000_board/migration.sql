-- ボード B1 (docs/plan/10-board.md): free drawing boards per project.
--
-- board: one board of a project. Deleting moves it to the project trash (deletedAt / deletedById), like the
--   other trashed entities; createdById / deletedById are plain user ids (no FK).
-- board_sheet: the sheets (tabs) of a board. `rev` counts the accepted element writes of the sheet.
-- board_element: one drawn element per row, keyed by the client-generated elementId within the sheet.
--   `version` is the writer's per-element counter (the server keeps the higher one), `rev` the sheet rev at
--   which the row was last written (delta reads: rev > since), `deleted` a tombstone. `data` (jsonb) is the
--   element as the client wrote it; new element types need no migration.
--
-- Lock impact: three new, empty tables; the foreign key on "Project" takes a brief SHARE ROW EXCLUSIVE lock
-- on it (no scan: the new table is empty). Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "board" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_sheet" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_sheet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "board_sheet_rev_chk" CHECK ("rev" >= 0)
);

-- CreateTable
CREATE TABLE "board_element" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "elementId" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "rev" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_element_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "board_element_values_chk" CHECK ("version" >= 1 AND "rev" >= 1 AND jsonb_typeof("data") = 'object')
);

-- CreateIndex
CREATE INDEX "board_projectId_deletedAt_idx" ON "board"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "board_sheet_boardId_sortOrder_idx" ON "board_sheet"("boardId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "board_element_sheetId_elementId_key" ON "board_element"("sheetId", "elementId");

-- CreateIndex
CREATE INDEX "board_element_sheetId_rev_idx" ON "board_element"("sheetId", "rev");

-- AddForeignKey
ALTER TABLE "board" ADD CONSTRAINT "board_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_sheet" ADD CONSTRAINT "board_sheet_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_element" ADD CONSTRAINT "board_element_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "board_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
