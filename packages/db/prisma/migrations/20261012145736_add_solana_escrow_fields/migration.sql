-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "solanaAmount" INTEGER,
ADD COLUMN     "solanaStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "solanaWalletAddress" TEXT;

-- CreateIndex
CREATE INDEX "User_solanaWalletAddress_idx" ON "User"("solanaWalletAddress");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
