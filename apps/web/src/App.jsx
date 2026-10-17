import { useEffect, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, Clock3, Compass, Flame,
  GraduationCap, Sparkles, Target, Zap, House, Map, Trophy, Plus,
} from 'lucide-react';
import AssessmentTestPage from './AssessmentTestPage.jsx';

const initialForm = {
  skill: '', experience: 'beginner', outcome: '',
  minutesPerDay: '30', daysPerWeek: '5', targetDurationDays: '30',
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
  const [recoveryByGoal, setRecoveryByGoal] = useState({});
  const [missionBusyId, setMissionBusyId] = useState(null);
  const [expandedMissionId, setExpandedMissionId] = useState(null);
  const [missionEvidenceById, setMissionEvidenceById] = useState({});
  const [missionActualMinutesById, setMissionActualMinutesById] = useState({});
  const [assessmentByTopic, setAssessmentByTopic] = useState({});
  const [assessmentBusyId, setAssessmentBusyId] = useState(null);
  const [assessmentAnswers, setAssessmentAnswers] = useState({});
  const [assessmentResultByTopic, setAssessmentResultByTopic] = useState({});
  const [gamification, setGamification] = useState(null);
  const [nextStepByGoal, setNextStepByGoal] = useState({});
  const [masterySummaryByGoal, setMasterySummaryByGoal] = useState({});
  const [projectMilestonesByGoal, setProjectMilestonesByGoal] = useState({});
  const [milestoneBusyGoal, setMilestoneBusyGoal] = useState(null);
  const [milestoneEvidenceById, setMilestoneEvidenceById] = useState({});

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const scene = document.querySelector('.landing-art-scene');
    if (!scene) return undefined;
    let frame = 0;
    const onPointerMove = (event) => {
      if (window.innerWidth < 800) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 2;
        const y = (event.clientY / window.innerHeight - 0.5) * 2;
        scene.style.setProperty('--pointer-x', x.toFixed(3));
        scene.style.setProperty('--pointer-y', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [user, showGoalForm, goals.length]);

  useEffect(() => {
    requestJson('/api/v1/ready')
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
            const saved = await requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps?timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`);
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
          await Promise.all(result.data.goals.map(async (goal) => {
            await Promise.all([refreshNextStep(goal.id), refreshProjectMilestones(goal.id), refreshMissionRecovery(goal.id)]);
          }));
        }
      })
      .catch((error) => {
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          setApiStatus('offline');
        }
      });
  }, []);

  async function refreshRoadmaps(goalId) {
    try {
      const result = await requestJson(`/api/v1/learning-goals/${goalId}/roadmaps?timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`);
      setRoadmapsByGoal((current) => ({ ...current, [goalId]: result.data.roadmaps }));
    } catch {
      // Keep the last loaded roadmap if a refresh fails.
    }
  }

  async function refreshMissionRecovery(goalId) {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(`/api/v1/learning-goals/${goalId}/missions/recovery?timeZone=${encodeURIComponent(timeZone)}`);
      setRecoveryByGoal((current) => ({ ...current, [goalId]: result.data }));
    } catch {
      // Recovery is only available when an active roadmap exists.
    }
  }

  async function refreshProjectMilestones(goalId) {
    try {
      const result = await requestJson(`/api/v1/learning-goals/${goalId}/project-milestones`);
      setProjectMilestonesByGoal((current) => ({ ...current, [goalId]: result.data }));
    } catch {
      // Milestone planning is optional until an active roadmap is available.
    }
  }

  async function refreshNextStep(goalId) {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(`/api/v1/learning-goals/${goalId}/next-step?timeZone=${encodeURIComponent(timeZone)}`);
      setNextStepByGoal((current) => ({ ...current, [goalId]: result.data.recommendation }));
      setMasterySummaryByGoal((current) => ({ ...current, [goalId]: result.data.masterySummary || null }));
    } catch {
      // Recommendations are helpful, but should not make the rest of the workspace unavailable.
    }
  }

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
    setBusy(true);
    setNotice(null);
    try {
      if (!user) {
        const auth = await requestJson(`/api/v1/auth/${accountMode}`, {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.trim(),
            password: form.password,
            ...(accountMode === 'register' && form.name.trim() ? { name: form.name.trim() } : {}),
          }),
        });
        setUser(auth.data.user);
        setForm((current) => ({ ...current, password: '', skill: '', outcome: '' }));
        setNotice({ type: 'success', message: accountMode === 'register'
          ? 'Your account is saved. Now create your first learning goal.'
          : 'Welcome back. Your saved learning goals are loading.' });
        const savedGoals = await loadLearningWorkspace();
        setShowGoalForm(savedGoals.length === 0);
        return;
      }

      if (!form.skill.trim() || !form.outcome.trim()) {
        setNotice({ type: 'error', message: 'Add a skill and the outcome you want to achieve.' });
        return;
      }
      const result = await requestJson('/api/v1/learning-goals', {
        method: 'POST',
        body: JSON.stringify({
          skill: form.skill.trim(),
          experience: form.experience,
          outcome: form.outcome.trim(),
          minutesPerDay: Number(form.minutesPerDay),
          daysPerWeek: Number(form.daysPerWeek),
          targetDate: (() => { const date = new Date(); date.setDate(date.getDate() + Number(form.targetDurationDays)); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; })(),
        }),
      });
      setGoals((current) => [result.data.goal, ...current]);
      void refreshNextStep(result.data.goal.id);
      setNotice({ type: 'success', message: 'Your learning goal is saved. Next, we’ll build its personalised roadmap.' });
      setForm((current) => ({ ...current, skill: '', outcome: '' }));
      setShowGoalForm(false);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function loadLearningWorkspace() {
    const result = await requestJson('/api/v1/learning-goals');
    const savedGoals = result.data.goals || [];
    setGoals(savedGoals);
    const entries = await Promise.all(savedGoals.map(async (goal) => {
      const saved = await requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps?timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`);
      return [goal.id, saved.data.roadmaps || []];
    }));
    setRoadmapsByGoal(Object.fromEntries(entries));
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const missionEntries = await Promise.all(savedGoals.map(async (goal) => {
      try {
        const saved = await requestJson(`/api/v1/learning-goals/${goal.id}/missions?timeZone=${encodeURIComponent(timeZone)}`);
        return [goal.id, saved.data];
      } catch {
        return [goal.id, { missions: [], totalXp: 0 }];
      }
    }));
    setMissionsByGoal(Object.fromEntries(missionEntries));
    await Promise.all(savedGoals.map(async (goal) => {
      await Promise.all([refreshNextStep(goal.id), refreshProjectMilestones(goal.id), refreshMissionRecovery(goal.id)]);
    }));
    await refreshGamification();
    return savedGoals;
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
      setNextStepByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setMasterySummaryByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setRoadmapsByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setLearningBriefConfirmedByRoadmap((current) => { const next = { ...current }; for (const roadmap of roadmapsByGoal[goal.id] || []) delete next[roadmap.id]; return next; });
      setClarificationByRoadmap((current) => { const next = { ...current }; for (const roadmap of roadmapsByGoal[goal.id] || []) delete next[roadmap.id]; return next; });
      setMissionsByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setRecoveryByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
      setProjectMilestonesByGoal((current) => { const next = { ...current }; delete next[goal.id]; return next; });
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
      setPlanningByGoal((current) => ({ ...current, [goal.id]: current[goal.id] || 3 }));
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
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson('/api/v1/learning-goals/' + goal.id + '/roadmaps/generate?timeZone=' + encodeURIComponent(timeZone), { method: 'POST', body: JSON.stringify({ planningDays: planningByGoal[goal.id] || 3, answers, clarifications: clarificationByGoal[goal.id] || '' }) });
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
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const missionResult = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/initial?timeZone=${encodeURIComponent(timeZone)}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMissionsByGoal((current) => ({ ...current, [goal.id]: missionResult.data }));
      await Promise.all([refreshNextStep(goal.id), refreshProjectMilestones(goal.id), refreshMissionRecovery(goal.id)]);
      setNotice({ type: 'success', message: `Roadmap activated for ${goal.skill}; your first learning days are scheduled.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRoadmapBusyGoal(null);
    }
  }

  async function handleGenerateProjectMilestones(goal) {
    setMilestoneBusyGoal(goal.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/project-milestones/generate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setProjectMilestonesByGoal((current) => ({
        ...current,
        [goal.id]: { ...(current[goal.id] || {}), ...result.data, deliverable: current[goal.id]?.deliverable || null },
      }));
      await refreshProjectMilestones(goal.id);
      setNotice({ type: 'success', message: result.data.alreadyGenerated ? 'Your project milestones are up to date.' : 'Project milestones created from your confirmed learning brief.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMilestoneBusyGoal(null);
    }
  }

  async function handleUpdateProjectMilestone(goal, milestone, status) {
    const evidence = String(milestoneEvidenceById[milestone.id] ?? milestone.evidence ?? '').trim();
    if (status === 'COMPLETED' && evidence.length < 20) {
      setNotice({ type: 'error', message: 'Add at least 20 characters of evidence before completing this milestone.' });
      return;
    }
    setMilestoneBusyGoal(goal.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/project-milestones/${milestone.id}`,
        { method: 'PATCH', body: JSON.stringify({ status, evidence }) },
      );
      setProjectMilestonesByGoal((current) => ({
        ...current,
        [goal.id]: {
          ...current[goal.id],
          milestones: (current[goal.id]?.milestones || []).map((item) => item.id === milestone.id ? result.data.milestone : item),
        },
      }));
      setMilestoneEvidenceById((current) => ({ ...current, [milestone.id]: result.data.milestone.evidence || '' }));
      setNotice({ type: 'success', message: status === 'COMPLETED' ? 'Milestone completed with evidence saved.' : 'Milestone progress saved.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMilestoneBusyGoal(null);
    }
  }

  async function handleRecoverMissedSessions(goal) {
    setMissionBusyId(goal.id);
    setNotice(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/recovery/replan?timeZone=${encodeURIComponent(timeZone)}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMissionsByGoal((current) => ({ ...current, [goal.id]: result.data }));
      await Promise.all([refreshMissionRecovery(goal.id), refreshNextStep(goal.id)]);
      setNotice({ type: 'success', message: `Recovery plan rebuilt. ${result.data.recoveredMissedCount} missed session${result.data.recoveredMissedCount === 1 ? '' : 's'} accounted for; completed sessions and XP were preserved.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
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
      await Promise.all([refreshNextStep(goal.id), refreshMissionRecovery(goal.id)]);
      setNotice({ type: 'success', message: result.data.missions.length
        ? `Your missions for this week are ready for ${goal.skill}.`
        : 'No new missions are needed for this week.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
    }
  }

  async function handleAdaptMissions(goal) {
    setMissionBusyId(goal.id);
    setNotice(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/adapt?timeZone=${encodeURIComponent(timeZone)}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setMissionsByGoal((current) => ({ ...current, [goal.id]: result.data }));
      await Promise.all([refreshNextStep(goal.id), refreshMissionRecovery(goal.id)]);
      setNotice({ type: 'success', message: `This week's plan for ${goal.skill} now reflects your latest assessment. Completed sessions and XP were preserved.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setMissionBusyId(null);
    }
  }

  async function prepareNextChunkAfterCompletion(goal, mission, xpAwarded) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const rollingResult = await requestJson(
        `/api/v1/learning-goals/${goal.id}/roadmaps/roll-forward?timeZone=${encodeURIComponent(timeZone)}`,
        { method: 'POST', body: JSON.stringify({ completedDate: String(mission.scheduledDate).slice(0, 10) }) },
      );
      if (!rollingResult.data.generated) {
        if (rollingResult.data.reason === 'ALREADY_GENERATED') {
          const [missionRefresh, roadmapRefresh] = await Promise.all([
            requestJson(`/api/v1/learning-goals/${goal.id}/missions?timeZone=${encodeURIComponent(timeZone)}`),
            requestJson(`/api/v1/learning-goals/${goal.id}/roadmaps?timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`),
          ]);
          setMissionsByGoal((current) => ({ ...current, [goal.id]: missionRefresh.data }));
          setRoadmapsByGoal((current) => ({ ...current, [goal.id]: roadmapRefresh.data.roadmaps }));
          await refreshNextStep(goal.id);
          setNotice({ type: 'success', message: `Mission complete! You earned ${xpAwarded} XP. Your next learning days were already prepared and have been refreshed.` });
        } else if (rollingResult.data.reason === 'DAY_NOT_COMPLETE') {
          setNotice({ type: 'success', message: `Mission complete! You earned ${xpAwarded} XP. Finish the remaining sessions for today and Pathwise will prepare the next days.` });
        } else if (rollingResult.data.reason === 'ROLLING_WINDOW_FULL') {
          setNotice({ type: 'success', message: `Mission complete! You earned ${xpAwarded} XP. Your next learning days are already scheduled.` });
        }
        return;
      }

      const nextRoadmap = rollingResult.data.roadmap;
      setRoadmapsByGoal((current) => ({
        ...current,
        [goal.id]: [nextRoadmap, ...(current[goal.id] || []).map((item) => item.generationState === 'ACTIVE' ? { ...item, generationState: 'SUPERSEDED' } : item)],
      }));
      setLearningBriefConfirmedByRoadmap((current) => ({ ...current, [nextRoadmap.id]: true }));
      const missionRefresh = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions?timeZone=${encodeURIComponent(timeZone)}`,
      );
      setMissionsByGoal((current) => ({ ...current, [goal.id]: missionRefresh.data }));
      await refreshNextStep(goal.id);
      setNotice({ type: 'success', message: `Mission complete! You earned ${xpAwarded} XP. Pathwise prepared the next ${rollingResult.data.planningDays} day(s).` });
    } catch {
      setNotice({ type: 'error', message: `Mission complete! You earned ${xpAwarded} XP. Your progress is saved, but the next chunk could not be prepared yet; Pathwise will try again after another completed day.` });
    }
  }

  async function handleCompleteMission(goal, mission) {
    const reflection = String(missionEvidenceById[mission.id] || '').trim();
    if (reflection.length < 10) {
      setNotice({ type: 'error', message: 'Add a short reflection (at least 10 characters) before completing this session.' });
      return;
    }
    const rawActualMinutes = String(missionActualMinutesById[mission.id] || '').trim();
    const actualMinutes = rawActualMinutes ? Number(rawActualMinutes) : null;
    if (rawActualMinutes && (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 480)) {
      setNotice({ type: 'error', message: 'Time spent must be a whole number between 1 and 480 minutes.' });
      return;
    }
    setMissionBusyId(mission.id);
    setNotice(null);
    try {
      const result = await requestJson(
        `/api/v1/learning-goals/${goal.id}/missions/${mission.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            evidence: {
              reflection,
              ...(actualMinutes === null ? {} : { actualMinutes }),
              completionCriteria: mission.completionCriteria || {},
              missionType: mission.missionType || 'LEARN',
            },
          }),
        },
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
      await Promise.all([refreshGamification(), refreshNextStep(goal.id), refreshMissionRecovery(goal.id)]);
      setNotice({ type: 'success', message: result.data.alreadyCompleted
        ? 'This mission was already completed.'
        : `Mission complete! You earned ${result.data.xpAwarded} XP. Checking the next learning days in the background…` });
      if (!result.data.alreadyCompleted) {
        void prepareNextChunkAfterCompletion(goal, mission, result.data.xpAwarded);
      }
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
      await Promise.all([refreshNextStep(goal.id), refreshRoadmaps(goal.id)]);
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
      setRecoveryByGoal({});
      setProjectMilestonesByGoal({});
      setMilestoneEvidenceById({});
      setMasterySummaryByGoal({});
      setAssessmentByTopic({});
      setAssessmentAnswers({});
      setAssessmentResultByTopic({});
      setGamification(null);
      setShowGoalForm(false);
      setAccountMode('login');
      setForm((current) => ({ ...initialForm, email: current.email, password: '' }));
      setNotice({ type: 'success', message: 'You have signed out.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  }

  const dashboardGoal = goals[0] || null;
  const dashboardRoadmap = dashboardGoal
    ? (roadmapsByGoal[dashboardGoal.id] || []).find((roadmap) => roadmap.generationState === 'ACTIVE')
    : null;

  if (window.location.pathname === '/assessment-test') {
    return <AssessmentTestPage user={user} goals={goals} roadmapsByGoal={roadmapsByGoal} apiStatus={apiStatus} />;
  }

  return (
    <main className="app-shell min-h-screen bg-[#fbf5eb] text-[#29263b]">
      {!user && <div className="landing-art-scene" aria-hidden="true">
        <div className="art-orbit art-orbit-one" />
        <div className="art-orbit art-orbit-two" />
        <div className="art-glass-sphere" />
        <div className="art-floating-cube"><span /><span /><span /><span /><span /><span /></div>
        <div className="art-learning-token"><Sparkles size={22} /><span>+XP</span></div>
        <div className="art-mini-path"><i /><i /><i /><b><Check size={12} /></b></div>
      </div>}
      <header className="app-header mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8" data-reveal="down">
        <a href="/" className="flex items-center gap-3" aria-label="Pathwise home">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#263f32] text-white"><Compass size={21} /></span>
          <span className="text-lg font-bold tracking-tight">pathwise<span className="text-[#73916f]">.</span></span>
        </a>
        <div className="flex items-center gap-2 rounded-full border border-[#e3e6dc] bg-white px-3 py-2 text-xs font-medium text-[#5b6658]">
          <span className={`h-2 w-2 rounded-full ${apiStatus === 'online' ? 'bg-emerald-500' : apiStatus === 'offline' ? 'bg-rose-500' : 'bg-amber-400'}`} />
          {apiStatus === 'online' ? 'Learning engine connected' : apiStatus === 'offline' ? 'API disconnected' : 'Connecting to learning engine'}
          {user && <><span className="mx-1 text-[#c5cabe]">·</span><span>{user.name || user.email}</span>{goals.length === 0 && <button type="button" onClick={handleLogout} className="ml-1 underline">Sign out</button>}</>}
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

      {(!user || goals.length === 0 || showGoalForm) && <section className={`hero-layout mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:gap-20 lg:pt-16 ${user ? "dashboard-goal-create" : ""}`} data-reveal="hero">
        <div className="hero-copy flex flex-col justify-center" data-reveal="left">
          <div className="hero-kicker mb-6 inline-flex w-fit items-center gap-2 px-1 py-1.5 text-xs font-semibold"><Sparkles size={14} /> YOUR NEXT LEVEL STARTS HERE.</div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-6xl xl:text-7xl">NEVER STOP<br /><span className="font-serif italic font-normal text-[#ff3300]">learning.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#6d756a] sm:text-lg">Every skill starts somewhere. Choose your next challenge, train in focused sessions, and turn the work you put in into progress you can actually see.</p>
          <div className="hero-stats mt-10 grid max-w-lg grid-cols-3 gap-3">
            <Stat icon={<Target size={17} />} title="Pick a quest" text="Make it yours" />
            <Stat icon={<Clock3 size={17} />} title="Earn XP" text="Every session counts" />
            <Stat icon={<Flame size={17} />} title="Level up" text="One win at a time" />
          </div>
          <div className="hero-footnote mt-12 hidden items-center gap-4 pt-6 sm:flex">
            <div className="flex -space-x-2"><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#d9e6d2] text-xs font-bold">ML</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#f0dfc4] text-xs font-bold">♪</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[#f7f7f2] bg-[#d7dfed] text-xs font-bold">JS</span></div>
            <p className="text-sm text-[#7b8277]">No streak shame. No perfect-student energy. Just your next small win.</p>
          </div>
        </div>

        <div className="goal-panel-wrap relative" data-reveal="right">
          <div className="absolute -right-4 -top-5 h-28 w-28 rounded-full bg-[#dfe9d5] blur-2xl" />
          <div className="goal-panel relative p-5 sm:p-8">
            <div className="mb-7 flex items-start justify-between goal-panel-heading">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#82917b]">{user ? 'YOUR NEXT CHAPTER STARTS HERE' : accountMode === 'login' ? 'WELCOME BACK' : 'YOUR FIRST QUEST STARTS HERE'}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{user ? 'Let’s build your learning plan' : accountMode === 'login' ? 'Sign in to Pathwise' : 'Create your free account'}</h2><p className="mt-2 text-sm leading-6 text-[#7c8378]">{user ? 'A few details help us make the next step clear and realistic.' : accountMode === 'login' ? 'Your saved goals and progress are waiting for you.' : 'Your progress belongs to you. Save it, return to it, and keep growing.'}</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf3e9] text-[#4c704b]"><GraduationCap size={22} /></span>
            </div>

            <form onSubmit={handleSubmit} className="goal-form space-y-5">
              {!user ? <>
                <div className="space-y-3 rounded-2xl bg-[#f7f8f4] p-4">
                  <div><p className="text-sm font-semibold text-[#424a40]">Your account</p><p className="mt-1 text-xs text-[#737b70]">{accountMode === 'register' ? 'Create an account to save your learning progress.' : 'Sign in to continue where you left off.'}</p></div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#e9ece4] p-1 text-sm">
                    <button type="button" onClick={() => { setAccountMode('register'); setNotice(null); }} className={`rounded-lg px-3 py-2.5 ${accountMode === 'register' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Create account</button>
                    <button type="button" onClick={() => { setAccountMode('login'); setNotice(null); }} className={`rounded-lg px-3 py-2.5 ${accountMode === 'login' ? 'bg-white font-semibold shadow-sm' : 'text-[#737b70]'}`}>Sign in</button>
                  </div>
                  {accountMode === 'register' && <Field label="Name (optional)"><input name="name" value={form.name} onChange={updateField} maxLength={80} autoComplete="name" placeholder="What should we call you?" className="field" /></Field>}
                  <Field label="Email"><input type="email" name="email" value={form.email} onChange={updateField} required autoComplete="email" maxLength={254} placeholder="you@example.com" className="field" /></Field>
                  <Field label="Password"><input type="password" name="password" value={form.password} onChange={updateField} required minLength={accountMode === 'register' ? 10 : 1} maxLength={128} autoComplete={accountMode === 'register' ? 'new-password' : 'current-password'} placeholder={accountMode === 'register' ? 'At least 10 characters' : 'Your password'} className="field" /></Field>
                </div>
              </> : <>
                <Field label="1. What do you want to learn?"><input name="skill" value={form.skill} onChange={updateField} required maxLength={160} placeholder="e.g. Machine learning, guitar, public speaking..." className="field" /></Field>
                <Field label="2. What is your current level?"><div className="grid grid-cols-3 gap-2">{[['beginner', 'New to it'], ['some', 'Know a little'], ['experienced', 'Experienced']].map(([value, label]) => <button key={value} type="button" onClick={() => setForm((current) => ({ ...current, experience: value }))} className={`rounded-xl border px-2 py-3 text-xs font-semibold transition sm:text-sm ${form.experience === value ? 'border-[#557b54] bg-[#edf3e9] text-[#355a39] ring-1 ring-[#557b54]' : 'border-[#e5e8df] text-[#737b70] hover:bg-[#fafbf8]'}`}>{form.experience === value && <Check size={13} className="mr-1 inline" />}{label}</button>)}</div></Field>
                <Field label="3. What would you like to be able to do?"><textarea name="outcome" value={form.outcome} onChange={updateField} required maxLength={1000} rows={3} placeholder="e.g. Build and deploy my first ML model..." className="field resize-none" /></Field>
                <div className="schedule-fields grid grid-cols-2 gap-4">
                  <Field label="4. Your daily time"><select name="minutesPerDay" value={form.minutesPerDay} onChange={updateField} className="field"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></Field>
                  <Field label="Your weekly rhythm"><select name="daysPerWeek" value={form.daysPerWeek} onChange={updateField} className="field">{[2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}</select></Field>
                  <Field label="5. In how many days do you want to achieve this goal?"><input name="targetDurationDays" type="number" min="1" max="365" step="1" required value={form.targetDurationDays} onChange={updateField} className="field" /><span className="block text-xs leading-5 text-[#737b70]">Set your target timeline. Pathwise will build a rolling 3-day plan and adapt it as you progress.</span></Field>
                </div>
              </>}
              <button type="submit" disabled={busy || apiStatus !== 'online'} className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#263f32] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#355640] focus:outline-none focus:ring-4 focus:ring-[#d8e5d3] disabled:cursor-not-allowed disabled:opacity-55">{busy ? (user ? 'Saving your goal…' : accountMode === 'login' ? 'Signing in…' : 'Creating account…') : user ? 'Save my learning goal' : accountMode === 'login' ? 'Sign in to Pathwise' : 'Create my account'} <ArrowRight size={17} className="transition group-hover:translate-x-1" /></button>
              {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{notice.message}</div>}
              <p className="text-center text-xs text-[#9aa095]">{user ? 'Your learning goals are saved to your account.' : 'Your account and learning progress are saved securely. Sign in on this device to continue later.'}</p>
            </form>
          </div>
        </div>
      </section>}

      {!user && <section className="landing-story" id="how-it-works">
        <div className="landing-story-inner">
          <div className="story-heading" data-reveal="up">
            <span className="story-eyebrow"><Sparkles size={14} /> A better way to make progress</span>
            <h2>MAKE EVERY<br /><span>SESSION COUNT.</span></h2>
            <p>A personal path. Real practice. Progress that keeps moving.</p>
          </div>
          <div className="story-grid">
            <article className="story-card story-card-plan" data-reveal="left">
              <span className="story-number">01 / YOUR PLAN</span>
              <div className="story-icon story-icon-green"><Compass size={22} /></div>
              <h3>A plan built around you</h3>
              <p>Start with your goal, experience, and schedule. Get a roadmap designed around what you want to be able to do.</p>
              <div className="plan-preview" aria-hidden="true"><span /><span /><span /><span /></div>
            </article>
            <article className="story-card story-card-practice" data-reveal="up">
              <span className="story-number">02 / YOUR PRACTICE</span>
              <div className="story-icon story-icon-blue"><Zap size={22} /></div>
              <h3>Train a little. Grow a lot.</h3>
              <p>Turn a big ambition into focused sessions that fit your week, with prerequisites keeping the order sensible.</p>
              <div className="practice-preview" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </article>
            <article className="story-card story-card-progress" data-reveal="right">
              <span className="story-number">03 / YOUR PROGRESS</span>
              <div className="story-icon story-icon-gold"><Trophy size={22} /></div>
              <h3>Every win moves you forward</h3>
              <p>Complete missions, check your understanding, and build a record of progress you can actually see.</p>
              <div className="progress-preview" aria-hidden="true"><span><b /></span><span><b /></span><span><b /></span></div>
            </article>
          </div>
          <div className="path-showcase" data-reveal="up">
            <div className="showcase-copy">
              <span className="story-eyebrow"><Map size={14} /> Your progress, made visible</span>
              <h2>One step at a time.<br /><em>One skill at a time.</em></h2>
              <p>Your learning path gives every session a purpose, from the first fundamentals to the outcome you came here for.</p>
              <button type="button" className="showcase-cta" onClick={() => { document.querySelector('.goal-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setAccountMode('register'); setNotice(null); }}>Build my learning path <ArrowRight size={17} /></button>
            </div>
            <div className="showcase-visual" aria-label="Illustration of a learning path with connected steps">
              <div className="showcase-glow" />
              <div className="showcase-orbit showcase-orbit-a" />
              <div className="showcase-orbit showcase-orbit-b" />
              <div className="showcase-path-line" />
              <div className="showcase-node node-one"><BookOpen size={19} /><span>Start here</span></div>
              <div className="showcase-node node-two"><Zap size={19} /><span>Practice</span></div>
              <div className="showcase-node node-three"><Target size={19} /><span>Build</span></div>
              <div className="showcase-node node-four"><Trophy size={19} /><span>Mastery</span></div>
              <div className="showcase-float-chip"><Flame size={15} /> Keep your streak</div>
              <div className="showcase-xp-chip"><Sparkles size={15} /> Progress, not perfection</div>
            </div>
          </div>
          <div className="landing-bottom-cta" data-reveal="up">
            <div><span>YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready to make a little progress?</h2><p>Create an account and give your next learning session a direction.</p></div>
            <button type="button" onClick={() => { document.querySelector('.goal-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setAccountMode('register'); setNotice(null); }}>Get started <ArrowRight size={17} /></button>
          </div>
        </div>
      </section>}

      {user && goals.length > 0 && <section className="dashboard-welcome" aria-labelledby="dashboard-welcome-title">
        <div className="dashboard-welcome-copy">
          <p className="dashboard-eyebrow"><Sparkles size={14} /> YOUR LEARNING SPACE</p>
          <h1 id="dashboard-welcome-title">Small steps.<br /><em>Serious progress.</em></h1>
          <p>Welcome back{user.name ? `, ${user.name.split(/\s+/)[0]}` : ''}. Keep your momentum going with one focused session.</p>
        </div>
        <div className="dashboard-next">
          <span className="dashboard-next-label"><span className="dashboard-live-dot" /> YOUR NEXT MOVE</span>
          <strong>{nextStepByGoal[dashboardGoal.id]?.title || dashboardRoadmap?.title || `Build your ${dashboardGoal.skill} path`}</strong>
          <p>{nextStepByGoal[dashboardGoal.id]?.reason || (dashboardRoadmap ? 'Your active roadmap is ready when you are.' : 'Turn your goal into a clear, achievable roadmap.')}</p>
          <button type="button" onClick={() => document.getElementById('learning-goals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {nextStepByGoal[dashboardGoal.id]?.action === 'CREATE_ROADMAP' || !dashboardRoadmap ? 'Set up your path' : 'Continue your path'} <ArrowRight size={16} />
          </button>
        </div>
        <div className="dashboard-spark dashboard-spark-one" aria-hidden="true">✳</div>
        <div className="dashboard-spark dashboard-spark-two" aria-hidden="true">✦</div>
      </section>}

      {user && goals.length > 0 && notice && <div role="status" aria-live="polite" className={`mx-auto mb-5 max-w-7xl px-5 sm:px-8`}><div className={`border px-4 py-3 text-sm leading-6 ${notice.type === 'success' ? 'border-[#3f5b46] bg-[#1a241d] text-[#c6e5c9]' : 'border-[#733b2c] bg-[#271915] text-[#ffc0ad]'}`}>{notice.message}</div></div>}

      {user && gamification && <section id="learning-stats" data-reveal="up" className="dashboard-section mx-auto max-w-7xl px-5 pb-6 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><Zap size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Level</span></div><p className="mt-2 text-2xl font-bold">{gamification.level.level}</p><p className="mt-1 text-xs text-[#737b70]">{gamification.level.currentLevelXp}/100 XP · {gamification.level.xpToNextLevel} to next level</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0e8]"><div className="h-full rounded-full bg-[#688663]" style={{ width: `${gamification.level.currentLevelXp}%` }} /></div></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#b66a35]"><Flame size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Current streak</span></div><p className="mt-2 text-2xl font-bold">{gamification.currentStreak} day{gamification.currentStreak === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-[#737b70]">Based on completed missions in your local timezone</p></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><Check size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Missions completed</span></div><p className="mt-2 text-2xl font-bold">{gamification.completedMissionCount}</p><p className="mt-1 text-xs text-[#737b70]">Verified completions across your learning goals</p></div>
          <div className="rounded-2xl border border-[#e3e6dc] bg-white p-4"><div className="flex items-center gap-2 text-[#688663]"><GraduationCap size={17} /><span className="text-xs font-semibold uppercase tracking-wide">Achievements</span></div><p className="mt-2 text-2xl font-bold">{gamification.achievements.length}<span className="ml-1 text-sm font-normal text-[#8b9287]">/ 5</span></p><p className="mt-1 text-xs text-[#737b70]">{gamification.achievements.length ? gamification.achievements.map((item) => item.title).join(' · ') : 'Complete missions to unlock your first badge.'}</p></div>
        </div>
      </section>}

      {user && goals.length > 0 && <section id="learning-goals" data-reveal="up" className="dashboard-section mx-auto max-w-7xl px-5 pb-12 sm:px-8">
<div className="goals-board rounded-3xl border border-[#e3e6dc] bg-white p-6">
<div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#688663]">YOUR WORKSPACE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Your learning path</h2><p className="mt-1 text-sm text-[#737b70]">Pick up where you left off, or plan your next step.</p></div><span className="rounded-full bg-[#edf3e9] px-3 py-1.5 text-xs font-semibold text-[#355a39]">{goals.length} goal{goals.length === 1 ? '' : 's'} saved</span></div>

<div className="mt-4 grid gap-3 sm:grid-cols-2">{goals.map((goal) => <article key={goal.id} className="goal-card rounded-2xl border border-[#e7e9e1] p-4">
<div className="flex flex-wrap items-start justify-between gap-3">
<div>
<p className="font-semibold">{goal.skill}</p>

<p className="mt-1 text-sm text-[#737b70]">{goal.outcome}</p>

<p className="mt-3 text-xs text-[#82917b]">{goal.minutesPerDay} min/day · {goal.daysPerWeek} days/week · {goal.targetDate ? `target ${String(goal.targetDate).slice(0, 10)}` : 'no deadline'} · {goal.status} · {missionsByGoal[goal.id]?.totalXp || 0} XP</p>
{nextStepByGoal[goal.id] && <div className="mt-3 border-l-2 border-[#688663] pl-3" aria-label={`Next step for ${goal.skill}`}><p className="text-[10px] font-bold uppercase tracking-wide text-[#688663]">Recommended next step</p><p className="mt-1 text-sm font-semibold text-[#29263b]">{nextStepByGoal[goal.id].title}</p><p className="mt-1 text-xs leading-5 text-[#737b70]">{nextStepByGoal[goal.id].reason}</p></div>}
{masterySummaryByGoal[goal.id] && <section className="mt-4 border border-[#343432] bg-[#191918] p-3" aria-label={`Mastery snapshot for ${goal.skill}`}>
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ff5933]">Mastery snapshot</p><span className="text-[11px] text-[#a3a39f]">{masterySummaryByGoal[goal.id].totalTopics} topics</span></div>
  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div><p className="text-xl font-semibold text-[#f2f2f0]">{masterySummaryByGoal[goal.id].masteredCount}</p><p className="text-[10px] uppercase tracking-wide text-[#a3a39f]">Mastered</p></div>
    <div><p className="text-xl font-semibold text-[#f2f2f0]">{masterySummaryByGoal[goal.id].needsPracticeCount}</p><p className="text-[10px] uppercase tracking-wide text-[#a3a39f]">Needs practice</p></div>
    <div><p className="text-xl font-semibold text-[#f2f2f0]">{masterySummaryByGoal[goal.id].dueReviewCount}</p><p className="text-[10px] uppercase tracking-wide text-[#a3a39f]">Reviews due</p></div>
    <div><p className="text-xl font-semibold text-[#f2f2f0]">{masterySummaryByGoal[goal.id].averageAssessmentScore === null ? '—' : `${masterySummaryByGoal[goal.id].averageAssessmentScore}%`}</p><p className="text-[10px] uppercase tracking-wide text-[#a3a39f]">Avg. assessment</p></div>
  </div>
  {masterySummaryByGoal[goal.id].topics.some((topic) => topic.reviewDue || topic.needsPractice) ? <ul className="mt-3 space-y-2 border-t border-[#343432] pt-3">{masterySummaryByGoal[goal.id].topics.filter((topic) => topic.reviewDue || topic.needsPractice).slice(0, 3).map((topic) => <li key={topic.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="min-w-0 flex-1 text-[#d1d1cd]">{topic.title}</span><span className={`shrink-0 ${topic.reviewDue ? 'text-[#ff9a7f]' : 'text-[#f0d58a]'}`}>{topic.reviewDue ? `Review due · ${topic.daysSinceActivity}d` : 'Practice recommended'}{topic.latestAssessmentScore === null ? '' : ` · ${Math.round(topic.latestAssessmentScore)}%`}</span></li>)}</ul> : <p className="mt-3 border-t border-[#343432] pt-3 text-xs text-[#a3a39f]">No review or practice gaps flagged right now.</p>}
  <p className="mt-3 text-[10px] leading-4 text-[#777773]">Completed work and demonstrated mastery are tracked separately. Review timing uses recent assessment evidence; a score drop of 10+ points shortens the interval. Rules remain initial defaults.</p>
</section>}

</div>
<div className="flex flex-wrap gap-2">
<button type="button" onClick={() => handleDeleteGoal(goal)} disabled={roadmapBusyGoal !== null || apiStatus !== 'online'} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{roadmapBusyGoal === goal.id ? 'Working…' : 'Delete goal'}</button>
<button type="button" onClick={() => handleGenerateRoadmap(goal)} disabled={roadmapBusyGoal !== null || apiStatus !== 'online'} className="rounded-xl bg-[#263f32] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{questionFormGoal === goal.id ? 'Questions open below' : 'Plan next learning chunk'}</button>
{(roadmapsByGoal[goal.id] || []).some((item) => item.generationState === 'ACTIVE') && <button type="button" onClick={() => handleGenerateMissions(goal)} disabled={missionBusyId !== null || apiStatus !== 'online'} className="rounded-xl border border-[#b9cbb2] px-3 py-2 text-xs font-semibold text-[#355a39] disabled:opacity-50">{missionBusyId === goal.id ? 'Scheduling…' : 'Plan this week'}</button>}
{masterySummaryByGoal[goal.id]?.needsPracticeCount > 0
  && (missionsByGoal[goal.id]?.missions || []).some((mission) => mission.status === 'SCHEDULED')
  && !(missionsByGoal[goal.id]?.missions || []).some((mission) => mission.status === 'IN_PROGRESS')
  && <button type="button" onClick={() => handleAdaptMissions(goal)} disabled={missionBusyId !== null || apiStatus !== 'online'} className="rounded-xl border border-[#ff9b7d] px-3 py-2 text-xs font-semibold text-[#a43d21] disabled:opacity-50">{missionBusyId === goal.id ? 'Adapting…' : 'Adapt this week'}</button>}
</div>

</div>
{questionFormGoal === goal.id && <div className="mt-4 rounded-2xl border border-[#dfe7d9] bg-[#fbfcf8] p-4">
<p className="font-semibold">Personalise your next learning chunk</p><p className="mt-1 text-xs leading-5 text-[#737b70]">Plan only a short period. The next chunk will adapt to your progress.</p>
<p className="mt-2 text-xs leading-5 text-[#737b70]">Pathwise generates the first 3 days, then keeps the next 1–2 days ready as you complete sessions. Your target timeline is saved with this goal.</p>
{(questionsByGoal[goal.id] || []).map((question) => <Field key={question.key} label={question.question}><p className="mt-1 text-xs text-[#737b70]">{question.reason}</p><select className="field mt-2" value={(answersByGoal[goal.id] || {})[question.key] || ""} onChange={(event) => setAnswersByGoal((current) => ({ ...current, [goal.id]: { ...(current[goal.id] || {}), [question.key]: event.target.value } }))}><option value="">Choose…</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>)}
<Field label="Anything else Pathwise should know?"><textarea className="field mt-2" rows={2} maxLength={1200} value={clarificationByGoal[goal.id] || ""} onChange={(event) => setClarificationByGoal((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder="Optional: paste a trusted tutorial or chord chart link, mention tools you have, or explain a constraint." /></Field>
<div className="mt-3 flex gap-2"><button type="button" onClick={() => handleGenerateChunk(goal)} disabled={roadmapBusyGoal !== null} className="rounded-xl bg-[#263f32] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{roadmapBusyGoal === goal.id ? "Generating chunk…" : "Generate this chunk"}</button><button type="button" onClick={() => setQuestionFormGoal(null)} className="rounded-xl border border-[#dfe7d9] px-4 py-2 text-xs font-semibold">Cancel</button></div></div>}
{(roadmapsByGoal[goal.id] || []).map((roadmap) => <div key={roadmap.id} className="roadmap-card mt-4 rounded-xl bg-[#f7f8f4] p-4">
<div className="flex flex-wrap items-start justify-between gap-2">
<div>
<p className="font-semibold">{roadmap.title}</p>

<p className="mt-1 text-xs text-[#737b70]">Chunk {roadmap.learningBrief?.chunkNumber || roadmap.version} · {roadmap.learningBrief?.planningDays || 7} calendar days · {roadmap.topics.length} study sessions · {roadmap.generationState.toLowerCase()} · {roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0)} min planned</p>

</div>{roadmap.generationState === 'DRAFT' && <div className="flex flex-wrap gap-2">
<button type="button" onClick={() => handleActivateRoadmap(goal, roadmap)} disabled={roadmapBusyGoal !== null || Boolean(roadmap.learningBrief && !learningBriefConfirmedByRoadmap[roadmap.id])} className="rounded-lg border border-[#b9cbb2] px-3 py-1.5 text-xs font-semibold text-[#355a39] disabled:opacity-50">Activate</button>
<button type="button" onClick={() => handleDeleteRoadmap(goal, roadmap)} disabled={roadmapBusyGoal !== null} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Delete</button>
</div>
}</div>

<p className="mt-2 text-sm text-[#737b70]">{roadmap.summary}</p>{roadmap.learningBrief?.chunkBudgetMinutes && <p className="mt-2 rounded-lg bg-[#edf3e9] p-2 text-xs text-[#355a39]">Workload cap: {roadmap.learningBrief.chunkBudgetMinutes} minutes across {roadmap.learningBrief.practiceDays ?? roadmap.learningBrief.planningDays} planned study days ({roadmap.learningBrief.plannedDailyMinutes ?? roadmap.learningBrief.dailyMinutes} minutes/day). Your availability is {roadmap.learningBrief.availableCapacityMinutes ?? roadmap.learningBrief.chunkBudgetMinutes} minutes total, with {roadmap.learningBrief.bufferMinutes ?? 0} minutes reserved as a buffer. This chunk contains {roadmap.topics.length} study sessions across a {roadmap.learningBrief.planningDays}-calendar-day window. Estimates are checked against the daily and total limits; future chunks adapt to progress.</p>}{roadmap.learningBrief?.deadlineFeasibility && <p className={`mt-2 rounded-lg border p-2 text-xs leading-5 ${['OVER_CAPACITY', 'DEADLINE_PASSED'].includes(roadmap.learningBrief.deadlineFeasibility.status) ? 'border-rose-200 bg-rose-50 text-rose-800' : roadmap.learningBrief.deadlineFeasibility.status === 'AT_RISK' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-[#dfe7d9] bg-white text-[#737b70]'}`}><strong>Deadline outlook: {roadmap.learningBrief.deadlineFeasibility.status.replaceAll('_', ' ').toLowerCase()}.</strong> {roadmap.learningBrief.deadlineFeasibility.estimatedRemainingMinutes !== null && roadmap.learningBrief.deadlineFeasibility.estimatedRemainingMinutes !== undefined ? `Estimated remaining effort: ${roadmap.learningBrief.deadlineFeasibility.estimatedRemainingMinutes} min (${roadmap.learningBrief.deadlineFeasibility.estimateConfidence} confidence); buffered capacity: ${roadmap.learningBrief.deadlineFeasibility.availableMinutes} min across ${roadmap.learningBrief.deadlineFeasibility.availableStudyDays} study days. ` : ''}{roadmap.learningBrief.deadlineFeasibility.recommendation}</p>}{roadmap.learningBrief?.timeCalibrationSampleCount >= 3 && roadmap.learningBrief?.medianActualToEstimatedRatio && <p className="mt-2 rounded-lg border border-[#dfe7d9] p-2 text-xs text-[#737b70]">Personalized timing: your last {roadmap.learningBrief.timeCalibrationSampleCount} timed sessions typically took {roadmap.learningBrief.medianActualToEstimatedRatio.toFixed(2)}× the estimated time. Pathwise uses this evidence when planning future chunks.</p>}

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
<span className="border border-[#41413d] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#a3a39f]">{topic.userProgress?.[0]?.status === 'MASTERED' ? 'Demonstrated understanding' : topic.userProgress?.[0]?.status === 'COMPLETED' ? 'Work completed' : topic.userProgress?.[0]?.status === 'IN_PROGRESS' ? 'In progress' : 'Not started'}</span>
{topic.assessment?.attempts?.[0] && <span className="text-[11px] text-[#a3a39f]">Latest check: {Math.round(topic.assessment.attempts[0].score)}%</span>}
<span className="text-[11px] text-[#82917b]">{topic.estimatedMinutes} min</span>
{roadmap.generationState === 'ACTIVE' && <button type="button" onClick={() => handleGenerateAssessment(goal, topic)} disabled={assessmentBusyId !== null} className="rounded-lg border border-[#41413d] px-3 py-1.5 text-xs font-semibold text-[#ff5933] disabled:opacity-50">{assessmentBusyId === topic.id ? 'Preparing…' : assessmentByTopic[topic.id] ? 'Reload assessment' : 'Take assessment'}</button>
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
{(recoveryByGoal[goal.id]?.missedCount || 0) > 0 && <section className="missed-session-recovery mt-4 border border-[#343432] bg-[#191918] p-4" aria-label={`Missed session recovery for ${goal.skill}`}>
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ff5933]">Recovery mode</p>
      <h3 className="mt-2 text-base font-semibold text-[#f2f2f0]">Missed session recovery</h3>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-[#a3a39f]">{recoveryByGoal[goal.id].missedCount} unfinished session{recoveryByGoal[goal.id].missedCount === 1 ? '' : 's'} from earlier dates. Rebuild the current week from remaining topic work without touching completed sessions or XP.</p>
    </div>
    <button type="button" onClick={() => handleRecoverMissedSessions(goal)} disabled={missionBusyId !== null || apiStatus !== 'online' || !recoveryByGoal[goal.id].canReplan} className="min-h-10 border border-[#ff3300] bg-[#ff3300] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{missionBusyId === goal.id ? 'Rebuilding plan…' : !recoveryByGoal[goal.id].canReplan ? 'Finish current session first' : recoveryByGoal[goal.id].hasCurrentPlan ? 'Rebuild this week' : 'Create recovery plan'}</button>
  </div>
  {!recoveryByGoal[goal.id].canReplan && <p className="mt-3 text-xs leading-5 text-[#f0d58a]">Your in progress session is protected. Complete it before rebuilding the rest of the week.</p>}
  <ul className="mt-3 space-y-2 border-t border-[#343432] pt-3">{recoveryByGoal[goal.id].missedMissions.slice(0, 3).map((mission) => <li key={mission.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="min-w-0 flex-1 text-[#d1d1cd]">{mission.topic?.title || 'Learning topic'} · {mission.title}</span><span className="shrink-0 text-[#777773]">{String(mission.scheduledDate).slice(0, 10)}</span></li>)}</ul>
  {recoveryByGoal[goal.id].missedCount > recoveryByGoal[goal.id].missedMissions.length && <p className="mt-2 text-[10px] text-[#777773]">Showing the latest {recoveryByGoal[goal.id].missedMissions.length} of {recoveryByGoal[goal.id].missedCount} missed sessions.</p>}
</section>}
{(roadmapsByGoal[goal.id] || []).some((item) => item.generationState === 'ACTIVE') && <section className="project-milestones mt-4 rounded-xl border border-[#343432] p-4" aria-label={`Project milestones for ${goal.skill}`}>
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ff5933]"><Target size={13} className="mr-1 inline" /> Build toward a real result</p>
      <h3 className="mt-2 text-lg font-semibold text-[#f2f2f0]">Project milestones</h3>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-[#a3a39f]">Turn your learning brief into a sequence of demonstrable outcomes. Each milestone saves evidence, not just a checkbox.</p>
    </div>
    {(projectMilestonesByGoal[goal.id]?.milestones || []).length === 0 && <button type="button" onClick={() => handleGenerateProjectMilestones(goal)} disabled={milestoneBusyGoal !== null || apiStatus !== 'online' || !projectMilestonesByGoal[goal.id]?.deliverable} className="min-h-10 border border-[#ff3300] bg-[#ff3300] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{milestoneBusyGoal === goal.id ? 'Creating plan…' : 'Create project plan'}</button>}
  </div>
  {projectMilestonesByGoal[goal.id]?.deliverable && <p className="mt-3 border-l-2 border-[#ff5933] pl-3 text-sm leading-6 text-[#d1d1cd]"><span className="font-semibold text-white">Final deliverable</span> · {projectMilestonesByGoal[goal.id].deliverable}</p>}
  {(projectMilestonesByGoal[goal.id]?.milestones || []).length === 0
    ? <p className="mt-3 text-xs leading-5 text-[#a3a39f]">{projectMilestonesByGoal[goal.id]?.deliverable ? 'Your project plan has not been created yet.' : 'A confirmed learning brief with a final deliverable is required before a project plan can be generated.'}</p>
    : <>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden bg-[#343432]"><div className="h-full bg-[#ff3300] transition-all" style={{ width: `${Math.round(projectMilestonesByGoal[goal.id].milestones.filter((item) => item.status === 'COMPLETED').length / projectMilestonesByGoal[goal.id].milestones.length * 100)}%` }} /></div>
        <span className="shrink-0 text-xs text-[#a3a39f]">{projectMilestonesByGoal[goal.id].milestones.filter((item) => item.status === 'COMPLETED').length} / {projectMilestonesByGoal[goal.id].milestones.length} done</span>
      </div>
      <ol className="mt-4 space-y-3">{projectMilestonesByGoal[goal.id].milestones.map((milestone, index) => {
        const completed = milestone.status === 'COMPLETED';
        const priorDone = projectMilestonesByGoal[goal.id].milestones.slice(0, index).every((item) => item.status === 'COMPLETED');
        const evidence = milestoneEvidenceById[milestone.id] ?? milestone.evidence ?? '';
        return <li key={milestone.id} className="border-t border-[#343432] pt-3">
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center border ${completed ? 'border-[#ff3300] bg-[#ff3300] text-white' : 'border-[#41413d] text-[#ff5933]'}`}>{completed ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-[#f2f2f0]">{milestone.title}</h4><span className="border border-[#41413d] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#a3a39f]">{milestone.status.replace('_', ' ').toLowerCase()}</span></div>
              <p className="mt-1 text-xs leading-5 text-[#a3a39f]">{milestone.description}</p>
              {Array.isArray(milestone.successCriteria) && milestone.successCriteria.length > 0 && <ul className="mt-2 space-y-1">{milestone.successCriteria.map((criterion, criterionIndex) => <li key={criterionIndex} className="flex items-start gap-2 text-xs leading-5 text-[#d1d1cd]"><span className="mt-1 text-[#ff5933]">•</span><span>{criterion}</span></li>)}</ul>}
              {completed ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#a3a39f]"><span className="font-semibold text-[#f2f2f0]">Evidence saved:</span> {milestone.evidence}</p> : <>
                <label className="mt-3 block"><span className="text-xs font-semibold text-[#d1d1cd]">Evidence / progress note</span><textarea value={evidence} onChange={(event) => setMilestoneEvidenceById((current) => ({ ...current, [milestone.id]: event.target.value }))} maxLength={4000} rows={2} placeholder="What did you build, test, or demonstrate? Add links or test results if useful." className="mt-2 w-full resize-y border border-[#41413d] bg-[#111110] p-3 text-sm leading-5 text-[#f2f2f0] placeholder:text-[#777773] focus:border-[#ff3300] focus:outline-none" /></label>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => handleUpdateProjectMilestone(goal, milestone, milestone.status)} disabled={milestoneBusyGoal !== null} className="min-h-9 border border-[#41413d] px-3 py-2 text-xs font-semibold text-[#d1d1cd] disabled:opacity-40">{milestoneBusyGoal === goal.id ? 'Saving…' : 'Save note'}</button>{milestone.status !== 'IN_PROGRESS' && <button type="button" onClick={() => handleUpdateProjectMilestone(goal, milestone, 'IN_PROGRESS')} disabled={milestoneBusyGoal !== null || !priorDone} className="min-h-9 border border-[#41413d] px-3 py-2 text-xs font-semibold text-[#d1d1cd] disabled:opacity-40">{milestoneBusyGoal === goal.id ? 'Saving…' : milestone.status === 'PLANNED' ? 'Start milestone' : 'Mark in progress'}</button>}<button type="button" onClick={() => handleUpdateProjectMilestone(goal, milestone, 'COMPLETED')} disabled={milestoneBusyGoal !== null || !priorDone || evidence.trim().length < 20} className="min-h-9 border border-[#ff3300] bg-[#ff3300] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{milestoneBusyGoal === goal.id ? 'Saving…' : 'Complete with evidence'}</button></div>
                {!priorDone && <p className="mt-2 text-[11px] text-[#777773]">Finish earlier milestones first to unlock this one.</p>}
              </>}
            </div>
          </div>
        </li>;
      })}</ol>
    </>}
</section>}
{(missionsByGoal[goal.id]?.missions || []).length > 0 && <div className="mt-4 rounded-xl border border-[#343432] p-4">
<div className="flex flex-wrap items-center justify-between gap-3">
<div>
<p className="font-semibold text-sm">This week’s missions</p>
<p className="mt-1 text-xs text-[#a3a39f]">Open a session, work through its objective, then record what you learned.</p>
</div>
<span className="text-xs text-[#a3a39f]">{missionsByGoal[goal.id].missions.filter((item) => item.status === 'COMPLETED').length}/{missionsByGoal[goal.id].missions.length} complete</span>
</div>
<div className="mt-3 space-y-2">{missionsByGoal[goal.id].missions.map((mission) => {
  const expanded = expandedMissionId === mission.id;
  const completed = mission.status === 'COMPLETED';
  const objectives = Array.isArray(mission.completionCriteria?.objectives) ? mission.completionCriteria.objectives : [];
  return <article key={mission.id} className="rounded border border-[#343432] bg-[#191918] p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#f2f2f0]">{mission.title}</p>
        <p className="mt-1 text-xs text-[#a3a39f]">{mission.topic?.title} · {mission.estimatedMinutes} min · {mission.scheduledDate.slice(0, 10)}</p>
        <p className="mt-1 text-xs leading-5 text-[#a3a39f]">{mission.description}</p>
      </div>
      <button type="button" onClick={() => setExpandedMissionId(expanded ? null : mission.id)} aria-expanded={expanded} className="shrink-0 border border-[#41413d] px-3 py-2 text-xs font-semibold text-[#ff5933] hover:border-[#ff3300]">
        {completed ? 'Review session' : expanded ? 'Close session' : 'Open session'}
      </button>
    </div>
    {expanded && <div className="mt-4 border-t border-[#343432] pt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff5933]">Session guide · {mission.missionType || 'LEARN'}</p>
      <h4 className="mt-2 text-sm font-semibold text-[#f2f2f0]">What you should accomplish</h4>
      <p className="mt-1 text-sm leading-6 text-[#a3a39f]">{mission.completionCriteria?.instruction || 'Work through the session, practise the topic, and check your result.'}</p>
      {objectives.length > 0 && <>
        <h4 className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#a3a39f]">Success checklist</h4>
        <ul className="mt-2 space-y-2">
          {objectives.map((objective, index) => <li key={index} className="flex items-start gap-2 text-sm leading-5 text-[#d1d1cd]">
            <span className="mt-1 inline-block h-3 w-3 shrink-0 border border-[#ff5933]" aria-hidden="true" />
            <span>{objective}</span>
          </li>)}
        </ul>
      </>}
      {!completed && <>
      <label className="mt-4 block">
        <span className="text-xs font-semibold text-[#d1d1cd]">Learning reflection (saved with your completion)</span>
        <textarea
          value={missionEvidenceById[mission.id] || ''}
          onChange={(event) => setMissionEvidenceById((current) => ({ ...current, [mission.id]: event.target.value }))}
          rows={3}
          maxLength={1000}
          placeholder="What did you practise, what result did you get, or what can you now explain?"
          className="mt-2 w-full resize-y border border-[#41413d] bg-[#111110] p-3 text-sm leading-5 text-[#f2f2f0] placeholder:text-[#777773] focus:border-[#ff3300] focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-[#777773]">Write at least 10 characters. This records your reflection; it is not an automatic mastery score.</span>
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-[#d1d1cd]">Time spent (optional)</span>
        <input
          type="number"
          min="1"
          max="480"
          step="1"
          inputMode="numeric"
          value={missionActualMinutesById[mission.id] || ''}
          onChange={(event) => setMissionActualMinutesById((current) => ({ ...current, [mission.id]: event.target.value }))}
          placeholder={String(mission.estimatedMinutes || '') + ' min estimated'}
          className="mt-2 w-full border border-[#41413d] bg-[#111110] p-3 text-sm text-[#f2f2f0] placeholder:text-[#777773] focus:border-[#ff3300] focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-[#777773]">Entering your actual time helps Pathwise improve estimates for future chunks.</span>
      </label>
      </>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {completed
          ? <p className="text-xs font-semibold text-emerald-300">Session completed · XP already recorded</p>
          : <p className="text-xs text-[#777773]">Completion and mastery are tracked separately.</p>}
        {!completed && <button type="button" onClick={() => handleCompleteMission(goal, mission)} disabled={missionBusyId !== null || String(missionEvidenceById[mission.id] || '').trim().length < 10} className="min-h-10 border border-[#ff3300] bg-[#ff3300] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {missionBusyId === mission.id ? 'Saving reflection…' : 'Complete session'}
        </button>}
      </div>
    </div>}
  </article>;
})}</div>
</div>}</article>
)}</div>

</div>
</section>}

      <footer className="app-footer border-t border-[#e6e8df] px-5 py-5 text-center text-xs text-[#969d91]" data-reveal="up"><span className="inline-flex items-center gap-2"><BookOpen size={13} /> Learn with intention. Grow at your pace.</span></footer>
    </main>
  );
}

function Field({ label, children }) {
  return <label className="block space-y-2"><span className="block text-sm font-semibold text-[#424a40]">{label}</span>{children}</label>;
}

function Stat({ icon, title, text }) {
  return <div className="hero-stat"><span className="hero-stat-icon">{icon}</span><div><p>{title}</p><p>{text}</p></div></div>;
}

export default App;