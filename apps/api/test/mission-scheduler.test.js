const assert = require('node:assert/strict');
const test = require('node:test');
const { buildWeeklyMissionPlan, dateInTimeZone, sessionDayIndexes } = require('../lib/mission-scheduler');

const topics = [
  {
    id: 'topic-a',
    position: 0,
    title: 'Foundations',
    description: 'Learn the essential ideas.',
    estimatedMinutes: 50,
    learningObjectives: ['Explain the essentials'],
  },
  {
    id: 'topic-b',
    position: 1,
    title: 'Guided practice',
    description: 'Apply the ideas to a real example.',
    estimatedMinutes: 30,
    learningObjectives: ['Complete a practical example'],
  },
];

test('spreads available sessions across the week', () => {
  assert.deepEqual(sessionDayIndexes(3), [0, 2, 4]);
  assert.deepEqual(sessionDayIndexes(7), [0, 1, 2, 3, 4, 5, 6]);
});

test('schedules prerequisite-ordered topic work within each daily time budget', () => {
  const result = buildWeeklyMissionPlan({
    topics,
    minutesPerDay: 30,
    daysPerWeek: 3,
    startDate: '2026-10-19',
    timeZone: 'Asia/Kolkata',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.scheduledMinutes, 80);
  assert.deepEqual(result.data.scheduledDates, ['2026-10-19', '2026-10-21', '2026-10-23']);
  const totals = new Map();
  for (const mission of result.data.missions) {
    totals.set(mission.scheduledDate, (totals.get(mission.scheduledDate) || 0) + mission.estimatedMinutes);
  }
  assert.ok([...totals.values()].every((minutes) => minutes <= 30));
  assert.equal(result.data.missions[0].missionType, 'LEARN');
  assert.equal(result.data.missions[1].missionType, 'PRACTICE');
});

test('does not invent extra missions when the roadmap fits inside the available time', () => {
  const result = buildWeeklyMissionPlan({
    topics: [topics[0]],
    minutesPerDay: 60,
    daysPerWeek: 5,
    startDate: '2026-10-19',
    timeZone: 'UTC',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.missions.length, 1);
  assert.equal(result.data.scheduledMinutes, 50);
  assert.equal(result.data.remainingTopicCount, 0);
});

test('rejects invalid timezone and malformed schedule inputs', () => {
  const invalidZone = buildWeeklyMissionPlan({
    topics,
    minutesPerDay: 30,
    daysPerWeek: 3,
    startDate: '2026-10-19',
    timeZone: 'Mars/Olympus',
  });
  assert.equal(invalidZone.success, false);
  assert.equal(invalidZone.errors[0].field, 'timeZone');

  const invalidDate = buildWeeklyMissionPlan({
    topics,
    minutesPerDay: 30,
    daysPerWeek: 3,
    startDate: 'tomorrow',
    timeZone: 'UTC',
  });
  assert.equal(invalidDate.success, false);
});

test('calculates local calendar date in the requested timezone', () => {
  assert.equal(dateInTimeZone(new Date('2026-10-18T20:00:00.000Z'), 'Asia/Kolkata'), '2026-10-19');
});

test('low assessment evidence creates a targeted practice mission instead of a learn mission', () => {
  const result = buildWeeklyMissionPlan({
    topics: [{ ...topics[0], estimatedMinutes: 15, practiceOnly: true }],
    minutesPerDay: 30,
    daysPerWeek: 3,
    startDate: '2026-10-21',
    timeZone: 'UTC',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.missions.length, 1);
  assert.equal(result.data.missions[0].missionType, 'PRACTICE');
  assert.match(result.data.missions[0].title, /^Practice:/);
  assert.match(result.data.missions[0].description, /Targeted practice after your latest assessment/);
});
