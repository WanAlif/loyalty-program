/*
  Warnings:

  - A unique constraint covering the columns `[userId,orderId]` on the table `receipts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "receipts_userId_orderId_key" ON "receipts"("userId", "orderId");
