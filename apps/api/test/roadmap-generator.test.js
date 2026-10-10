













const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RoadmapGenerationError,
  buildPrompt,
  buildReviewPrompt,
  applyRealismFloor,
  generateRoadmap,
  isLocalOllama,
  normalizeRoadmapProposal,
  validateReview,
} = require('../lib/roadmap-generator');

const goal = { title: 'Learn digital illustration', targetOutcome: 'Create a polished character illustration', experienceLevel: 'BEGINNER', minutesPerDay: 30, daysPerWeek: 4, targetDate: null };

function validProposal() {
  return {
    title: 'Digital illustration path',
    summary: 'Learn drawing fundamentals and produce a finished character illustration.',
    topics: [
      { key: 'shapes', title: 'Shape and form', description: 'Observe and construct simple forms, then use them to sketch a character silhouette.', learningObjectives: ['Construct a drawing from simple forms'], estimatedMinutes: 30, prerequisiteKeys: [] },
      { key: 'character', title: 'Character drawing', description: 'Develop a character sketch from the silhouette, refine anatomy, and produce a polished final illustration.', learningObjectives: ['Create a character sketch', 'Finish and export a character illustration'], estimatedMinutes: 45, prerequisiteKeys: ['shapes'] },
    ],
  };
}

function validLearningBrief() {
  return {
    outcomeRestatement: 'Build a tested Java service that finds shortest paths in a graph and exposes them through a client-server API.',
    capabilities: [
      { capability: 'Represent a weighted graph', importance: 'required', evidenceOfSuccess: 'Graph data structure passes tests.' },
      { capability: 'Implement Dijkstra shortest paths', importance: 'required', evidenceOfSuccess: 'Known graphs return correct paths and distances.' },
      { capability: 'Expose route queries over a REST API', importance: 'required', evidenceOfSuccess: 'HTTP request returns path and distance JSON.' },
      { capability: 'Automated tests', importance: 'required', evidenceOfSuccess: 'Unit and API integration tests pass.' },
    ],
    prerequisiteKnowledge: ['Basic Java classes and collections'],
    assumptions: ['Use a minimal Java REST framework only if one is needed; framework is not a user requirement.'],
    finalDeliverable: 'A runnable client-server application with Dijkstra routing and automated tests.',
    outOfScope: ['Unrelated frontend styling', 'Advanced graph algorithms beyond Dijkstra'],
  };
}

function approvedReview() { return { approved: true, score: 92, issues: [] }; }
function responseFor(value, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }; }

test('planner prompt prioritises the exact outcome, steps, deliverable, and weekly time budget', () => {
  const prompt = buildPrompt(goal);
  assert.match(prompt, /Learn digital illustration/);
  assert.match(prompt, /Create a polished character illustration/);
  assert.match(prompt, /30 minutes\/day, 4 days\/week/);
  assert.match(prompt, /every distinct capability explicitly/i);
  assert.match(prompt, /capstone or performance task that directly demonstrates/i);
  assert.match(prompt, /Never use a default 4–8 week timeline/i);
  assert.match(prompt, /"prerequisiteKeys"/);
  assert.match(prompt, /valid JSON only/i);
});

test('planner prompt includes weekly time budget and discourages generic or repetitive topics', () => {
  const prompt = buildPrompt({ ...goal, title: 'Java', minutesPerDay: 45, daysPerWeek: 5, targetOutcome: 'Build a client-server app and implement Dijkstra routing' });
  assert.match(prompt, /225 minutes\/week/);
  assert.match(prompt, /Build a client-server app and implement Dijkstra routing/);
  assert.match(prompt, /Avoid duplicate topics, filler/i);
  assert.match(prompt, /capstone or performance task that directly demonstrates/i);
});

test('review prompt checks the roadmap against the learner outcome rather than a generic syllabus', () => {
  const prompt = buildReviewPrompt(goal, validProposal());
  assert.match(prompt, /strict learning-roadmap auditor/i);
  assert.match(prompt, /DESIRED OUTCOME: Create a polished character illustration/);
  assert.match(prompt, /time-budget realism/i);
  assert.match(prompt, /Independently estimate the focused effort/i);
  assert.match(prompt, /practice-heavy outcomes/i);
  assert.match(prompt, /Approve only when there are no critical or major issues/i);
});

