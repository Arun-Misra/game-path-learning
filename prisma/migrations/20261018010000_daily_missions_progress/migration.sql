-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('LEARN', 'PRACTICE', 'REVIEW', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "TopicProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'MASTERED');

-- CreateTable
CREATE TABLE "DailyMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learningGoalId" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "segmentIndex" INTEGER NOT NULL DEFAULT 0,
    "missionType" "MissionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "completionCriteria" JSONB NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DailyMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB,

    CONSTRAINT "MissionCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopicProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TopicProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "masteryScore" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTopicProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyMission_userId_roadmapId_scheduledDate_topicId_segmentIndex_key"
ON "DailyMission"("userId", "roadmapId", "scheduledDate", "topicId", "segmentIndex");
CREATE INDEX "DailyMission_userId_scheduledDate_status_idx" ON "DailyMission"("userId", "scheduledDate", "status");
CREATE INDEX "DailyMission_learningGoalId_scheduledDate_idx" ON "DailyMission"("learningGoalId", "scheduledDate");
CREATE INDEX "DailyMission_topicId_status_idx" ON "DailyMission"("topicId", "status");
CREATE UNIQUE INDEX "MissionCompletion_missionId_key" ON "MissionCompletion"("missionId");
CREATE INDEX "MissionCompletion_userId_completedAt_idx" ON "MissionCompletion"("userId", "completedAt");
CREATE UNIQUE INDEX "XpTransaction_missionId_key" ON "XpTransaction"("missionId");
CREATE UNIQUE INDEX "XpTransaction_idempotencyKey_key" ON "XpTransaction"("idempotencyKey");
CREATE INDEX "XpTransaction_userId_createdAt_idx" ON "XpTransaction"("userId", "createdAt");
CREATE UNIQUE INDEX "UserTopicProgress_userId_topicId_key" ON "UserTopicProgress"("userId", "topicId");
CREATE INDEX "UserTopicProgress_userId_status_idx" ON "UserTopicProgress"("userId", "status");

-- AddForeignKey
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_learningGoalId_fkey" FOREIGN KEY ("learningGoalId") REFERENCES "LearningGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "RoadmapTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionCompletion" ADD CONSTRAINT "MissionCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionCompletion" ADD CONSTRAINT "MissionCompletion_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DailyMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DailyMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserTopicProgress" ADD CONSTRAINT "UserTopicProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "RoadmapTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;