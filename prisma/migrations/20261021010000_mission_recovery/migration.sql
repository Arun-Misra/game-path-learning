ALTER TABLE "DailyMission" ADD COLUMN "recoveredAt" TIMESTAMP(3);

CREATE INDEX "DailyMission_roadmapId_status_recoveredAt_idx"
ON "DailyMission"("roadmapId", "status", "recoveredAt");
