DROP INDEX "RoadmapGenerationRun_learningGoalId_triggerDate_key";

CREATE UNIQUE INDEX "RoadmapGenerationRun_sourceRoadmapId_triggerDate_key"
ON "RoadmapGenerationRun"("sourceRoadmapId", "triggerDate");
