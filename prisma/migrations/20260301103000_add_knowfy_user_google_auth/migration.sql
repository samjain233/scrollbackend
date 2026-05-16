-- Knowfy consumer accounts (Google Sign-In on mobile).

CREATE TABLE "KnowfyUser" (
    "id" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "pictureUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowfyUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowfyUser_googleSub_key" ON "KnowfyUser"("googleSub");
CREATE INDEX "KnowfyUser_email_idx" ON "KnowfyUser"("email");
