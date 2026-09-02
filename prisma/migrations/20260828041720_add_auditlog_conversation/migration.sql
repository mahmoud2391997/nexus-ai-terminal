-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "conversationId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_conversationId_idx" ON "AuditLog"("conversationId");
