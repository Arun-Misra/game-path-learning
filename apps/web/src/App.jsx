import { useEffect, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, Clock3, Compass, Flame,
  GraduationCap, Sparkles, Target, Zap,
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
  const [apiStatus, setApiStatus] = useState('checking');
  const [accountMode, setAccountMode] = useState('register');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]);
  const [roadmapsByGoal, setRoadmapsByGoal] = useState({});
  const [roadmapBusyGoal, setRoadmapBusyGoal] = useState(null);
  const [missionsByGoal, setMissionsByGoal] = useState({});
  const [missionBusyId, setMissionBusyId] = useState(null);

  useEffect(() => {
    requestJson('/api/v1/health')
      .then(() => {
        setApiStatus('online');
        return requestJson('/api/v1/auth/me');
      })
      .then((result) => {
        if (result?.data?.user) {
          setUser(result.data.user);
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
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateRoadmap(goal) {
    setRoadmapBusyGoal(goal.id);
    setNotice(null);
    try {
      const result = await requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps/generate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setRoadmapsByGoal((current) => ({
        ...current,
        [goal.id]: [result.data.roadmap, ...(current[goal.id] || [])],
      }));
      setNotice({ type: 'success', message: `A personalised draft roadmap for ${goal.skill} is ready to review.` });
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
        { method: 'POST', body: JSON.stringify({}) },
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
      setNotice({ type: 'success', message: result.data.alreadyCompleted
        ? 'This mission was already completed.'
        : `Mission complete! You earned ${result.data.xpAwarded} XP.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
    }
  }

  async function handleLogout() {
    try {
      await requestJson('/api/v1/auth/logout', { method: 'POST' });
      setUser(null);
      setGoals([]);
      setRoadmapsByGoal({});
      setMissionsByGoal({});
      setNotice({ type: 'success', message: 'You have signed out.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20241f]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
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

      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:gap-20 lg:pt-16">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#dce5d7] bg-[#edf3e9] px-3 py-1.5 text-xs font-semibold text-[#476b49]"><Sparkles size={14} /> A learning path built around you</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-6xl xl:text-7xl">Make progress<br />that <span className="font-serif italic font-normal text-[#72916d]">actually sticks.</span></h1>
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

        <div className="relative">
          <div className="absolute -right-4 -top-5 h-28 w-28 rounded-full bg-[#dfe9d5] blur-2xl" />
          <div className="relative rounded-[2rem] border border-[#e6e8de] bg-white p-5 shadow-[0_24px_80px_-40px_rgba(38,63,50,0.28)] sm:p-8">
            <div className="mb-7 flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#82917b]">Start your journey</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">What would you like to learn?</h2><p className="mt-2 text-sm text-[#7c8378]">We’ll shape a plan around your life.</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf3e9] text-[#4c704b]"><GraduationCap size={22} /></span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!user && <div className="space-y-3 rounded-2xl bg-[#f7f8f4] p-4">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#424a40]">Your account</p><div className="flex rounded-lg bg-[#e9ece4] p-1 text-xs"><button type="button" onClick={() => { setAccountMode('register'); setNotice(null); }} className={`rounded-md px-3 py-1.5 ${accountMode === 'register' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Sign up</button><button type="button" onClick={() => { setAccountMode('login'); setNotice(null); }} className={`rounded-md px-3 py-1.5 ${accountMode === 'login' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Sign in</button></div></div>
                {accountMode === 'register' && <Field label="Name (optional)"><input name="name" value={form.name} onChange={updateField} maxLength={80} placeholder="What should we call you?" className="field" /></Field>}
                <Field label="Email"><input type="email" name="email" value={form.email} onChange={updateField} required autoComplete="email" maxLength={254} placeholder="you@example.com" className="field" /></Field>
                <Field label="Password"><input type="password" name="password" value={form.password} onChange={updateField} required minLength={accountMode === 'register' ? 10 : 1} maxLength={128} autoComplete={accountMode === 'register' ? 'new-password' : 'current-password'} placeholder={accountMode === 'register' ? 'At least 10 characters' : 'Your password'} className="field" /></Field>
              </div>}

              <Field label="The skill you want to learn"><input name="skill" value={form.skill} onChange={updateField} required maxLength={160} placeholder="e.g. Machine learning, guitar, public speaking..." className="field" /></Field>
              <Field label="Where are you starting from?"><div className="grid grid-cols-3 gap-2">{[['beginner', 'New to it'], ['some', 'Know a little'], ['experienced', 'Experienced']].map(([value, label]) => <button key={value} type="button" onClick={() => setForm((current) => ({ ...current, experience: value }))} className={`rounded-xl border px-2 py-3 text-xs font-semibold transition sm:text-sm ${form.experience === value ? 'border-[#557b54] bg-[#edf3e9] text-[#355a39] ring-1 ring-[#557b54]' : 'border-[#e5e8df] text-[#737b70] hover:bg-[#fafbf8]'}`}>{form.experience === value && <Check size={13} className="mr-1 inline" />}{label}</button>)}</div></Field>
              <Field label="What does success look like?"><textarea name="outcome" value={form.outcome} onChange={updateField} required maxLength={1000} rows={3} placeholder="e.g. Build and deploy my first ML model..." className="field resize-none" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Minutes per day"><select name="minutesPerDay" value={form.minutesPerDay} onChange={updateField} className="field"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></Field>
                <Field label="Days per week"><select name="daysPerWeek" value={form.daysPerWeek} onChange={updateField} className="field">{[2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}</select></Field>
              </div>

              <button type="submit" disabled={busy || apiStatus !== 'online'} className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#263f32] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#355640] focus:outline-none focus:ring-4 focus:ring-[#d8e5d3] disabled:cursor-not-allowed disabled:opacity-55">{busy ? 'Saving your goal…' : 'Save my learning goal'} <ArrowRight size={17} className="transition group-hover:translate-x-1" /></button>
              {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{notice.message}</div>}
              <p className="text-center text-xs text-[#9aa095]">Your goal is saved to your account when the API and database are configured.</p>
            </form>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-2xl border border-[#e5e8df] bg-white px-4 py-3 shadow-lg sm:flex"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2d9] text-[#9d7333]"><Zap size={19} /></span><div><p className="text-sm font-semibold">Small steps, real momentum</p><p className="mt-0.5 text-xs text-[#8a9186]">Your next step, always clear</p></div></div>
        </div>
      </section>

      {user && goals.length > 0 && <section className="mx-auto max-w-7xl px-5 pb-12 sm:px-8"><div className="rounded-3xl border border-[#e3e6dc] bg-white p-6"><h2 className="text-xl font-semibold">Your saved learning goals</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{goals.map((goal) => <article key={goal.id} className="rounded-2xl border border-[#e7e9e1] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{goal.skill}</p><p className="mt-1 text-sm text-[#737b70]">{goal.outcome}</p><p className="mt-3 text-xs text-[#82917b]">{goal.minutesPerDay} min/day · {goal.daysPerWeek} days/week · {goal.status} · {missionsByGoal[goal.id]?.totalXp || 0} XP</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => handleGenerateRoadmap(goal)} disabled={roadmapBusyGoal !== null || apiStatus !== 'online'} className="rounded-xl bg-[#263f32] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{roadmapBusyGoal === goal.id ? 'Generating…' : 'Generate roadmap'}</button>{(roadmapsByGoal[goal.id] || []).some((item) => item.generationState === 'ACTIVE') && <button type="button" onClick={() => handleGenerateMissions(goal)} disabled={missionBusyId !== null || apiStatus !== 'online'} className="rounded-xl border border-[#b9cbb2] px-3 py-2 text-xs font-semibold text-[#355a39] disabled:opacity-50">{missionBusyId === goal.id ? 'Scheduling…' : 'Plan this week'}</button>}</div></div>{(roadmapsByGoal[goal.id] || []).map((roadmap) => <div key={roadmap.id} className="mt-4 rounded-xl bg-[#f7f8f4] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{roadmap.title}</p><p className="mt-1 text-xs text-[#737b70]">Version {roadmap.version} · {roadmap.generationState.toLowerCase()} · {roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0)} min</p></div>{roadmap.generationState === 'DRAFT' && <button type="button" onClick={() => handleActivateRoadmap(goal, roadmap)} disabled={roadmapBusyGoal !== null} className="rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">Activate</button>}</div><p className="mt-2 text-sm text-[#737b70]">{roadmap.summary}</p><ol className="mt-3 space-y-2">{roadmap.topics.map((topic) => <li key={topic.id} className="flex gap-3 border-t border-[#e4e8df] pt-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-[#557b54]">{topic.position + 1}</span><div><p className="text-sm font-semibold">{topic.title}</p><p className="mt-0.5 text-xs leading-5 text-[#737b70]">{topic.description}</p><p className="mt-1 text-[11px] text-[#82917b]">{topic.estimatedMinutes} min</p></div></li>)}</ol></div>)}{(missionsByGoal[goal.id]?.missions || []).length > 0 && <div className="mt-4 rounded-xl border border-[#e4e8df] p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">This week’s missions</p><span className="text-xs text-[#82917b]">{missionsByGoal[goal.id].missions.filter((item) => item.status === 'COMPLETED').length}/{missionsByGoal[goal.id].missions.length} complete</span></div><div className="mt-3 space-y-2">{missionsByGoal[goal.id].missions.map((mission) => <div key={mission.id} className="flex items-start justify-between gap-3 rounded-xl bg-[#f7f8f4] p-3"><div><p className="text-sm font-semibold">{mission.title}</p><p className="mt-1 text-xs text-[#737b70]">{mission.topic?.title} · {mission.estimatedMinutes} min · {mission.scheduledDate.slice(0, 10)}</p><p className="mt-1 text-xs leading-5 text-[#737b70]">{mission.description}</p></div>{mission.status !== 'COMPLETED' && <button type="button" onClick={() => handleCompleteMission(goal, mission)} disabled={missionBusyId !== null} className="shrink-0 rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">{missionBusyId === mission.id ? 'Saving…' : 'Complete'}</button>} </div>)}</div></div>}</article>)}</div></div></section>}

      <footer className="border-t border-[#e6e8df] px-5 py-5 text-center text-xs text-[#969d91]"><span className="inline-flex items-center gap-2"><BookOpen size={13} /> Learn with intention. Grow at your pace.</span></footer>
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