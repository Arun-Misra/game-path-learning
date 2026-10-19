const { z } = require('zod');

const roadmapTopicSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  learningObjectives: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  estimatedMinutes: z.number().int().min(5).max(10080),
  timeBreakdown: z.object({
    conceptMinutes: z.number().int().min(0),
    workedExampleMinutes: z.number().int().min(0),
    guidedPracticeMinutes: z.number().int().min(0),
    independentPracticeMinutes: z.number().int().min(0),
    reviewMinutes: z.number().int().min(0),
  }).optional(),
  prerequisiteKeys: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
});

const roadmapSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(3000),
  topics: z.array(roadmapTopicSchema).min(2),
});

function validatePrerequisiteGraph(topics) {
  const errors = [];
  const topicByKey = new Map();

  for (const topic of topics) {
    if (topicByKey.has(topic.key)) {
      errors.push({ code: 'DUPLICATE_TOPIC_KEY', topicKey: topic.key });
    } else {
      topicByKey.set(topic.key, topic);
    }
  }

  for (const topic of topics) {
    const seenPrerequisites = new Set();
    for (const prerequisiteKey of topic.prerequisiteKeys) {
      if (seenPrerequisites.has(prerequisiteKey)) {
        errors.push({
          code: 'DUPLICATE_PREREQUISITE',
          topicKey: topic.key,
          prerequisiteKey,
        });
        continue;
      }
      seenPrerequisites.add(prerequisiteKey);

      if (prerequisiteKey === topic.key) {
        errors.push({ code: 'SELF_PREREQUISITE', topicKey: topic.key });
      } else if (!topicByKey.has(prerequisiteKey)) {
        errors.push({
          code: 'UNKNOWN_PREREQUISITE',
          topicKey: topic.key,
          prerequisiteKey,
        });
      }
    }
  }

  if (errors.length > 0) return errors;

  const state = new Map();
  const stack = [];
  const cycles = [];
  function visit(key) {
    const currentState = state.get(key) || 0;
    if (currentState === 2) return;
    if (currentState === 1) {
      const start = stack.indexOf(key);
      cycles.push(stack.slice(start).concat(key));
      return;
    }

    state.set(key, 1);
    stack.push(key);
    for (const prerequisiteKey of topicByKey.get(key).prerequisiteKeys) {
      visit(prerequisiteKey);
    }
    stack.pop();
    state.set(key, 2);
  }

  for (const topic of topics) visit(topic.key);
  for (const cycle of cycles) {
    errors.push({ code: 'PREREQUISITE_CYCLE', cycle });
  }
  return errors;
}

function validateRoadmap(input) {
  const parsed = roadmapSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        code: 'INVALID_FIELD',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const graphErrors = validatePrerequisiteGraph(parsed.data.topics);
  if (graphErrors.length > 0) {
    return { success: false, errors: graphErrors };
  }

  return {
    success: true,
    data: {
      ...parsed.data,
      topics: parsed.data.topics.map((topic, index) => ({
        ...topic,
        position: index,
      })),
      estimatedTotalMinutes: parsed.data.topics.reduce(
        (total, topic) => total + topic.estimatedMinutes,
        0,
      ),
    },
  };
}

module.exports = { roadmapSchema, validatePrerequisiteGraph, validateRoadmap };