test('normalizes empty prerequisite markers and removes invalid edges emitted by local models', () => {
  const proposal = validProposal();
  proposal.topics[0].prerequisiteKeys = ['[]'];
  proposal.topics[1].prerequisiteKeys = ['shapes', 'none', 'missing-topic', 'character'];
  const normalized = normalizeRoadmapProposal(proposal);
  assert.deepEqual(normalized.topics[0].prerequisiteKeys, []);
  assert.deepEqual(normalized.topics[1].prerequisiteKeys, ['shapes']);
});

test('realism floor stretches a beginner guitar song roadmap to at least 12 weeks at 150 minutes/week', () => {
  const goal = {
    title: 'Guitar',
    targetOutcome: 'Able to play Neele Neele Ambar Par from start to finish',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 30,
    daysPerWeek: 5,
  };
  const shortRoadmap = {
    title: 'Song roadmap',
    summary: 'Play the song.',
    topics: [
      { key: 'basics', title: 'Basics', description: 'Learn the basics.', learningObjectives: ['Hold the guitar'], estimatedMinutes: 30, prerequisiteKeys: [] },
      { key: 'song', title: 'Play song', description: 'Play the song.', learningObjectives: ['Play the song'], estimatedMinutes: 360, prerequisiteKeys: ['basics'] },
    ],
  };
  const realistic = applyRealismFloor(shortRoadmap, goal);
  assert.equal(realistic.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0), 1800);
  assert.equal(realistic.estimatedTotalMinutes, 1800);
  assert.ok(realistic.topics.every((topic) => topic.estimatedMinutes >= 5));
  assert.equal(applyRealismFloor(shortRoadmap, { ...goal, experienceLevel: 'ADVANCED' }), shortRoadmap);
});

test('recognises local Ollama endpoints so they do not require an API key', () => {
  assert.equal(isLocalOllama('http://127.0.0.1:11434/v1'), true);
  assert.equal(isLocalOllama('http://localhost:11434/v1'), true);
  assert.equal(isLocalOllama('https://integrate.api.nvidia.com/v1'), false);
  assert.equal(isLocalOllama('http://127.0.0.1:3000/v1'), false);
});

test('hosted generation refuses to call provider when API key is missing', async () => {
  await assert.rejects(
    generateRoadmap(goal, { apiKey: '', baseUrl: 'https://integrate.api.nvidia.com/v1', fetchImpl: async () => assert.fail('fetch should not run') }),
    (error) => error instanceof RoadmapGenerationError && error.status === 503 && error.code === 'ROADMAP_GENERATOR_NOT_CONFIGURED',
  );
});

test('E4B handles the enhanced brief, planning, and independent review without loading a second model', async () => {
  const requests = [];
  const result = await generateRoadmap(goal, {
    apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'gemma4:e4b',
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body, headers: options.headers });
      if (body.response_format.json_schema.name === 'enhanced_learning_brief') return responseFor(validLearningBrief());
      return responseFor(body.response_format.json_schema.name === 'roadmap_review' ? approvedReview() : validProposal());
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].body.model, 'gemma4:e4b');
  assert.equal(requests[0].body.response_format.json_schema.name, 'enhanced_learning_brief');
  assert.equal(requests[1].body.model, 'gemma4:e4b');
  assert.equal(requests[1].body.response_format.json_schema.name, 'personalised_learning_roadmap');
  assert.equal(requests[1].body.max_tokens, 6144);
  assert.equal(requests[1].body.temperature, 0.2);
  assert.equal(requests[1].body.reasoning_effort, 'none');
  assert.equal(requests[2].body.model, 'gemma4:e4b');
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.equal(requests[0].body.response_format.json_schema.strict, true);
  assert.match(requests[2].body.messages[1].content, /Create a polished character illustration/);
  assert.equal(result.topics.length, 2);
  assert.equal(result.topics[1].position, 1);
  assert.equal(result.estimatedTotalMinutes, 75);
  assert.equal(result.learningBrief.finalDeliverable, validLearningBrief().finalDeliverable);
});

test('learner clarifications override inferred assumptions and reach both models', async () => {
  const clarification = 'Use plain Java without Spring Boot; keep the project local.';
  const requests = [];
  const result = await generateRoadmap({ ...goal, learnerClarifications: clarification }, {
    apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'gemma4:e4b',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.response_format.json_schema.name === 'enhanced_learning_brief') return responseFor(validLearningBrief());
      return responseFor(body.response_format.json_schema.name === 'roadmap_review' ? approvedReview() : validProposal());
    },
  });

  assert.match(requests[0].messages[0].content, /learner clarifications override/i);
  assert.match(requests[0].messages[1].content, /Use plain Java without Spring Boot/);
  assert.match(requests[1].messages[1].content, /CLARIFICATIONS FROM THE LEARNER/);
  assert.equal(result.learningBrief.learnerClarifications, clarification);
});

