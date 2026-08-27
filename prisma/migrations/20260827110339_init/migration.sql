-- CreateTable
CREATE TABLE "Referendum" (
    "index" INTEGER NOT NULL,
    "trackId" INTEGER,
    "proposer" TEXT,
    "proposalHash" TEXT,
    "proposalLen" INTEGER,
    "callSection" TEXT,
    "callMethod" TEXT,
    "callArgs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "submittedAt" INTEGER,
    "decidingSince" INTEGER,
    "decidedAt" INTEGER,
    "finalTally" JSONB,
    "title" TEXT,
    "contentMd" TEXT,
    "contentSig" TEXT,
    "contentPayload" JSONB,
    "metadataHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referendum_pkey" PRIMARY KEY ("index")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "refIndex" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "replyToId" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" BIGSERIAL NOT NULL,
    "refIndex" INTEGER NOT NULL,
    "voter" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "aye" DECIMAL(38,0),
    "nay" DECIMAL(38,0),
    "abstain" DECIMAL(38,0),
    "conviction" INTEGER,
    "atBlock" INTEGER NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TallySnapshot" (
    "id" BIGSERIAL NOT NULL,
    "refIndex" INTEGER NOT NULL,
    "atBlock" INTEGER NOT NULL,
    "ayes" DECIMAL(38,0) NOT NULL,
    "nays" DECIMAL(38,0) NOT NULL,
    "support" DECIMAL(38,0) NOT NULL,

    CONSTRAINT "TallySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCursor" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastBlock" INTEGER NOT NULL,

    CONSTRAINT "WorkerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comment_signature_key" ON "Comment"("signature");

-- CreateIndex
CREATE INDEX "Comment_refIndex_createdAt_idx" ON "Comment"("refIndex", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_author_createdAt_idx" ON "Comment"("author", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_refIndex_voter_key" ON "Vote"("refIndex", "voter");

-- CreateIndex
CREATE UNIQUE INDEX "TallySnapshot_refIndex_atBlock_key" ON "TallySnapshot"("refIndex", "atBlock");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_refIndex_fkey" FOREIGN KEY ("refIndex") REFERENCES "Referendum"("index") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_refIndex_fkey" FOREIGN KEY ("refIndex") REFERENCES "Referendum"("index") ON DELETE RESTRICT ON UPDATE CASCADE;
