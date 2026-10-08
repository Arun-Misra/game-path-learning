-- Persist generated topic assessments and server-scored attempts.
CREATE TABLE "TopicAssessment" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TopicAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopicAssessment_topicId_key" ON "TopicAssessment"("topicId");
CREATE INDEX "TopicAssessment_createdAt_idx" ON "TopicAssessment"("createdAt");
CREATE INDEX "AssessmentAttempt_userId_createdAt_idx" ON "AssessmentAttempt"("userId", "createdAt");
CREATE INDEX "AssessmentAttempt_assessmentId_createdAt_idx" ON "AssessmentAttempt"("assessmentId", "createdAt");

ALTER TABLE "TopicAssessment"
ADD CONSTRAINT "TopicAssessment_topicId_fkey"
FOREIGN KEY ("topicId") REFERENCES "RoadmapTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentAttempt"
ADD CONSTRAINT "AssessmentAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentAttempt"
ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "TopicAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
