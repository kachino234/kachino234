(() => {
  "use strict";

  const STORAGE_KEY = "routinery_routines_v1";

  /** @typedef {{id:string,name:string,sets:number,reps:number,rest:number}} Exercise */
  /** @typedef {{id:string,name:string,exercises:Exercise[]}} Routine */

  let routines = loadRoutines();
  let editingRoutineId = null;
  let editingExerciseId = null; // null = new exercise

  // Session state
  let session = null;
  /*
  session = {
    routine, flatSets: [{exerciseIndex, setIndex, exercise}], currentIndex,
    startTime, elapsedTimer, totalVolume, completedSets,
    resting: bool, restRemaining, restTimer, restTotal
  }
  */

  // ---------- Persistence ----------
  function loadRoutines() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveRoutines() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- View management ----------
  function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.back));
  });

  // ---------- Routines list ----------
  const routineListEl = document.getElementById("routineList");
  const emptyStateEl = document.getElementById("emptyState");

  function renderRoutineList() {
    routineListEl.innerHTML = "";
    emptyStateEl.classList.toggle("hidden", routines.length > 0);
    routines.forEach(r => {
      const card = document.createElement("div");
      card.className = "routine-card";
      const totalSets = r.exercises.reduce((s, e) => s + Number(e.sets), 0);
      card.innerHTML = `<h3>${escapeHtml(r.name || "Untitled routine")}</h3>
        <p>${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"} · ${totalSets} sets</p>`;
      card.addEventListener("click", () => openEditor(r.id));
      routineListEl.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  document.getElementById("addRoutineBtn").addEventListener("click", () => {
    const r = { id: uid(), name: "", exercises: [] };
    routines.push(r);
    saveRoutines();
    openEditor(r.id);
  });

  // ---------- Editor ----------
  const routineNameInput = document.getElementById("routineNameInput");
  const exerciseListEl = document.getElementById("exerciseList");

  function currentRoutine() {
    return routines.find(r => r.id === editingRoutineId);
  }

  function openEditor(routineId) {
    editingRoutineId = routineId;
    const r = currentRoutine();
    routineNameInput.value = r.name || "";
    renderExerciseList();
    showView("view-editor");
  }

  routineNameInput.addEventListener("input", () => {
    const r = currentRoutine();
    if (!r) return;
    r.name = routineNameInput.value;
    saveRoutines();
  });

  function renderExerciseList() {
    const r = currentRoutine();
    exerciseListEl.innerHTML = "";
    if (!r) return;
    r.exercises.forEach((ex, idx) => {
      const card = document.createElement("div");
      card.className = "exercise-card";
      card.innerHTML = `
        <div class="info">
          <h4>${escapeHtml(ex.name)}</h4>
          <p>${ex.sets} sets × ${ex.reps} reps · ${ex.rest}s rest</p>
        </div>
        <div class="actions">
          <button data-action="edit" title="Edit">✎</button>
          <button data-action="delete" title="Delete">✕</button>
        </div>`;
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openExerciseModal(ex.id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        r.exercises.splice(idx, 1);
        saveRoutines();
        renderExerciseList();
      });
      exerciseListEl.appendChild(card);
    });
  }

  document.getElementById("deleteRoutineBtn").addEventListener("click", () => {
    if (!editingRoutineId) return;
    if (!confirm("Delete this routine?")) return;
    routines = routines.filter(r => r.id !== editingRoutineId);
    saveRoutines();
    renderRoutineList();
    showView("view-routines");
  });

  document.getElementById("startRoutineBtn").addEventListener("click", () => {
    const r = currentRoutine();
    if (!r || r.exercises.length === 0) {
      alert("Add at least one exercise before starting.");
      return;
    }
    startSession(r);
  });

  // ---------- Exercise modal ----------
  const exerciseModal = document.getElementById("exerciseModal");
  const exNameInput = document.getElementById("exNameInput");
  const exSetsInput = document.getElementById("exSetsInput");
  const exRepsInput = document.getElementById("exRepsInput");
  const exRestInput = document.getElementById("exRestInput");

  document.getElementById("addExerciseBtn").addEventListener("click", () => openExerciseModal(null));

  function openExerciseModal(exerciseId) {
    editingExerciseId = exerciseId;
    const r = currentRoutine();
    if (exerciseId) {
      const ex = r.exercises.find(e => e.id === exerciseId);
      exNameInput.value = ex.name;
      exSetsInput.value = ex.sets;
      exRepsInput.value = ex.reps;
      exRestInput.value = ex.rest;
    } else {
      exNameInput.value = "";
      exSetsInput.value = 3;
      exRepsInput.value = 10;
      exRestInput.value = 60;
    }
    exerciseModal.classList.remove("hidden");
    exNameInput.focus();
  }

  document.getElementById("exCancelBtn").addEventListener("click", () => {
    exerciseModal.classList.add("hidden");
  });

  document.getElementById("exSaveBtn").addEventListener("click", () => {
    const name = exNameInput.value.trim();
    if (!name) { alert("Exercise name is required."); return; }
    const sets = Math.max(1, parseInt(exSetsInput.value, 10) || 1);
    const reps = Math.max(1, parseInt(exRepsInput.value, 10) || 1);
    const rest = Math.max(0, parseInt(exRestInput.value, 10) || 0);
    const r = currentRoutine();
    if (editingExerciseId) {
      const ex = r.exercises.find(e => e.id === editingExerciseId);
      Object.assign(ex, { name, sets, reps, rest });
    } else {
      r.exercises.push({ id: uid(), name, sets, reps, rest });
    }
    saveRoutines();
    renderExerciseList();
    exerciseModal.classList.add("hidden");
  });

  // ---------- Session runner ----------
  const sessionTimerEl = document.getElementById("sessionTimer");
  const sessionProgressEl = document.getElementById("sessionProgress");
  const sessionExerciseNameEl = document.getElementById("sessionExerciseName");
  const sessionSetInfoEl = document.getElementById("sessionSetInfo");
  const restOverlay = document.getElementById("restOverlay");
  const restCountdownEl = document.getElementById("restCountdown");
  const activeSetControls = document.getElementById("activeSetControls");
  const setWeightInput = document.getElementById("setWeightInput");
  const setRepsInput = document.getElementById("setRepsInput");

  function buildFlatSets(routine) {
    const flat = [];
    routine.exercises.forEach((ex, exIdx) => {
      for (let s = 0; s < ex.sets; s++) {
        flat.push({ exerciseIndex: exIdx, setNumber: s + 1, exercise: ex });
      }
    });
    return flat;
  }

  function startSession(routine) {
    session = {
      routine,
      flatSets: buildFlatSets(routine),
      currentIndex: 0,
      startTime: Date.now(),
      elapsedTimer: null,
      totalVolume: 0,
      completedSets: 0,
      resting: false,
      restRemaining: 0,
      restTimer: null,
    };
    showView("view-session");
    session.elapsedTimer = setInterval(updateElapsedTime, 1000);
    updateElapsedTime();
    renderCurrentSet();
  }

  function updateElapsedTime() {
    if (!session) return;
    const secs = Math.floor((Date.now() - session.startTime) / 1000);
    sessionTimerEl.textContent = formatTime(secs);
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function renderCurrentSet() {
    if (!session) return;
    const cur = session.flatSets[session.currentIndex];
    if (!cur) { finishSession(); return; }
    sessionProgressEl.textContent = `Set ${session.currentIndex + 1} of ${session.flatSets.length}`;
    sessionExerciseNameEl.textContent = cur.exercise.name;
    sessionSetInfoEl.textContent = `Set ${cur.setNumber} of ${cur.exercise.sets} · Target ${cur.exercise.reps} reps`;
    setWeightInput.value = "";
    setRepsInput.value = cur.exercise.reps;
    restOverlay.classList.add("hidden");
    activeSetControls.classList.remove("hidden");
  }

  document.getElementById("completeSetBtn").addEventListener("click", () => {
    if (!session) return;
    const cur = session.flatSets[session.currentIndex];
    const weight = parseFloat(setWeightInput.value) || 0;
    const reps = parseInt(setRepsInput.value, 10) || 0;
    session.totalVolume += weight * reps;
    session.completedSets += 1;

    const isLast = session.currentIndex === session.flatSets.length - 1;
    const restSeconds = cur.exercise.rest;
    session.currentIndex += 1;

    if (!isLast && restSeconds > 0) {
      startRest(restSeconds);
    } else {
      renderCurrentSet();
    }
  });

  document.getElementById("nextSetBtn").addEventListener("click", () => {
    if (!session) return;
    clearRest();
    session.currentIndex += 1;
    renderCurrentSet();
  });

  document.getElementById("prevSetBtn").addEventListener("click", () => {
    if (!session) return;
    clearRest();
    session.currentIndex = Math.max(0, session.currentIndex - 1);
    renderCurrentSet();
  });

  function startRest(seconds) {
    session.resting = true;
    session.restRemaining = seconds;
    session.restTotal = seconds;
    activeSetControls.classList.add("hidden");
    restOverlay.classList.remove("hidden");
    restCountdownEl.textContent = session.restRemaining;
    session.restTimer = setInterval(() => {
      session.restRemaining -= 1;
      if (session.restRemaining <= 0) {
        clearRest();
        renderCurrentSet();
      } else {
        restCountdownEl.textContent = session.restRemaining;
      }
    }, 1000);
  }

  function clearRest() {
    if (session && session.restTimer) {
      clearInterval(session.restTimer);
      session.restTimer = null;
    }
    if (session) session.resting = false;
  }

  document.getElementById("restPlus").addEventListener("click", () => {
    if (session && session.resting) {
      session.restRemaining += 15;
      restCountdownEl.textContent = session.restRemaining;
    }
  });
  document.getElementById("restMinus").addEventListener("click", () => {
    if (session && session.resting) {
      session.restRemaining = Math.max(1, session.restRemaining - 15);
      restCountdownEl.textContent = session.restRemaining;
    }
  });
  document.getElementById("skipRestBtn").addEventListener("click", () => {
    if (session) {
      clearRest();
      renderCurrentSet();
    }
  });

  document.getElementById("endSessionBtn").addEventListener("click", () => {
    if (confirm("End this workout?")) finishSession();
  });

  function finishSession() {
    if (!session) return;
    clearInterval(session.elapsedTimer);
    clearRest();
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
    document.getElementById("summaryDuration").textContent = `Duration: ${formatTime(elapsed)}`;
    document.getElementById("summaryVolume").textContent = `Total volume: ${session.totalVolume.toFixed(1)} kg`;
    document.getElementById("summarySets").textContent = `Sets completed: ${session.completedSets}`;
    session = null;
    showView("view-summary");
  }

  document.getElementById("summaryDoneBtn").addEventListener("click", () => {
    renderRoutineList();
    showView("view-routines");
  });

  // ---------- Init ----------
  renderRoutineList();
  showView("view-routines");
})();
