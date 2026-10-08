const { z } = require('zod');

const scheduleInputSchema = z.object({
  minutesPerDay: z.number().int().min(15).max(240),
  daysPerWeek: z.number().int().min(1).max(7),
  startDate: z.string().date(),
  timeZone: z.string().min(1).max(100),
});

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function sessionDayIndexes(daysPerWeek) {
  return Array.from({ length: daysPerWeek }, (_, index) => Math.floor((index * 7) / daysPerWeek));
}

function buildWeeklyMissionPlan({ topics, minutesPerDay, daysPerWeek, startDate, timeZone = 'UTC' }) {
  const parsed = scheduleInputSchema.safeParse({ minutesPerDay, daysPerWeek, startDate, timeZone });
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  if (!validateTimeZone(timeZone)) {
    return { success: false, errors: [{ field: 'timeZone', message: 'Use a valid IANA time zone.' }] };
  }
  if (!Array.isArray(topics) || topics.length === 0) {
    return { success: false, errors: [{ field: 'topics', message: 'An active roadmap with topics is required.' }] };
  }

  const orderedTopics = [...topics].sort((a, b) => a.position - b.position);
  if (orderedTopics.some((topic) => !Number.isInteger(topic.estimatedMinutes) || topic.estimatedMinutes < 5)) {
    return { success: false, errors: [{ field: 'topics', message: 'Every topic needs a valid estimated duration.' }] };
  }

  const dayIndexes = sessionDayIndexes(daysPerWeek);
  const missions = [];
  let topicIndex = 0;
  let topicRemaining = orderedTopics[0].estimatedMinutes;
  let segmentIndex = 0;

  for (const dayIndex of dayIndexes) {
    const scheduledDate = addDays(startDate, dayIndex);
    let remainingToday = minutesPerDay;

    while (remainingToday >= 5 && topicIndex < orderedTopics.length) {
      const topic = orderedTopics[topicIndex];
      const duration = Math.min(topicRemaining, remainingToday);
      const isFirstSegment = segmentIndex === 0;
      const objectives = Array.isArray(topic.learningObjectives) ? topic.learningObjectives : [];

      missions.push({
        scheduledDate,
        topicId: topic.id,
        topicPosition: topic.position,
        segmentIndex,
        missionType: isFirstSegment ? 'LEARN' : 'PRACTICE',
        title: `${isFirstSegment ? 'Learn' : 'Practice'}: ${topic.title}`,
        description: isFirstSegment
          ? topic.description
          : `Practise the ideas from “${topic.title}”. ${topic.description}`,
        estimatedMinutes: duration,
        completionCriteria: {
          objectives,
          instruction: isFirstSegment
            ? 'Work through the topic and be able to explain the key ideas in your own words.'
            : 'Apply the topic in a small practical task and check your result against the learning objectives.',
        },
      });

      remainingToday -= duration;
      topicRemaining -= duration;
      segmentIndex += 1;

      if (topicRemaining <= 0) {
        topicIndex += 1;
        if (topicIndex < orderedTopics.length) {
          topicRemaining = orderedTopics[topicIndex].estimatedMinutes;
          segmentIndex = 0;
        }
      }
    }
  }

  const totalMinutes = missions.reduce((sum, mission) => sum + mission.estimatedMinutes, 0);
  const scheduledDates = [...new Set(missions.map((mission) => mission.scheduledDate))];

  return {
    success: true,
    data: {
      missions,
      scheduledDates,
      scheduledMinutes: totalMinutes,
      availableMinutes: dayIndexes.length * minutesPerDay,
      remainingTopicCount: orderedTopics.length - topicIndex,
      timeZone,
    },
  };
}

module.exports = { addDays, dateInTimeZone, sessionDayIndexes, buildWeeklyMissionPlan };
