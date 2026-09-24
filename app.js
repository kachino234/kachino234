(() => {
  "use strict";

  const ICONS = ["☀️", "🌙", "💪", "🧘", "📚", "💧", "🪥", "☕", "🧴", "📝", "🏃", "🍳", "🧹", "💼", "🎯"];
  const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  /** @typedef {{id:string,name:string,type:'timer'|'checklist',duration:number,position:number}} Step */
  /** @typedef {{id:string,name:string,icon:string,position:number,steps:Step[]}} Routine */

  let routines = [];
  let editingRoutineId = null;
  let editingStepId = null; // null = new step
  let selectedStepType = "timer";
  let currentUser = null;

  let session = null;

  // ---------- Helpers ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
  function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.back));
  });

  // ---------- Auth ----------
  const SITE_URL = window.location.origin + window.location.pathname;
  const authEmailInput = document.getElementById("authEmailInput");
  const authPasswordInput = document.getElementById("authPasswordInput");
  const authStatus = document.getElementById("authStatus");
  const authTitle = document.getElementById("authTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authModeSegmented = document.getElementById("authModeSegmented");
  const signOutBtn = document.getElementById("signOutBtn");
  let authMode = "signin";

  function setAuthStatus(message, isError) {
    authStatus.textContent = message || "";
    authStatus.classList.toggle("error", !!isError);
  }

  authModeSegmented.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      authMode = btn.dataset.mode;
      authModeSegmented.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b === btn));
      authTitle.textContent = authMode === "signup" ? "Create account" : "Sign in";
      authSubmitBtn.textContent = authMode === "signup" ? "Sign Up" : "Sign In";
      setAuthStatus("", false);
    });
  });

  document.getElementById("googleAuthBtn").addEventListener("click", async () => {
    setAuthStatus("Redirecting to Google...", false);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: SITE_URL },
    });
    if (error) setAuthStatus(`Error: ${error.message}`, true);
  });

  authSubmitBtn.addEventListener("click", async () => {
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    if (!email || !password) { setAuthStatus("Enter both email and password.", true); return; }
    if (password.length < 6) { setAuthStatus("Password must be at least 6 characters.", true); return; }

    setAuthStatus(authMode === "signup" ? "Creating account..." : "Signing in...", false);

    if (authMode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: SITE_URL },
      });
      if (error) { setAuthStatus(`Error: ${error.message}`, true); return; }
      if (!data.session) {
        setAuthStatus("Account created. Check your email to confirm before signing in.", false);
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setAuthStatus(`Error: ${error.message}`, true); return; }
    }
  });

  signOutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
  });

  sb.auth.onAuthStateChange((_event, sess) => {
    currentUser = sess ? sess.user : null;
    signOutBtn.classList.toggle("hidden", !currentUser);
    if (currentUser) {
      loadRoutines().then(() => {
        renderRoutineList();
        showView("view-routines");
      });
    } else {
      routines = [];
      showView("view-auth");
    }
  });

  // ---------- Data layer (Supabase) ----------
  async function loadRoutines() {
    const { data: routineRows, error: rErr } = await sb
      .from("routines")
      .select("*")
      .order("position", { ascending: true });
    if (rErr) { alert("Failed to load routines: " + rErr.message); return; }

    const { data: stepRows, error: sErr } = await sb
      .from("steps")
      .select("*")
      .order("position", { ascending: true });
    if (sErr) { alert("Failed to load steps: " + sErr.message); return; }

    routines = routineRows.map(r => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      position: r.position,
      steps: stepRows
        .filter(s => s.routine_id === r.id)
        .map(s => ({ id: s.id, name: s.name, type: s.type, duration: s.duration, position: s.position })),
    }));
  }

  async function dbCreateRoutine() {
    const position = routines.length;
    const { data, error } = await sb
      .from("routines")
      .insert({ user_id: currentUser.id, name: "", icon: ICONS[0], position })
      .select()
      .single();
    if (error) { alert("Failed to create routine: " + error.message); return null; }
    return { id: data.id, name: data.name, icon: data.icon, position: data.position, steps: [] };
  }

  async function dbUpdateRoutine(id, patch) {
    const { error } = await sb.from("routines").update(patch).eq("id", id);
    if (error) alert("Failed to save routine: " + error.message);
  }

  async function dbDeleteRoutine(id) {
    const { error } = await sb.from("routines").delete().eq("id", id);
    if (error) alert("Failed to delete routine: " + error.message);
  }

  async function dbCreateStep(routineId, step) {
    const { data, error } = await sb
      .from("steps")
      .insert({
        routine_id: routineId,
        name: step.name,
        type: step.type,
        duration: step.duration,
        position: step.position,
      })
      .select()
      .single();
    if (error) { alert("Failed to add step: " + error.message); return null; }
    return { id: data.id, name: data.name, type: data.type, duration: data.duration, position: data.position };
  }

  async function dbUpdateStep(id, patch) {
    const { error } = await sb.from("steps").update(patch).eq("id", id);
    if (error) alert("Failed to save step: " + error.message);
  }

  async function dbDeleteStep(id) {
    const { error } = await sb.from("steps").delete().eq("id", id);
    if (error) alert("Failed to delete step: " + error.message);
  }

  async function dbSwapStepPositions(stepA, stepB) {
    const posA = stepA.position, posB = stepB.position;
    stepA.position = posB;
    stepB.position = posA;
    await Promise.all([
      dbUpdateStep(stepA.id, { position: posB }),
      dbUpdateStep(stepB.id, { position: posA }),
    ]);
  }

  // ---------- Routines list ----------
  const routineListEl = document.getElementById("routineList");
  const emptyStateEl = document.getElementById("emptyState");

  function totalDuration(routine) {
    return routine.steps.reduce((sum, s) => sum + (s.type === "timer" ? s.duration : 0), 0);
  }

  function renderRoutineList() {
    routineListEl.innerHTML = "";
    emptyStateEl.classList.toggle("hidden", routines.length > 0);
    routines.forEach(r => {
      const card = document.createElement("div");
      card.className = "routine-card";
      const mins = Math.round(totalDuration(r) / 60);
      const timeLabel = mins > 0 ? `${mins} min · ` : "";
      card.innerHTML = `<span class="emoji">${r.icon || "🎯"}</span>
        <div class="body">
          <h3>${escapeHtml(r.name || "Untitled routine")}</h3>
          <p>${timeLabel}${r.steps.length} step${r.steps.length === 1 ? "" : "s"}</p>
        </div>`;
      card.addEventListener("click", () => openEditor(r.id));
      routineListEl.appendChild(card);
    });
  }

  document.getElementById("addRoutineBtn").addEventListener("click", async () => {
    const r = await dbCreateRoutine();
    if (!r) return;
    routines.push(r);
    openEditor(r.id);
  });

  // ---------- Editor ----------
  const routineNameInput = document.getElementById("routineNameInput");
  const stepListEl = document.getElementById("stepList");
  const iconPickerEl = document.getElementById("iconPicker");
  const editorTotalTimeEl = document.getElementById("editorTotalTime");
  let nameSaveTimer = null;

  function currentRoutine() {
    return routines.find(r => r.id === editingRoutineId);
  }

  function renderIconPicker() {
    const r = currentRoutine();
    iconPickerEl.innerHTML = "";
    ICONS.forEach(icon => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = icon;
      btn.className = icon === (r && r.icon) ? "selected" : "";
      btn.addEventListener("click", () => {
        r.icon = icon;
        renderIconPicker();
        dbUpdateRoutine(r.id, { icon });
      });
      iconPickerEl.appendChild(btn);
    });
  }

  function openEditor(routineId) {
    editingRoutineId = routineId;
    const r = currentRoutine();
    routineNameInput.value = r.name || "";
    renderIconPicker();
    renderStepList();
    showView("view-editor");
  }

  routineNameInput.addEventListener("input", () => {
    const r = currentRoutine();
    if (!r) return;
    r.name = routineNameInput.value;
    clearTimeout(nameSaveTimer);
    nameSaveTimer = setTimeout(() => dbUpdateRoutine(r.id, { name: r.name }), 400);
  });

  function renderStepList() {
    const r = currentRoutine();
    stepListEl.innerHTML = "";
    if (!r) return;
    r.steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "step-card";
      const desc = step.type === "timer" ? formatTime(step.duration) : "Checklist step";
      card.innerHTML = `
        <span class="order">${idx + 1}</span>
        <div class="info">
          <h4>${escapeHtml(step.name)}</h4>
          <p>${desc}</p>
        </div>
        <div class="actions">
          <button data-action="up" title="Move up">↑</button>
          <button data-action="down" title="Move down">↓</button>
          <button data-action="edit" title="Edit">✎</button>
          <button data-action="delete" title="Delete">✕</button>
        </div>`;
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openStepModal(step.id));
      card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        r.steps.splice(idx, 1);
        renderStepList();
        await dbDeleteStep(step.id);
      });
      card.querySelector('[data-action="up"]').addEventListener("click", async () => {
        if (idx === 0) return;
        [r.steps[idx - 1], r.steps[idx]] = [r.steps[idx], r.steps[idx - 1]];
        renderStepList();
        await dbSwapStepPositions(r.steps[idx - 1], r.steps[idx]);
      });
      card.querySelector('[data-action="down"]').addEventListener("click", async () => {
        if (idx === r.steps.length - 1) return;
        [r.steps[idx + 1], r.steps[idx]] = [r.steps[idx], r.steps[idx + 1]];
        renderStepList();
        await dbSwapStepPositions(r.steps[idx], r.steps[idx + 1]);
      });
      stepListEl.appendChild(card);
    });
    const mins = Math.round(totalDuration(r) / 60);
    editorTotalTimeEl.textContent = r.steps.length
      ? `Total time: ${mins > 0 ? mins + " min" : "< 1 min"}`
      : "";
  }

  document.getElementById("deleteRoutineBtn").addEventListener("click", async () => {
    if (!editingRoutineId) return;
    if (!confirm("Delete this routine?")) return;
    const id = editingRoutineId;
    routines = routines.filter(r => r.id !== id);
    renderRoutineList();
    showView("view-routines");
    await dbDeleteRoutine(id);
  });

  document.getElementById("startRoutineBtn").addEventListener("click", () => {
    const r = currentRoutine();
    if (!r || r.steps.length === 0) {
      alert("Add at least one step before starting.");
      return;
    }
    startSession(r);
  });

  // ---------- Step modal ----------
  const stepModal = document.getElementById("stepModal");
  const stepNameInput = document.getElementById("stepNameInput");
  const stepMinInput = document.getElementById("stepMinInput");
  const stepSecInput = document.getElementById("stepSecInput");
  const stepDurationGroup = document.getElementById("stepDurationGroup");
  const stepTypeSegmented = document.getElementById("stepTypeSegmented");

  document.getElementById("addStepBtn").addEventListener("click", () => openStepModal(null));

  stepTypeSegmented.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedStepType = btn.dataset.type;
      stepTypeSegmented.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b === btn));
      stepDurationGroup.classList.toggle("hidden", selectedStepType === "checklist");
    });
  });

  function openStepModal(stepId) {
    editingStepId = stepId;
    const r = currentRoutine();
    if (stepId) {
      const step = r.steps.find(s => s.id === stepId);
      stepNameInput.value = step.name;
      selectedStepType = step.type;
      stepMinInput.value = Math.floor(step.duration / 60);
      stepSecInput.value = step.duration % 60;
    } else {
      stepNameInput.value = "";
      selectedStepType = "timer";
      stepMinInput.value = 1;
      stepSecInput.value = 0;
    }
    stepTypeSegmented.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.type === selectedStepType));
    stepDurationGroup.classList.toggle("hidden", selectedStepType === "checklist");
    stepModal.classList.remove("hidden");
    stepNameInput.focus();
  }

  document.getElementById("stepCancelBtn").addEventListener("click", () => {
    stepModal.classList.add("hidden");
  });

  document.getElementById("stepSaveBtn").addEventListener("click", async () => {
    const name = stepNameInput.value.trim();
    if (!name) { alert("Step name is required."); return; }
    const mins = Math.max(0, parseInt(stepMinInput.value, 10) || 0);
    const secs = Math.max(0, Math.min(59, parseInt(stepSecInput.value, 10) || 0));
    const duration = selectedStepType === "timer" ? Math.max(1, mins * 60 + secs) : 0;
    const r = currentRoutine();
    stepModal.classList.add("hidden");

    if (editingStepId) {
      const step = r.steps.find(s => s.id === editingStepId);
      Object.assign(step, { name, type: selectedStepType, duration });
      renderStepList();
      await dbUpdateStep(step.id, { name, type: selectedStepType, duration });
    } else {
      const position = r.steps.length;
      const newStep = await dbCreateStep(r.id, { name, type: selectedStepType, duration, position });
      if (newStep) {
        r.steps.push(newStep);
        renderStepList();
      }
    }
  });

  // ---------- Session runner ----------
  const sessionElapsedEl = document.getElementById("sessionElapsed");
  const sessionProgressEl = document.getElementById("sessionProgress");
  const sessionStepNameEl = document.getElementById("sessionStepName");
  const sessionStepIconEl = document.getElementById("sessionStepIcon");
  const stepCountdownEl = document.getElementById("stepCountdown");
  const ringFg = document.getElementById("ringFg");
  const checklistControls = document.getElementById("checklistControls");
  const pauseBtn = document.getElementById("pauseSessionBtn");

  ringFg.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

  function startSession(routine) {
    session = {
      routine,
      currentIndex: 0,
      startTime: Date.now(),
      elapsedTimer: null,
      stepTimer: null,
      stepRemaining: 0,
      stepDuration: 0,
      paused: false,
      completedSteps: 0,
    };
    showView("view-session");
    pauseBtn.textContent = "⏸";
    session.elapsedTimer = setInterval(updateElapsedTime, 1000);
    updateElapsedTime();
    renderCurrentStep();
  }

  function updateElapsedTime() {
    if (!session) return;
    sessionElapsedEl.textContent = formatTime((Date.now() - session.startTime) / 1000);
  }

  function updateRing() {
    if (session.stepDuration <= 0) {
      ringFg.style.strokeDashoffset = "0";
      return;
    }
    const frac = session.stepRemaining / session.stepDuration;
    ringFg.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - frac)}`;
  }

  function renderCurrentStep() {
    if (!session) return;
    clearStepTimer();
    const step = session.routine.steps[session.currentIndex];
    if (!step) { finishSession(); return; }

    sessionProgressEl.textContent = `Step ${session.currentIndex + 1} of ${session.routine.steps.length}`;
    sessionStepNameEl.textContent = step.name;
    sessionStepIconEl.textContent = session.routine.icon || "⏱";

    if (step.type === "checklist") {
      checklistControls.classList.remove("hidden");
      stepCountdownEl.textContent = "✓";
      ringFg.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
      pauseBtn.classList.add("hidden");
    } else {
      checklistControls.classList.add("hidden");
      pauseBtn.classList.remove("hidden");
      session.stepDuration = step.duration;
      session.stepRemaining = step.duration;
      stepCountdownEl.textContent = formatTime(session.stepRemaining);
      updateRing();
      session.stepTimer = setInterval(tickStep, 1000);
    }
  }

  function tickStep() {
    if (!session || session.paused) return;
    session.stepRemaining -= 1;
    stepCountdownEl.textContent = formatTime(session.stepRemaining);
    updateRing();
    if (session.stepRemaining <= 0) {
      advanceStep();
    }
  }

  function clearStepTimer() {
    if (session && session.stepTimer) {
      clearInterval(session.stepTimer);
      session.stepTimer = null;
    }
  }

  function advanceStep() {
    if (!session) return;
    session.completedSteps += 1;
    session.currentIndex += 1;
    renderCurrentStep();
  }

  document.getElementById("completeStepBtn").addEventListener("click", advanceStep);

  document.getElementById("skipStepBtn").addEventListener("click", () => {
    if (!session) return;
    session.currentIndex += 1;
    renderCurrentStep();
  });

  document.getElementById("prevStepBtn").addEventListener("click", () => {
    if (!session) return;
    session.currentIndex = Math.max(0, session.currentIndex - 1);
    renderCurrentStep();
  });

  pauseBtn.addEventListener("click", () => {
    if (!session) return;
    session.paused = !session.paused;
    pauseBtn.textContent = session.paused ? "▶" : "⏸";
  });

  document.getElementById("endSessionBtn").addEventListener("click", () => {
    if (confirm("End this routine?")) finishSession();
  });

  function finishSession() {
    if (!session) return;
    clearInterval(session.elapsedTimer);
    clearStepTimer();
    const elapsed = (Date.now() - session.startTime) / 1000;
    document.getElementById("summaryDuration").textContent = `Duration: ${formatTime(elapsed)}`;
    document.getElementById("summarySteps").textContent = `Steps completed: ${session.completedSteps} of ${session.routine.steps.length}`;
    session = null;
    showView("view-summary");
  }

  document.getElementById("summaryDoneBtn").addEventListener("click", () => {
    renderRoutineList();
    showView("view-routines");
  });

  // ---------- Init ----------
  showView("view-auth");
  sb.auth.getSession().then(({ data }) => {
    currentUser = data.session ? data.session.user : null;
    signOutBtn.classList.toggle("hidden", !currentUser);
    if (currentUser) {
      loadRoutines().then(() => {
        renderRoutineList();
        showView("view-routines");
      });
    }
  });
})();
