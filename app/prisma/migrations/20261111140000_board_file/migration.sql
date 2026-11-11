-- Whiteboard B2: images placed on a board.
--
-- board_file: one stored image of a board. The bytes live under private/uploads/<projectId>/<fileName>; an image
--   element's `fileId` names the row. Rows go with the board (FK cascade); the purge job also removes the files.
--   Counted against the project storage quota (services/attachments/storage-quota.ts).
--
-- Lock impact: one new, empty table; the foreign key on "board" takes a brief SHARE ROW EXCLUSIVE lock on it
-- (no scan: the new table is empty). Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "board_file" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_file_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "board_file_size_chk" CHECK ("fileSize" >= 0)
);

-- CreateIndex (one row per stored file: a purge never removes bytes another row still uses)
CREATE UNIQUE INDEX "board_file_fileName_key" ON "board_file"("fileName");

-- CreateIndex
CREATE INDEX "board_file_boardId_idx" ON "board_file"("boardId");

-- AddForeignKey
ALTER TABLE "board_file" ADD CONSTRAINT "board_file_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
