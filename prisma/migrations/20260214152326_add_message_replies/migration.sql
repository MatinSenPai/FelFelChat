-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readBy" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("createdAt", "fileSize", "fileUrl", "id", "readBy", "roomId", "text", "userId") SELECT "createdAt", "fileSize", "fileUrl", "id", "readBy", "roomId", "text", "userId" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_roomId_idx" ON "Message"("roomId");
CREATE INDEX "Message_userId_idx" ON "Message"("userId");
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
