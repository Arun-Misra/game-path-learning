CREATE TABLE "RoadmapGenerationRun" (
    "id" TEXT NOT NULL,
    "learningGoalId" TEXT NOT NULL,
    "sourceRoadmapId" TEXT NOT NULL,
    "triggerDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "resultRoadmapId" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoadmapGenerationRun_learningGoalId_triggerDate_key"
ON "RoadmapGenerationRun"("learningGoalId", "triggerDate");

CREATE INDEX "RoadmapGenerationRun_status_leaseExpiresAt_idx"
ON "RoadmapGenerationRun"("status", "leaseExpiresAt");

ALTER TABLE "RoadmapGenerationRun"
ADD CONSTRAINT "RoadmapGenerationRun_learningGoalId_fkey"
FOREIGN KEY ("learningGoalId") REFERENCES "LearningGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoadmapGenerationRun"
ADD CONSTRAINT "RoadmapGenerationRun_sourceRoadmapId_fkey"
FOREIGN KEY ("sourceRoadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoadmapGenerationRun"
ADD CONSTRAINT "RoadmapGenerationRun_resultRoadmapId_fkey"
FOREIGN KEY ("resultRoadmapId") REFERENCES "Roadmap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
