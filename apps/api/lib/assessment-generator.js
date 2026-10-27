const { z } = require('zod');

class AssessmentGenerationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const questionSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  prompt: z.string().trim().min(10).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(1000),
});

const assessmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(1000),
  questions: z.array(questionSchema).min(5).max(8),
});

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['key', 'prompt', 'options', 'answerIndex', 'explanation'],
      },
    },
  },
  required: ['title', 'instructions', 'questions'],
};

function buildAssessmentPrompt(topic) {
  const objectives = Array.isArray(topic.learningObjectives)
    ? topic.learningObjectives
    : [];

  return [
    'Create a short diagnostic assessment for this learning topic.',
    'The skill can be from any domain. Assess understanding of the stated topic and learning objectives, not unrelated trivia.',
    'Create 5 to 8 clear multiple-choice questions with exactly 4 distinct answer options each.',
    'Each question must have exactly one defensible correct answer, a zero-based answerIndex, and a concise explanation.',
    'Mix conceptual understanding and practical application. Avoid trick questions, ambiguity, and facts not implied by the topic context.',
    'Do not assume knowledge beyond the topic description and objectives.',
    'Use unique stable question keys containing only letters, numbers, dots, underscores, or hyphens.',
    'Return only valid JSON matching this schema. Do not include Markdown fences.',
    JSON.stringify(responseSchema),
    '',
    `Topic: ${topic.title}`,
    `Description: ${topic.description}`,
    `Learning objectives: ${JSON.stringify(objectives)}`,
  ].join('\n');
}

function validateAssessment(input) {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const keys = new Set();
  for (const question of parsed.data.questions) {
    if (keys.has(question.key)) {
      return { success: false, errors: [{ path: 'questions', message: 'Question keys must be unique.' }] };
    }
    keys.add(question.key);

    if (new Set(question.options.map((option) => option.toLocaleLowerCase())).size !== 4) {
      return { success: false, errors: [{ path: 'questions.options', message: 'Each question must have four distinct options.' }] };
    }
  }

  return { success: true, data: parsed.data };
}

function publicAssessment(assessment) {
  return {
    id: assessment.id,
    topicId: assessment.topicId,
    title: assessment.title,
    instructions: assessment.instructions,
    questions: assessment.questions.map(({ key, prompt, options }) => ({ key, prompt, options })),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
  };
}

function scoreAssessment(assessment, answers) {
  if (!Array.isArray(answers)) {
    return { success: false, code: 'INVALID_ANSWERS', message: 'Answers must be an array.' };
  }

  const questions = assessment.questions;
  const questionKeys = new Set(questions.map((question) => question.key));
  const submitted = new Map();

  for (const answer of answers) {
    if (!answer || typeof answer.key !== 'string' || !Number.isInteger(answer.answerIndex)) {
      return { success: false, code: 'INVALID_ANSWERS', message: 'Each answer needs a question key and integer answerIndex.' };
    }
    if (!questionKeys.has(answer.key) || submitted.has(answer.key)) {
      return { success: false, code: 'INVALID_ANSWERS', message: 'Answers contain an unknown or duplicate question key.' };
    }
    if (answer.answerIndex < 0 || answer.answerIndex >= 4) {
      return { success: false, code: 'INVALID_ANSWERS', message: 'Answer indexes must be between 0 and 3.' };
    }
    submitted.set(answer.key, answer.answerIndex);
  }

  if (submitted.size !== questions.length) {
    return { success: false, code: 'INCOMPLETE_ASSESSMENT', message: 'Answer every question before submitting.' };
  }

  let correctCount = 0;
  const feedback = questions.map((question) => {
    const selectedIndex = submitted.get(question.key);
    const correct = selectedIndex === question.answerIndex;
    if (correct) correctCount += 1;
    return {
      key: question.key,
      selectedIndex,
      correctIndex: question.answerIndex,
      correct,
      explanation: question.explanation,
    };
  });

  const score = Math.round((correctCount / questions.length) * 100);
  return {
    success: true,
    data: {
      score,
      correctCount,
      questionCount: questions.length,
      passed: score >= 70,
      feedback,
      normalizedAnswers: questions.map((question) => ({
        key: question.key,
        answerIndex: submitted.get(question.key),
      })),
    },
  };
}

function isLocalOllama(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) && url.port === '11434';
  } catch {
    return false;
  }
}

async function generateAssessment(topic, {
  apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
  baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
  model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-oss-120b',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey && !isLocalOllama(baseUrl)) {
    throw new AssessmentGenerationError(503, 'ASSESSMENT_GENERATOR_NOT_CONFIGURED', 'No AI API key is configured for the selected hosted provider.');
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an assessment designer. Produce fair, specific, skill-agnostic multiple-choice questions. The answerIndex is zero-based. Output only valid JSON matching the schema.',
          },
          { role: 'user', content: buildAssessmentPrompt(topic) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'topic_assessment',
            strict: !baseUrl.startsWith('https://api.groq.com/'),
            schema: responseSchema,
          },
        },
        stream: false,
      }),
    });
  } catch {
    throw new AssessmentGenerationError(502, 'ASSESSMENT_PROVIDER_UNAVAILABLE', 'The configured AI assessment provider could not be reached. Check its base URL, network access, and API status.');
  }

  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503
      : response.status === 429 ? 503 : 502;
    const code = response.status === 401 || response.status === 403 ? 'ASSESSMENT_PROVIDER_CONFIGURATION'
      : response.status === 429 ? 'ASSESSMENT_PROVIDER_RATE_LIMITED' : 'ASSESSMENT_PROVIDER_ERROR';
    throw new AssessmentGenerationError(status, code, 'The AI provider could not generate this assessment. Check the configured model and retry.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AssessmentGenerationError(502, 'ASSESSMENT_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unreadable response.');
  }

  const content = payload.choices?.[0]?.message?.content;
  let proposal;
  try {
    proposal = JSON.parse(content);
  } catch {
    throw new AssessmentGenerationError(502, 'ASSESSMENT_PROVIDER_INVALID_RESPONSE', 'The AI provider returned invalid assessment JSON.');
  }

  const validated = validateAssessment(proposal);
  if (!validated.success) {
    throw new AssessmentGenerationError(502, 'ASSESSMENT_PROVIDER_INVALID_ASSESSMENT', 'The generated assessment did not pass validation. Please try again.');
  }

  return validated.data;
}

module.exports = {
  AssessmentGenerationError,
  assessmentSchema,
  buildAssessmentPrompt,
  validateAssessment,
  publicAssessment,
  scoreAssessment,
  generateAssessment,
};
