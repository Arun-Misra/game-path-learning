CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "successCriteria" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "evidence" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMilestone_roadmapId_position_key" ON "ProjectMilestone"("roadmapId", "position");
CREATE INDEX "ProjectMilestone_roadmapId_status_idx" ON "ProjectMilestone"("roadmapId", "status");

ALTER TABLE "ProjectMilestone"
ADD CONSTRAINT "ProjectMilestone_roadmapId_fkey"
FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
