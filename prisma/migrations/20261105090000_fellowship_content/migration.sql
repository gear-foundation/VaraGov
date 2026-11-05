CREATE TABLE "FellowshipContent" (
    "index" INTEGER NOT NULL,
    "trackId" INTEGER,
    "proposer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "contentSig" TEXT NOT NULL,
    "contentPayload" JSONB NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FellowshipContent_pkey" PRIMARY KEY ("index")
);
