import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, FlaskConical, Play, RefreshCw } from 'lucide-react';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'Request failed.');
  return body;
}

export default function AssessmentTestPage({ user, goals, roadmapsByGoal, apiStatus }) {
  const [busyTopicId, setBusyTopicId] = useState(null);
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const [filter, setFilter] = useState('all');

  const topics = useMemo(() => goals.flatMap((goal) => (
    (roadmapsByGoal[goal.id] || [])
      .filter((roadmap) => roadmap.generationState === 'ACTIVE')
      .flatMap((roadmap) => roadmap.topics.map((topic) => ({
        ...topic,
        goal,
        roadmap,
        key: topic.id,
      })))
  )), [goals, roadmapsByGoal]);

  const visibleTopics = topics.filter((topic) => filter === 'all' || (filter === 'untested' ? !results[topic.id] : results[topic.id]));

  useEffect(() => {
    document.title = 'Assessment Test Bench · Pathwise';
    return () => { document.title = 'Pathwise — Never Stop Learning'; };
  }, []);

  async function runAssessment(topic) {
    setBusyTopicId(topic.id);
    setErrors((current) => ({ ...current, [topic.id]: null }));
    setResults((current) => ({ ...current, [topic.id]: { status: 'running' } }));
    try {
      const generated = await requestJson(
        `/api/v1/learning-goals/${topic.goal.id}/assessments/${topic.id}/generate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const assessment = generated.data.assessment;
      const answers = assessment.questions.map((question) => ({
        key: question.key,
        // Deterministic test input: choose option 0 for every question.
        // This creates a real scored attempt; it does not force a passing score.
        answerIndex: 0,
      }));
      const submitted = await requestJson(
        `/api/v1/learning-goals/${topic.goal.id}/assessments/${topic.id}/attempts`,
        { method: 'POST', body: JSON.stringify({ answers }) },
      );
      setResults((current) => ({
        ...current,
        [topic.id]: {
          status: 'complete',
          assessmentTitle: assessment.title,
          questionCount: submitted.data.attempt.questionCount,
          score: submitted.data.attempt.score,
          passed: submitted.data.attempt.passed,
          progressStatus: submitted.data.topicProgress.status,
          alreadyExisted: generated.data.alreadyExisted,
          attemptId: submitted.data.attempt.id,
        },
      }));
    } catch (error) {
      setResults((current) => ({ ...current, [topic.id]: { status: 'error' } }));
      setErrors((current) => ({ ...current, [topic.id]: error.message }));
    } finally {
      setBusyTopicId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#101010] px-4 py-6 text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-400 transition hover:text-white">
          <ArrowLeft size={16} /> Back to Pathwise
        </a>

        <header className="mt-8 border-b border-white/15 pb-7">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#ff5a36]">
            <FlaskConical size={15} /> Developer utility
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Assessment test bench</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Run a real assessment attempt for any topic in your active learning paths. Each button loads or generates the assessment, submits option 1 for every question, and shows the server-scored result.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span>API: <strong className={apiStatus === 'online' ? 'text-emerald-400' : 'text-amber-300'}>{apiStatus}</strong></span>
            <span>Account: <strong className="text-zinc-300">{user?.email || 'Signed out'}</strong></span>
            <span>{topics.length} active topic{topics.length === 1 ? '' : 's'}</span>
          </div>
        </header>

        {!user && <div className="mt-6 border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">
          Sign in on the main Pathwise page first, then return here. Assessment attempts are saved to your account.
        </div>}

        {user && topics.length === 0 && (
          <div className="mt-6 border border-white/10 p-5 text-sm text-zinc-400">
            No active roadmap topics found. Activate a roadmap on the main page to populate this test bench.
          </div>
        )}

        {user && topics.length > 0 && <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">One action per topic · attempts are persisted</p>
            <div className="flex gap-2">
              {[
                ['all', 'All topics'],
                ['untested', 'Not run'],
                ['tested', 'Run results'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${filter === value ? 'border-[#ff5a36] bg-[#ff5a36] text-black' : 'border-white/15 text-zinc-400 hover:border-white/40 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {visibleTopics.map((topic) => {
              const result = results[topic.id];
              const busy = busyTopicId === topic.id;
              return (
                <article key={topic.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                      {topic.goal.skill} · Chunk {topic.roadmap.learningBrief?.chunkNumber || topic.roadmap.version} · Topic {topic.position + 1}
                    </p>
                    <h2 className="mt-1 break-words text-base font-semibold">{topic.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">{topic.description}</p>
                    {result?.status === 'complete' && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 size={14} /> Attempt saved</span>
                        <span className="text-zinc-300">{result.score}% · {result.passed ? 'Passed' : 'Not passed'}</span>
                        <span className="text-zinc-500">{result.questionCount} questions · mastery: {result.progressStatus}</span>
                        <span className="text-zinc-600">{result.alreadyExisted ? 'Existing assessment' : 'New assessment'}</span>
                      </div>
                    )}
                    {result?.status === 'error' && (
                      <p className="mt-3 inline-flex items-start gap-1 text-xs leading-5 text-rose-300"><CircleAlert size={14} className="mt-0.5 shrink-0" />{errors[topic.id] || 'Attempt failed.'}</p>
                    )}
                    {result?.status === 'running' && <p className="mt-3 text-xs text-amber-300">Generating/loading and submitting…</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => runAssessment(topic)}
                    disabled={!user || apiStatus !== 'online' || busyTopicId !== null}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ff5a36] px-5 text-sm font-bold text-black transition hover:bg-[#ff795b] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                    {busy ? 'Running…' : result?.status === 'complete' ? 'Run again' : 'Complete assessment'}
                  </button>
                </article>
              );
            })}
          </div>
          <p className="mt-5 text-xs leading-5 text-zinc-600">
            Test behavior: option 1 is submitted for every question, so the score can be below the passing threshold. This intentionally uses the normal API and scoring path; it does not bypass answer-key protection or force mastery.
          </p>
        </>}
      </div>
    </main>
  );
}