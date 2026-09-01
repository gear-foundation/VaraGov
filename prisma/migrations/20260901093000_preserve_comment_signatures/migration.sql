-- Preserve every accepted signature so editing a comment cannot make its
-- original signed create request replayable.
CREATE TABLE "CommentSignature" (
    "signature" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentSignature_pkey" PRIMARY KEY ("signature")
);

CREATE INDEX "CommentSignature_commentId_idx" ON "CommentSignature"("commentId");

ALTER TABLE "CommentSignature"
ADD CONSTRAINT "CommentSignature_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "Comment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "CommentSignature" ("signature", "commentId")
SELECT "signature", "id" FROM "Comment";
