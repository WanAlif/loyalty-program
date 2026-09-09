/*
  Warnings:

  - A unique constraint covering the columns `[userId,receiptNumber]` on the table `receipts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `receiptNumber` to the `receipts` table without a default value. This is not possible if the table is not empty.
*/
-- AlterTable: add as nullable first so existing rows aren't blocked
ALTER TABLE "receipts" ADD COLUMN "receiptNumber" TEXT;
WITH numbered AS (
  SELECT "id", (1000 + ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "submittedAt"))::text AS placeholder
  FROM "receipts"
)
UPDATE "receipts" r
SET "receiptNumber" = numbered.placeholder
FROM numbered
WHERE r."id" = numbered."id";

-- Now that every row has a value, make it required.
ALTER TABLE "receipts" ALTER COLUMN "receiptNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "receipts_userId_receiptNumber_key" ON "receipts"("userId", "receiptNumber");
