/*
  Warnings:

  - A unique constraint covering the columns `[userId,orderId,receiptNumber]` on the table `receipts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "receipts_userId_orderId_key";

-- DropIndex
DROP INDEX "receipts_userId_receiptNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "receipts_userId_orderId_receiptNumber_key" ON "receipts"("userId", "orderId", "receiptNumber");
