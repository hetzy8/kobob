CREATE TABLE "MembershipAudit" (
 "id" TEXT NOT NULL,
 "actorId" TEXT,
 "targetId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MembershipAudit_pkey" PRIMARY KEY ("id")
);
