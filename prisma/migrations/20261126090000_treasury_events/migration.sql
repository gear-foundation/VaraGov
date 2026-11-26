CREATE TABLE "TreasuryEvent" (
  "block" INTEGER NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "kind" TEXT NOT NULL,
  "refIndex" INTEGER,
  "spendIndex" INTEGER,
  "txHash" TEXT,
  "data" JSONB NOT NULL,
  CONSTRAINT "TreasuryEvent_pkey" PRIMARY KEY ("block", "ordinal")
);
CREATE INDEX "TreasuryEvent_kind_timestamp_idx" ON "TreasuryEvent"("kind", "timestamp");
CREATE INDEX "TreasuryEvent_refIndex_block_idx" ON "TreasuryEvent"("refIndex", "block");
CREATE INDEX "TreasuryEvent_spendIndex_block_idx" ON "TreasuryEvent"("spendIndex", "block");

CREATE TABLE "TreasuryHistoryCursor" (
  "id" INTEGER NOT NULL,
  "fromBlock" INTEGER NOT NULL,
  "lastBlock" INTEGER NOT NULL,
  CONSTRAINT "TreasuryHistoryCursor_pkey" PRIMARY KEY ("id")
);