test('E4B revises a draft when its review finds major outcome-alignment issues', async () => {
  const requests = [];
  const result = await generateRoadmap(goal, {
    apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'gemma4:e4b',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.response_format.json_schema.name === 'enhanced_learning_brief') return responseFor(validLearningBrief());
      if (body.response_format.json_schema.name === 'roadmap_review') {
        return responseFor({
          approved: false, score: 55,
          issues: [{ severity: 'major', code: 'MISSING_CAPSTONE', explanation: 'The roadmap does not explicitly deliver the requested polished character illustration.', suggestedFix: 'Add a final end-to-end illustration project with refinement and export.', relatedTopicKeys: ['character'] }],
        });
      }
      return responseFor(validProposal());
    },
  });
  assert.equal(requests.length, 4);
  assert.equal(requests[0].model, 'gemma4:e4b');
  assert.equal(requests[0].response_format.json_schema.name, 'enhanced_learning_brief');
  assert.equal(requests[1].model, 'gemma4:e4b');
  assert.equal(requests[2].model, 'gemma4:e4b');
  assert.equal(requests[3].model, 'gemma4:e4b');
  assert.match(requests[3].messages[1].content, /INDEPENDENT REVIEW AND REQUIRED FIXES/);
  assert.match(requests[3].messages[1].content, /ENHANCED LEARNING BRIEF TO HONOUR/);
  assert.match(requests[3].messages[1].content, /framework is not a user requirement/);
  assert.equal(result.topics[1].title, 'Character drawing');
});

test('invalid reviewer output is rejected instead of silently trusting an unaudited roadmap', async () => {
  assert.equal(validateReview(approvedReview()), true);
  assert.equal(validateReview({ approved: true, score: 101, issues: [] }), false);
  await assert.rejects(
    generateRoadmap(goal, {
      apiKey: '', baseUrl: 'http://localhost:11434/v1',
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.response_format.json_schema.name === 'enhanced_learning_brief') return responseFor(validLearningBrief());
        return responseFor(body.response_format.json_schema.name === 'roadmap_review' ? { approved: true, score: 'high', issues: [] } : validProposal());
      },
    }),
    (error) => error instanceof RoadmapGenerationError && error.code === 'ROADMAP_REVIEW_INVALID',
  );
});

test('generation normalizes invalid external prerequisite references before validation and review', async () => {
  const invalidEdges = validProposal().topics.map((topic) => ({ ...topic, prerequisiteKeys: ['missing-topic'] }));
  const result = await generateRoadmap(goal, {
    apiKey: '', baseUrl: 'http://localhost:11434/v1',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.response_format.json_schema.name === 'enhanced_learning_brief') return responseFor(validLearningBrief());
      return responseFor(body.response_format.json_schema.name === 'roadmap_review'
        ? approvedReview()
        : { ...validProposal(), topics: invalidEdges });
    },
  });
  assert.deepEqual(result.topics.map((topic) => topic.prerequisiteKeys), [[], []]);
});

test('retries one malformed structured response with an explicit JSON repair instruction', async () => {
  let calls = 0;
  const retryBodies = [];
  const result = await generateRoadmap(goal, {
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.response_format.json_schema.name === 'enhanced_learning_brief') {
        retryBodies.push(body);
        calls += 1;
        if (calls === 1) {
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{invalid json' } }] }) };
        }
        return responseFor(validLearningBrief());
      }
      return responseFor(body.response_format.json_schema.name === 'roadmap_review' ? approvedReview() : validProposal());
    },
  });
  assert.equal(calls, 2);
  assert.match(retryBodies[1].messages.at(-1).content, /not valid parseable JSON/i);
  assert.equal(result.topics.length, 2);
});
test('provider rate limits are reported as retryable service errors', async () => {
  await assert.rejects(
    generateRoadmap(goal, { apiKey: 'test-key', baseUrl: 'https://example-provider.invalid/v1', fetchImpl: async () => ({ ok: false, status: 429 }) }),
    (error) => error instanceof RoadmapGenerationError && error.status === 503 && error.code === 'ROADMAP_PROVIDER_RATE_LIMITED',
  );
});