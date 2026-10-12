import { useEffect, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, Clock3, Compass, Flame,
  GraduationCap, Sparkles, Target, Zap, House, Map, Trophy, Plus,
} from 'lucide-react';

const initialForm = {
  skill: '', experience: 'beginner', outcome: '',
  minutesPerDay: '30', daysPerWeek: '5',
  name: '', email: '', password: '',
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Something went wrong. Please try again.');
  return body;
}

function App() {
  const [form, setForm] = useState(initialForm);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [accountMode, setAccountMode] = useState('register');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]);
  const [roadmapsByGoal, setRoadmapsByGoal] = useState({});
  const [learningBriefConfirmedByRoadmap, setLearningBriefConfirmedByRoadmap] = useState({});
  const [clarificationByRoadmap, setClarificationByRoadmap] = useState({});
  const [planningByGoal, setPlanningByGoal] = useState({});
  const [answersByGoal, setAnswersByGoal] = useState({});
  const [clarificationByGoal, setClarificationByGoal] = useState({});
  const [questionsByGoal, setQuestionsByGoal] = useState({});
  const [questionFormGoal, setQuestionFormGoal] = useState(null);
  const [roadmapBusyGoal, setRoadmapBusyGoal] = useState(null);
  const [missionsByGoal, setMissionsByGoal] = useState({});
  const [missionBusyId, setMissionBusyId] = useState(null);
  const [assessmentByTopic, setAssessmentByTopic] = useState({});
  const [assessmentBusyId, setAssessmentBusyId] = useState(null);
  const [assessmentAnswers, setAssessmentAnswers] = useState({});
  const [assessmentResultByTopic, setAssessmentResultByTopic] = useState({});
  const [gamification, setGamification] = useState(null);

  useEffect(() => {
    requestJson('/api/v1/health')
      .then(() => {
        setApiStatus('online');
        return requestJson('/api/v1/auth/me');
      })
      .then((result) => {
        if (result?.data?.user) {
          setUser(result.data.user);
          void refreshGamification();
          return requestJson('/api/v1/learning-goals');
        }
        return null;
      })
      .then(async (result) => {
        if (result?.data?.goals) {
          setGoals(result.data.goals);
          const entries = await Promise.all(result.data.goals.map(async (goal) => {
            const saved = await requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps`);
            return [goal.id, saved.data.roadmaps];
          }));
          setRoadmapsByGoal(Object.fromEntries(entries));
          const missionEntries = await Promise.all(result.data.goals.map(async (goal) => {
            try {
              const saved = await requestJson(`/api/v1/learning-goals/${goal.id}/missions?timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
              return [goal.id, saved.data];
            } catch {
              return [goal.id, { missions: [], totalXp: 0 }];
            }
          }));
          setMissionsByGoal(Object.fromEntries(missionEntries));
        }
      })
      .catch((error) => {
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          setApiStatus('offline');
        }
      });
  }, []);

  async function refreshGamification() {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(`/api/v1/gamification?timeZone=${encodeURIComponent(timeZone)}`);
      setGamification(result.data);
    } catch {
      // Keep the rest of the learning dashboard usable if gamification is temporarily unavailable.
    }
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setNotice(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.skill.trim() || !form.outcome.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      let activeUser = user;
      if (!activeUser) {
        const auth = await requestJson(`/api/v1/auth/${accountMode}`, {
          method: 'POST',
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            ...(accountMode === 'register' && form.name.trim() ? { name: form.name.trim() } : {}),
          }),
        });
        activeUser = auth.data.user;
        setUser(activeUser);
        void refreshGamification();
      }
      const result = await requestJson('/api/v1/learning-goals', {
        method: 'POST',
        body: JSON.stringify({
          skill: form.skill,
          experience: form.experience,
          outcome: form.outcome,
          minutesPerDay: Number(form.minutesPerDay),
          daysPerWeek: Number(form.daysPerWeek),
        }),
      });
      setGoals((current) => [result.data.goal, ...current]);
      setNotice({ type: 'success', message: 'Your learning goal is saved. Next, we’ll build its personalised roadmap.' });
      setForm((current) => ({ ...current, skill: '', outcome: '' }));
      setShowGoalForm(false);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteGoal(goal) {
    const confirmed = window.confirm(
      `Delete “${goal.skill}” and all its roadmaps, missions, and topic progress? This cannot be undone.`,
    );
    if (!confirmed) return;

    setRoadmapBusyGoal(goal.id);
    setNotice(null);
    try {
      await requestJson(`/api/v1/learning-goals/${goal.id}`, { method: 'DELETE' });
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      setRoadmapsByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setLearningBriefConfirmedByRoadmap((current) => { const next = { ...current }; for (const roadmap of roadmapsByGoal[goal.id] || []) delete next[roadmap.id]; return next; });
      setClarificationByRoadmap((current) => { const next = { ...current }; for (const roadmap of roadmapsByGoal[goal.id] || []) delete next[roadmap.id]; return next; });
      setMissionsByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setAssessmentByTopic({});
      setAssessmentAnswers({});
      setAssessmentResultByTopic({});
      await refreshGamification();
      setNotice({ type: 'success', message: `Deleted learning goal “${goal.skill}” and its learning data.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRoadmapBusyGoal(null);
    }
  }

  async function handleGenerateRoadmap(goal) {
    setQuestionFormGoal(goal.id); setNotice(null);
    try {
      const result = await requestJson('/api/v1/learning-goals/' + goal.id + '/roadmaps/questions', { method: 'POST', body: JSON.stringify({}) });
      const questions = result.data.questions || [];
      setPlanningByGoal((current) => ({ ...current, [goal.id]: current[goal.id] || 7 }));
      setAnswersByGoal((current) => ({ ...current, [goal.id]: current[goal.id] || {} }));
      setQuestionsByGoal((current) => ({ ...current, [goal.id]: questions }));
      setNotice({ type: 'success', message: questions.length ? 'Answer these questions to personalise the next chunk.' : 'No extra questions are needed. Generate your learning chunk below.' });
    } catch (error) { setQuestionFormGoal(null); setNotice({ type: 'error', message: error.message }); }
  }

  async function handleGenerateChunk(goal) {
    const answerState = answersByGoal[goal.id] || {};
    const questions = questionsByGoal[goal.id] || [];
    const answers = questions.map((question) => ({ question: question.question, answer: answerState[question.key] || '' }));
    if (answers.some((item) => !item.answer)) {
      setNotice({ type: 'error', message: 'Answer both questions before generating the chunk.' });
      return;
    }
    setRoadmapBusyGoal(goal.id); setNotice(null);
    try {
      const result = await requestJson('/api/v1/learning-goals/' + goal.id + '/roadmaps/generate', { method: 'POST', body: JSON.stringify({ planningDays: planningByGoal[goal.id] || 7, answers, clarifications: clarificationByGoal[goal.id] || '' }) });
      setLearningBriefConfirmedByRoadmap((current) => ({ ...current, [result.data.roadmap.id]: false }));
      setRoadmapsByGoal((current) => ({ ...current, [goal.id]: [result.data.roadmap, ...(current[goal.id] || [])] }));
      setQuestionFormGoal(null);
      setNotice({ type: 'success', message: 'Your next learning chunk is ready. Review its activities and time budget before activating it.' });
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setRoadmapBusyGoal(null); }
  }

  async function handleRegenerateRoadmapWithClarification(goal, roadmap) {
    const clarifications = (clarificationByRoadmap[roadmap.id] || '').trim();
    if (!clarifications) return;

    setRoadmapBusyGoal(goal.id);
    setNotice(null);
    try {
      const result = await requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps/generate`, {
        method: 'POST',
        body: JSON.stringify({ clarifications }),
      });
      setLearningBriefConfirmedByRoadmap((current) => ({ ...current, [result.data.roadmap.id]: false }));
      setClarificationByRoadmap((current) => ({ ...current, [roadmap.id]: '' }));
      setRoadmapsByGoal((current) => ({
        ...current,
        [goal.id]: [result.data.roadmap, ...(current[goal.id] || [])],
      }));
      setNotice({ type: 'success', message: 'Created a new draft using your clarification. Review its updated learning brief before activating it.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRoadmapBusyGoal(null);
    }
  }

  async function handleDeleteRoadmap(goal, roadmap) {
    const confirmed = window.confirm(
      `Delete draft “${roadmap.title}”? This cannot be undone.`,
    );
    if (!confirmed) return;

    setRoadmapBusyGoal(goal.id);
    setNotice(null);
    try {
      await requestJson(
        `/api/v1/learning-goals/${goal.id}/roadmaps/${roadmap.id}`,
        { method: 'DELETE' },
      );
      setRoadmapsByGoal((current) => ({
        ...current,
        [goal.id]: (current[goal.id] || []).filter((item) => item.id !== roadmap.id),
      }));
      setNotice({ type: 'success', message: `Deleted draft roadmap “${roadmap.title}”.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRoadmapBusyGoal(null);
    }
  }

  async function handleActivateRoadmap(goal, roadmap) {
    setRoadmapBusyGoal(goal.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/roadmaps/${roadmap.id}/activate`,
        { method: 'POST', body: JSON.stringify({
          confirmLearningBrief: Boolean(roadmap.learningBrief && learningBriefConfirmedByRoadmap[roadmap.id]),
        }) },
      );
      setRoadmapsByGoal((current) => ({
        ...current,
        [goal.id]: (current[goal.id] || []).map((item) => {
          if (item.id === result.data.roadmap.id) return result.data.roadmap;
          if (item.generationState === 'ACTIVE') return { ...item, generationState: 'SUPERSEDED' };
          return item;
        }),
      }));
      setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, status: 'active' } : item));
      setNotice({ type: 'success', message: `Roadmap activated for ${goal.skill}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRoadmapBusyGoal(null);
    }
  }

  async function handleGenerateMissions(goal) {
    setMissionBusyId(goal.id);
    setNotice(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/generate?timeZone=${encodeURIComponent(timeZone)}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMissionsByGoal((current) => ({ ...current, [goal.id]: result.data }));
      setNotice({ type: 'success', message: result.data.missions.length
        ? `Your missions for this week are ready for ${goal.skill}.`
        : 'No new missions are needed for this week.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
    }
  }

  async function handleCompleteMission(goal, mission) {
    setMissionBusyId(mission.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/${mission.id}/complete`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMissionsByGoal((current) => {
        const state = current[goal.id] || { missions: [], totalXp: 0 };
        return {
          ...current,
          [goal.id]: {
            ...state,
            missions: state.missions.map((item) => item.id === mission.id
              ? { ...item, status: 'COMPLETED', completedAt: result.data.mission.completedAt || new Date().toISOString() }
              : item),
            totalXp: result.data.totalXp ?? state.totalXp,
          },
        };
      });
      await refreshGamification();
      setNotice({ type: 'success', message: result.data.alreadyCompleted
        ? 'This mission was already completed.'
        : `Mission complete! You earned ${result.data.xpAwarded} XP.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
    }
  }

  async function handleGenerateAssessment(goal, topic) {
    setAssessmentBusyId(topic.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/assessments/${topic.id}/generate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setAssessmentByTopic((current) => ({ ...current, [topic.id]: result.data.assessment }));
      setAssessmentAnswers((current) => ({ ...current, [topic.id]: {} }));
      setAssessmentResultByTopic((current) => ({ ...current, [topic.id]: null }));
      setNotice({ type: 'success', message: result.data.alreadyExisted
        ? `Loaded your assessment for ${topic.title}.`
        : `A new assessment for ${topic.title} is ready.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setAssessmentBusyId(null);
    }
  }

  async function handleSubmitAssessment(goal, topic) {
    const assessment = assessmentByTopic[topic.id];
    if (!assessment) return;
    const answers = assessment.questions.map((question) => ({
      key: question.key,
      answerIndex: assessmentAnswers[topic.id]?.[question.key],
    }));
    if (answers.some((answer) => !Number.isInteger(answer.answerIndex))) {
      setNotice({ type: 'error', message: 'Answer every question before submitting.' });
      return;
    }

    setAssessmentBusyId(topic.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/assessments/${topic.id}/attempts`,
        { method: 'POST', body: JSON.stringify({ answers }) },
      );
      setAssessmentResultByTopic((current) => ({ ...current, [topic.id]: result.data }));
      setNotice({
        type: result.data.attempt.passed ? 'success' : 'error',
        message: `Assessment score: ${result.data.attempt.score}%. ${result.data.attempt.passed ? 'You passed!' : 'Review the explanations and try again.'}`,
      });
      setMissionsByGoal((current) => ({ ...current }));
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setAssessmentBusyId(null);
    }
  }

  async function handleLogout() {
    try {
      await requestJson('/api/v1/auth/logout', { method: 'POST' });
      setUser(null);
      setGoals([]);
      setRoadmapsByGoal({});
      setLearningBriefConfirmedByRoadmap({});
      setClarificationByRoadmap({});
      setMissionsByGoal({});
      setAssessmentByTopic({});
      setAssessmentAnswers({});
      setAssessmentResultByTopic({});
      setGamification(null);
      setNotice({ type: 'success', message: 'You have signed out.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  }

  return (
    <main className="app-shell min-h-screen bg-[#f7f7f2] text-[#20241f]">
      <header className="app-header mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-3" aria-label="Pathwise home">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#263f32] text-white"><Compass size={21} /></span>
          <span className="text-lg font-bold tracking-tight">pathwise<span className="text-[#73916f]">.</span></span>
        </a>
        <div className="flex items-center gap-2 rounded-full border border-[#e3e6dc] bg-white px-3 py-2 text-xs font-medium text-[#5b6658]">
          <span className={`h-2 w-2 rounded-full ${apiStatus === 'online' ? 'bg-emerald-500' : apiStatus === 'offline' ? 'bg-rose-500' : 'bg-amber-400'}`} />
          {apiStatus === 'online' ? 'Learning engine connected' : apiStatus === 'offline' ? 'API disconnected' : 'Connecting to learning engine'}
          {user && <><span className="mx-1 text-[#c5cabe]">·</span><span>{user.name || user.email}</span><button type="button" onClick={handleLogout} className="ml-1 underline">Sign out</button></>}
        </div>
      </header>

      {user && goals.length > 0 && <aside className="learning-sidebar" aria-label="Learning navigation">
        <a href="/" className="sidebar-brand" aria-label="Pathwise home"><span className="sidebar-brand-mark"><Compass size={23} /></span><span>pathwise<span className="brand-dot">.</span></span></a>
        <p className="sidebar-label">YOUR SPACE</p>
        <nav className="sidebar-nav">
          <a href="#learning-stats" className="sidebar-link"><House size={19} /> <span>Home</span></a>
          <a href="#learning-goals" className="sidebar-link active"><Map size={19} /> <span>My learning path</span></a>
          <a href="#learning-stats" className="sidebar-link"><Trophy size={19} /> <span>Achievements</span></a>
        </nav>
        <div className="sidebar-streak">
          <div className="sidebar-streak-top"><Flame size={20} /><span>{gamification?.currentStreak || 0} day streak</span></div>
          <p>{gamification?.currentStreak ? 'You’re building a habit. Keep it alive!' : 'One small session starts your streak.'}</p>
        </div>
        <button type="button" className="sidebar-add-goal" onClick={() => { setShowGoalForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Plus size={18} /> New learning goal</button>
        <div className="sidebar-profile"><span className="profile-avatar">{(user.name || user.email || 'L').slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{user.name || 'Learner'}</strong><small>Level {gamification?.level?.level || 1} explorer</small></span><button type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">↗</button></div>
      </aside>}

      {(!user || goals.length === 0 || showGoalForm) && <section className="hero-layout mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:gap-20 lg:pt-16">
        <div className="hero-copy flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#dce5d7] bg-[#edf3e9] px-3 py-1.5 text-xs font-semibold text-[#476b49]"><Sparkles size={14} /> A learning path built around you</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-6xl xl:text-7xl">Build a skill.<br />Become the person who <span className="font-serif italic font-normal text-[#72916d]">can do it.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#6d756a] sm:text-lg">Tell us what you want to learn. Get a practical roadmap that fits your starting point, your goal, and your real life.</p>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            <Stat icon={<Target size={17} />} title="Your goal" text="Your destination" />
            <Stat icon={<Clock3 size={17} />} title="Your pace" text="Your schedule" />
            <Stat icon={<Flame size={17} />} title="Your growth" text="Visible progress" />
          </div>
          <div className="mt-12 hidden items-center gap-4 border-t border-[#e3e5dc] pt-6 sm:flex">
            <div className="flex -space-x-2"><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#d9e6d2] text-xs font-bold">ML</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#f0dfc4] text-xs font-bold">♪</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#d7dfed] text-xs font-bold">JS</span></div>
            <p className="text-sm text-[#7b8277]">One place for <strong className="font-semibold text-[#424a40]">any skill</strong> you want to build.</p>
          </div>
        </div>

        <div className="goal-panel-wrap relative">
          <div className="absolute -right-4 -top-5 h-28 w-28 rounded-full bg-[#dfe9d5] blur-2xl" />
          <div className="goal-panel relative rounded-[2rem] border border-[#e6e8de] bg-white p-5 shadow-[0_24px_80px_-40px_rgba(38,63,50,0.28)] sm:p-8">
            <div className="mb-7 flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#82917b]">YOUR NEXT CHAPTER STARTS HERE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Let’s build your learning plan</h2><p className="mt-2 text-sm leading-6 text-[#7c8378]">A few details help us make the next step clear and realistic.</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf3e9] text-[#4c704b]"><GraduationCap size={22} /></span>
            </div>

            <form onSubmit={handleSubmit} className="goal-form space-y-5">
              {!user && <div className="space-y-3 rounded-2xl bg-[#f7f8f4] p-4">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#424a40]">Your account</p><div className="flex rounded-lg bg-[#e9ece4] p-1 text-xs"><button type="button" onClick={() => { setAccountMode('register'); setNotice(null); }} className={`rounded-md px-3 py-1.5 ${accountMode === 'register' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Sign up</button><button type="button" onClick={() => { setAccountMode('login'); setNotice(null); }} className={`rounded-md px-3 py-1.5 ${accountMode === 'login' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Sign in</button></div></div>
                {accountMode === 'register' && <Field label="Name (optional)"><input name="name" value={form.name} onChange={updateField} maxLength={80} placeholder="What should we call you?" className="field" /></Field>}
                <Field label="Email"><input type="email" name="email" value={form.email} onChange={updateField} required autoComplete="email" maxLength={254} placeholder="you@example.com" className="field" /></Field>
                <Field label="Password"><input type="password" name="password" value={form.password} onChange={updateField} required minLength={accountMode === 'register' ? 10 : 1} maxLength={128} autoComplete={accountMode === 'register' ? 'new-password' : 'current-password'} placeholder={accountMode === 'register' ? 'At least 10 characters' : 'Your password'} className="field" /></Field>
              </div>}

              <Field label="1. What do you want to learn?"><input name="skill" value={form.skill} onChange={updateField} required maxLength={160} placeholder="e.g. Machine learning, guitar, public speaking..." className="field" /></Field>
              <Field label="2. What is your current level?"><div className="grid grid-cols-3 gap-2">{[['beginner', 'New to it'], ['some', 'Know a little'], ['experienced', 'Experienced']].map(([value, label]) => <button key={value} type="button" onClick={() => setForm((current) => ({ ...current, experience: value }))} className={`rounded-xl border px-2 py-3 text-xs font-semibold transition sm:text-sm ${form.experience === value ? 'border-[#557b54] bg-[#edf3e9] text-[#355a39] ring-1 ring-[#557b54]' : 'border-[#e5e8df] text-[#737b70] hover:bg-[#fafbf8]'}`}>{form.experience === value && <Check size={13} className="mr-1 inline" />}{label}</button>)}</div></Field>
              <Field label="3. What would you like to be able to do?"><textarea name="outcome" value={form.outcome} onChange={updateField} required maxLength={1000} rows={3} placeholder="e.g. Build and deploy my first ML model..." className="field resize-none" /></Field>
              <div className="schedule-fields grid grid-cols-2 gap-4">
                <Field label="4. Your daily time"><select name="minutesPerDay" value={form.minutesPerDay} onChange={updateField} className="field"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></Field>
                <Field label="Your weekly rhythm"><select name="daysPerWeek" value={form.daysPerWeek} onChange={updateField} className="field">{[2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}</select></Field>
              </div>

              <button type="submit" disabled={busy || apiStatus !== 'online'} className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#263f32] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#355640] focus:outline-none focus:ring-4 focus:ring-[#d8e5d3] disabled:cursor-not-allowed disabled:opacity-55">{busy ? 'Saving your goal…' : 'Create my learning plan'} <ArrowRight size={17} className="transition group-hover:translate-x-1" /></button>
              {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{notice.message}</div>}
              <p className="text-center text-xs text-[#9aa095]">Your goal is saved to your account when the API and database are configured.</p>
            </form>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-2xl border border-[#e5e8df] bg-white px-4 py-3 shadow-lg sm:flex"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2d9] text-[#9d7333]"><Zap size={19} /></span><div><p className="text-sm font-semibold">Small steps, real momentum</p><p className="mt-0.5 text-xs text-[#8a9186]">Your next step, always clear</p></div></div>
        </div>
      </section>}

      {user && gamification && <section id="learning-stats" className="dashboard-section mx-auto max-w-7xl px-5 pb-6 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><Zap size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Level</span></div><p className="mt-2 text-2xl font-bold">{gamification.level.level}</p><p className="mt-1 text-xs text-[#737b70]">{gamification.level.currentLevelXp}/100 XP · {gamification.level.xpToNextLevel} to next level</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0e8]"><div className="h-full rounded-full bg-[#688663]" style={{ width: `${gamification.level.currentLevelXp}%` }} /></div></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#b66a35]"><Flame size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Current streak</span></div><p className="mt-2 text-2xl font-bold">{gamification.currentStreak} day{gamification.currentStreak === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-[#737b70]">Based on completed missions in your local timezone</p></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><Check size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Missions completed</span></div><p className="mt-2 text-2xl font-bold">{gamification.completedMissionCount}</p><p className="mt-1 text-xs text-[#737b70]">Verified completions across your learning goals</p></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><GraduationCap size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Achievements</span></div><p className="mt-2 text-2xl font-bold">{gamification.achievements.length}<span className="ml-1 text-sm font-normal text-[#8b9287]">/ 5</span></p><p className="mt-1 text-xs text-[#737b70]">{gamification.achievements.length ? gamification.achievements.map((item) => item.title).join(' · ') : 'Complete missions to unlock your first badge.'}</p></div>
        </div>
      </section>}

      {user && goals.length > 0 && <section id="learning-goals" className="dashboard-section mx-auto max-w-7xl px-5 pb-12 sm:px-8">
<div className="goals-board rounded-3xl border border-[#e3e6dc] bg-white p-6">
<div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#688663]">YOUR WORKSPACE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Your learning path</h2><p className="mt-1 text-sm text-[#737b70]">Pick up where you left off, or plan your next step.</p></div><span className="rounded-full bg-[#edf3e9] px-3 py-1.5 text-xs font-semibold text-[#355a39]">{goals.length} goal{goals.length === 1 ? '' : 's'} saved</span></div>

<div className="mt-4 grid gap-3 sm:grid-cols-2">{goals.map((goal) => <article key={goal.id} className="goal-card rounded-2xl border border-[#e7e9e1] p-4">
<div className="flex flex-wrap items-start justify-between gap-3">
<div>
<p className="font-semibold">{goal.skill}</p>

<p className="mt-1 text-sm text-[#737b70]">{goal.outcome}</p>

<p className="mt-3 text-xs text-[#82917b]">{goal.minutesPerDay} min/day · {goal.daysPerWeek} days/week · {goal.status} · {missionsByGoal[goal.id]?.totalXp || 0} XP</p>

</div>
<div className="flex flex-wrap gap-2">
<button type="button" onClick={() => handleDeleteGoal(goal)} disabled={roadmapBusyGoal !== null || apiStatus !== 'online'} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{roadmapBusyGoal === goal.id ? 'Working…' : 'Delete goal'}</button>
<button type="button" onClick={() => handleGenerateRoadmap(goal)} disabled={roadmapBusyGoal !== null || apiStatus !== 'online'} className="rounded-xl bg-[#263f32] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{questionFormGoal === goal.id ? 'Questions open below' : 'Plan next learning chunk'}</button>
{(roadmapsByGoal[goal.id] || []).some((item) => item.generationState === 'ACTIVE') && <button type="button" onClick={() => handleGenerateMissions(goal)} disabled={missionBusyId !== null || apiStatus !== 'online'} className="rounded-xl border border-[#b9cbb2] px-3 py-2 text-xs font-semibold text-[#355a39] disabled:opacity-50">{missionBusyId === goal.id ? 'Scheduling…' : 'Plan this week'}</button>
}</div>

</div>
{questionFormGoal === goal.id && <div className="mt-4 rounded-2xl border border-[#dfe7d9] bg-[#fbfcf8] p-4">
<p className="font-semibold">Personalise your next learning chunk</p><p className="mt-1 text-xs leading-5 text-[#737b70]">Plan only a short period. The next chunk will adapt to your progress.</p>
<Field label="How far ahead should we plan?"><select className="field mt-2" value={planningByGoal[goal.id] || 7} onChange={(event) => setPlanningByGoal((current) => ({ ...current, [goal.id]: Number(event.target.value) }))}>{[3, 7, 14, 21, 28].map((days) => <option key={days} value={days}>{days} days</option>)}</select></Field>
{(questionsByGoal[goal.id] || []).map((question) => <Field key={question.key} label={question.question}><p className="mt-1 text-xs text-[#737b70]">{question.reason}</p><select className="field mt-2" value={(answersByGoal[goal.id] || {})[question.key] || ""} onChange={(event) => setAnswersByGoal((current) => ({ ...current, [goal.id]: { ...(current[goal.id] || {}), [question.key]: event.target.value } }))}><option value="">Choose…</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>)}
<Field label="Anything else Pathwise should know?"><textarea className="field mt-2" rows={2} maxLength={1200} value={clarificationByGoal[goal.id] || ""} onChange={(event) => setClarificationByGoal((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder="Optional: paste a trusted tutorial or chord chart link, mention tools you have, or explain a constraint." /></Field>
<div className="mt-3 flex gap-2"><button type="button" onClick={() => handleGenerateChunk(goal)} disabled={roadmapBusyGoal !== null} className="rounded-xl bg-[#263f32] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{roadmapBusyGoal === goal.id ? "Generating chunk…" : "Generate this chunk"}</button><button type="button" onClick={() => setQuestionFormGoal(null)} className="rounded-xl border border-[#dfe7d9] px-4 py-2 text-xs font-semibold">Cancel</button></div></div>}
{(roadmapsByGoal[goal.id] || []).map((roadmap) => <div key={roadmap.id} className="roadmap-card mt-4 rounded-xl bg-[#f7f8f4] p-4">
<div className="flex flex-wrap items-start justify-between gap-2">
<div>
<p className="font-semibold">{roadmap.title}</p>

<p className="mt-1 text-xs text-[#737b70]">Chunk {roadmap.learningBrief?.chunkNumber || roadmap.version} · {roadmap.learningBrief?.planningDays || 7} days · {roadmap.generationState.toLowerCase()} · {roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0)} min planned</p>

</div>{roadmap.generationState === 'DRAFT' && <div className="flex flex-wrap gap-2">
<button type="button" onClick={() => handleActivateRoadmap(goal, roadmap)} disabled={roadmapBusyGoal !== null || Boolean(roadmap.learningBrief && !learningBriefConfirmedByRoadmap[roadmap.id])} className="rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">Activate</button>
<button type="button" onClick={() => handleDeleteRoadmap(goal, roadmap)} disabled={roadmapBusyGoal !== null} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Delete</button>
</div>
}</div>

<p className="mt-2 text-sm text-[#737b70]">{roadmap.summary}</p>{roadmap.learningBrief?.chunkBudgetMinutes && <p className="mt-2 rounded-lg bg-[#edf3e9] p-2 text-xs text-[#355a39]">Chunk budget: {roadmap.learningBrief.chunkBudgetMinutes} minutes over {roadmap.learningBrief.planningDays} days. Future chunks adapt to progress.</p>}

{roadmap.learningBrief && <section className="mt-4 rounded-xl border border-[#dfe7d9] bg-white p-4">
<p className="text-xs font-bold uppercase tracking-wide text-[#688663]">Enhanced learning brief</p>
<p className="mt-2 text-sm font-semibold">{roadmap.learningBrief.outcomeRestatement}</p>
<p className="mt-2 text-xs leading-5 text-[#737b70]"><strong className="text-[#424a40]">Final deliverable:</strong> {roadmap.learningBrief.finalDeliverable}</p>
{roadmap.learningBrief.capabilities?.length > 0 && <div className="mt-3">
<p className="text-xs font-semibold text-[#424a40]">Capabilities this roadmap should cover</p>
<ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-[#737b70]">{roadmap.learningBrief.capabilities.map((item, index) => <li key={index}><strong>{item.capability}</strong> — {item.evidenceOfSuccess}</li>)}</ul>
</div>}
{roadmap.learningBrief.prerequisiteKnowledge?.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-[#424a40]">Expected prerequisites</p><ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#737b70]">{roadmap.learningBrief.prerequisiteKnowledge.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
{roadmap.learningBrief.assumptions?.length > 0 && <div className="mt-3 rounded-lg bg-[#fff6e5] p-3"><p className="text-xs font-semibold text-[#825a21]">Assumptions to review</p><ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#785d31]">{roadmap.learningBrief.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
{roadmap.learningBrief.outOfScope?.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-[#424a40]">Not included in this plan</p><ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#737b70]">{roadmap.learningBrief.outOfScope.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
{roadmap.learningBrief.learnerClarifications && <p className="mt-3 rounded-lg bg-[#edf3e9] p-3 text-xs leading-5 text-[#355a39]"><strong>Clarification applied:</strong> {roadmap.learningBrief.learnerClarifications}</p>}
{roadmap.generationState === 'DRAFT' && <div className="mt-4 border-t border-[#e4e8df] pt-3">
<label className="block text-xs font-semibold text-[#424a40]" htmlFor={'roadmap-clarification-' + roadmap.id}>Need to correct an assumption?</label>
<p className="mt-1 text-xs leading-5 text-[#737b70]">Tell Pathwise what you meant. It will enhance the request again and generate a separate draft, leaving this version untouched.</p>
<textarea id={'roadmap-clarification-' + roadmap.id} value={clarificationByRoadmap[roadmap.id] || ''} onChange={(event) => setClarificationByRoadmap((current) => ({ ...current, [roadmap.id]: event.target.value }))} maxLength={1200} rows={2} placeholder="e.g. Use plain Java rather than Spring Boot; keep all work local." className="field mt-2 resize-y" />
<button type="button" onClick={() => handleRegenerateRoadmapWithClarification(goal, roadmap)} disabled={roadmapBusyGoal !== null || !(clarificationByRoadmap[roadmap.id] || '').trim()} className="mt-2 rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">{roadmapBusyGoal === goal.id ? 'Regenerating…' : 'Regenerate with clarification'}</button>
</div>}
{roadmap.generationState === 'DRAFT' && <label className="mt-4 flex cursor-pointer items-start gap-2 border-t border-[#e4e8df] pt-3 text-xs leading-5 text-[#424a40]">
<input type="checkbox" checked={Boolean(learningBriefConfirmedByRoadmap[roadmap.id])} onChange={(event) => setLearningBriefConfirmedByRoadmap((current) => ({ ...current, [roadmap.id]: event.target.checked }))} className="mt-1 accent-[#355a39]" />
<span>I’ve reviewed this brief, including its assumptions, and it reflects what I want to achieve. I understand I can delete this draft and generate another if it doesn’t.</span>
</label>}
{roadmap.learningBriefConfirmedAt && <p className="mt-3 text-xs text-[#688663]">Learning brief confirmed before activation.</p>}
</section>}

<ol className="learning-path mt-3 space-y-2">{roadmap.topics.map((topic) => <li key={topic.id} className="path-step border-t border-[#e4e8df] pt-3">
<div className="flex gap-3">
<span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-[#557b54]">{topic.position + 1}</span>

<div className="min-w-0 flex-1">
<p className="text-sm font-semibold">{topic.title}</p>

<p className="mt-0.5 text-xs leading-5 text-[#737b70]">{topic.description}</p>

<div className="mt-2 flex flex-wrap items-center gap-2">
<span className="text-[11px] text-[#82917b]">{topic.estimatedMinutes} min</span>
{roadmap.generationState === 'ACTIVE' && <button type="button" onClick={() => handleGenerateAssessment(goal, topic)} disabled={assessmentBusyId !== null} className="rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">{assessmentBusyId === topic.id ? 'Preparing…' : assessmentByTopic[topic.id] ? 'Reload assessment' : 'Take assessment'}</button>
}</div>
{assessmentByTopic[topic.id] && <div className="mt-3 rounded-xl border border-[#dfe7d9] bg-white p-3">
<p className="font-semibold text-sm">{assessmentByTopic[topic.id].title}</p>

<p className="mt-1 text-xs leading-5 text-[#737b70]">{assessmentByTopic[topic.id].instructions}</p>

<div className="mt-3 space-y-4">{assessmentByTopic[topic.id].questions.map((question, questionIndex) => <fieldset key={question.key} className="space-y-2">
<legend className="text-sm font-medium">{questionIndex + 1}. {question.prompt}</legend>
{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#e8ebe3] p-2 text-xs leading-5 hover:bg-[#f7f8f4]">
<input type="radio" name={`${topic.id}-${question.key}`} value={optionIndex} checked={assessmentAnswers[topic.id]?.[question.key] === optionIndex} onChange={() => { setAssessmentAnswers((current) => ({ ...current, [topic.id]: { ...(current[topic.id] || {}), [question.key]: optionIndex } })); setAssessmentResultByTopic((current) => ({ ...current, [topic.id]: null })); }} className="mt-1 accent-[#355a39]" />{option}</label>
)}</fieldset>
)}</div>

<button type="button" onClick={() => handleSubmitAssessment(goal, topic)} disabled={assessmentBusyId !== null} className="mt-4 rounded-xl bg-[#263f32] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{assessmentBusyId === topic.id ? 'Checking answers…' : 'Submit assessment'}</button>
{assessmentResultByTopic[topic.id] && <div className="mt-4 space-y-2 rounded-xl bg-[#f7f8f4] p-3">
<p className="text-sm font-semibold">Score: {assessmentResultByTopic[topic.id].attempt.score}% · {assessmentResultByTopic[topic.id].attempt.passed ? 'Passed' : 'Keep practising'}</p>
{assessmentResultByTopic[topic.id].feedback.map((item, index) => <div key={item.key} className="border-t border-[#e2e7dc] pt-2">
<p className={`text-xs font-semibold ${item.correct ? 'text-emerald-700' : 'text-rose-700'}`}>Question {index + 1}: {item.correct ? 'Correct' : 'Incorrect'}</p>

<p className="mt-1 text-xs leading-5 text-[#737b70]">{item.explanation}</p>

</div>)}</div>
}</div>
}</div>
</div>
</li>)}</ol>

</div>)}
{(missionsByGoal[goal.id]?.missions || []).length > 0 && <div className="mt-4 rounded-xl border border-[#e4e8df] p-4">
<div className="flex items-center justify-between gap-3">
<p className="font-semibold">This week’s missions</p>

<span className="text-xs text-[#82917b]">{missionsByGoal[goal.id].missions.filter((item) => item.status === 'COMPLETED').length}/{missionsByGoal[goal.id].missions.length} complete</span>

</div>
<div className="mt-3 space-y-2">{missionsByGoal[goal.id].missions.map((mission) => <div key={mission.id} className="flex items-start justify-between gap-3 rounded-xl bg-[#f7f8f4] p-3">
<div>
<p className="text-sm font-semibold">{mission.title}</p>

<p className="mt-1 text-xs text-[#737b70]">{mission.topic?.title} · {mission.estimatedMinutes} min · {mission.scheduledDate.slice(0, 10)}</p>

<p className="mt-1 text-xs leading-5 text-[#737b70]">{mission.description}</p>

</div>{mission.status !== 'COMPLETED' && <button type="button" onClick={() => handleCompleteMission(goal, mission)} disabled={missionBusyId !== null} className="shrink-0 rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">{missionBusyId === mission.id ? 'Saving…' : 'Complete'}</button>
} </div>
)}</div>

</div>}</article>
)}</div>

</div>
</section>}

      <footer className="app-footer border-t border-[#e6e8df] px-5 py-5 text-center text-xs text-[#969d91]"><span className="inline-flex items-center gap-2"><BookOpen size={13} /> Learn with intention. Grow at your pace.</span></footer>
    </main>
  );
}

function Field({ label, children }) {
  return <label className="block space-y-2"><span className="block text-sm font-semibold text-[#424a40]">{label}</span>{children}</label>;
}

function Stat({ icon, title, text }) {
  return <div className="rounded-2xl border border-[#e3e6dc] bg-white/70 p-3 sm:p-4"><span className="mb-3 inline-flex text-[#688663]">{icon}</span><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-[11px] leading-4 text-[#8b9287] sm:text-xs">{text}</p></div>;
}

export default App;