(() => {
  const STORAGE_KEY = "routine-app-data-v1";
  const SETTINGS_KEY = "routine-app-settings-v1";
  const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
  const DEFAULT_MODEL = "gemini-3.5-flash-lite";

  const nameInput = document.getElementById("routine-name");
  const countInput = document.getElementById("routine-count");
  const dayChecks = document.querySelectorAll("#day-checks input[type=checkbox]");
  const addBtn = document.getElementById("add-btn");
  const listEl = document.getElementById("routine-list");
  const template = document.getElementById("routine-template");
  const prevWeekBtn = document.getElementById("prev-week");
  const nextWeekBtn = document.getElementById("next-week");
  const weekLabel = document.getElementById("week-label");

  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  const apiKeyInput = document.getElementById("api-key-input");
  const modelInput = document.getElementById("model-input");
  const settingsSaveBtn = document.getElementById("settings-save-btn");

  const stepDialog = document.getElementById("step-dialog");
  const stepDialogTitle = document.getElementById("step-dialog-title");
  const stepTextarea = document.getElementById("step-textarea");
  const aiGenerateBtn = document.getElementById("ai-generate-btn");
  const aiStatus = document.getElementById("ai-status");
  const stepSaveBtn = document.getElementById("step-save-btn");
  const stepCancelBtn = document.getElementById("step-cancel-btn");
  const stepClearBtn = document.getElementById("step-clear-btn");

  let weekOffset = 0;
  let editingRoutineId = null;
  const openDetail = {}; // routineId -> iso date currently expanded (transient)

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable (private mode, quota) - state stays in-memory only
    }
  }

  let data = (() => {
    const parsed = loadJSON(STORAGE_KEY, { routines: [], completions: {} });
    return {
      routines: Array.isArray(parsed.routines) ? parsed.routines : [],
      completions: parsed.completions && typeof parsed.completions === "object" ? parsed.completions : {},
    };
  })();

  let settings = (() => {
    const parsed = loadJSON(SETTINGS_KEY, {});
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL,
    };
  })();

  function saveData() {
    saveJSON(STORAGE_KEY, data);
  }

  function saveSettings() {
    saveJSON(SETTINGS_KEY, settings);
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function mondayOf(date) {
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7; // 0=Mon .. 6=Sun
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDates() {
    const base = mondayOf(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function formatWeekLabel(dates) {
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(dates[0])} - ${fmt(dates[6])}`;
  }

  // --- routine units: either AI/manual sub-steps (labeled) or a plain target count ---

  function getSubSteps(routine) {
    return Array.isArray(routine.subSteps) ? routine.subSteps : [];
  }

  function unitCountFor(routine) {
    const steps = getSubSteps(routine);
    return steps.length > 0 ? steps.length : routine.targetCount;
  }

  function getStateArray(routineId, iso, count) {
    const stored = data.completions[routineId] && data.completions[routineId][iso];
    let arr;
    if (Array.isArray(stored)) {
      arr = stored.slice(0, count).map(Boolean);
      while (arr.length < count) arr.push(false);
    } else if (typeof stored === "number") {
      arr = Array.from({ length: count }, (_, i) => i < stored);
    } else {
      arr = Array.from({ length: count }, () => false);
    }
    return arr;
  }

  function setStateArray(routineId, iso, arr) {
    if (!data.completions[routineId]) data.completions[routineId] = {};
    if (!arr.some(Boolean)) {
      delete data.completions[routineId][iso];
    } else {
      data.completions[routineId][iso] = arr;
    }
    saveData();
  }

  function toggleUnit(routineId, iso, index, count) {
    const arr = getStateArray(routineId, iso, count);
    arr[index] = !arr[index];
    setStateArray(routineId, iso, arr);
  }

  // --- CRUD ---

  function addRoutine() {
    const name = nameInput.value.trim();
    const targetCount = Math.max(1, Math.min(20, parseInt(countInput.value, 10) || 1));
    const days = Array.from(dayChecks)
      .filter((c) => c.checked)
      .map((c) => parseInt(c.value, 10));

    if (!name) {
      nameInput.focus();
      return;
    }
    if (days.length === 0) {
      alert("요일을 하나 이상 선택해주세요.");
      return;
    }

    data.routines.push({
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      targetCount,
      days,
      subSteps: [],
    });
    saveData();

    nameInput.value = "";
    countInput.value = "1";
    dayChecks.forEach((c) => (c.checked = false));

    render();
  }

  function deleteRoutine(id) {
    if (!confirm("이 루틴을 삭제할까요?")) return;
    data.routines = data.routines.filter((r) => r.id !== id);
    delete data.completions[id];
    delete openDetail[id];
    saveData();
    render();
  }

  // --- Gemini integration ---

  function buildStepPrompt(routineName) {
    return (
      `"${routineName}" 이라는 매일 루틴을 실행 가능한 하위 단계 3~6개로 세분화해줘. ` +
      `각 단계는 15자 이내의 간결한 한국어 명사형/동사형 문구로 작성해줘. ` +
      `다른 설명 없이 문자열 배열 JSON으로만 응답해줘. 예: ["단계1", "단계2"]`
    );
  }

  async function callGemini(prompt) {
    const apiKey = settings.apiKey.trim();
    if (!apiKey) {
      throw new Error("먼저 상단 설정에서 Gemini API 키를 입력해주세요.");
    }
    const model = settings.model.trim() || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      let message = `Gemini 요청 실패 (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error && errJson.error.message) {
          message = errJson.error.message;
        }
      } catch {
        // ignore parse failure, keep default message
      }
      throw new Error(message);
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini 응답에서 텍스트를 찾을 수 없습니다.");
    }
    return text;
  }

  function parseSteps(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
      }
    } catch {
      // fall through to line-based parsing
    }
    return text
      .split("\n")
      .map((line) => line.replace(/^[\s*\-\d.)\]]+/, "").trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  async function generateStepsWithAI() {
    const routine = data.routines.find((r) => r.id === editingRoutineId);
    if (!routine) return;

    aiGenerateBtn.disabled = true;
    aiStatus.textContent = "생성 중...";

    try {
      const steps = parseSteps(await callGemini(buildStepPrompt(routine.name)));
      if (steps.length === 0) {
        aiStatus.textContent = "생성된 단계가 없습니다. 다시 시도해주세요.";
      } else {
        stepTextarea.value = steps.join("\n");
        aiStatus.textContent = `${steps.length}개 단계 생성됨 (저장을 눌러야 반영됩니다)`;
      }
    } catch (err) {
      aiStatus.textContent = `오류: ${err.message}`;
    } finally {
      aiGenerateBtn.disabled = false;
    }
  }

  // --- step dialog ---

  function openStepDialog(routineId) {
    const routine = data.routines.find((r) => r.id === routineId);
    if (!routine) return;
    editingRoutineId = routineId;
    stepDialogTitle.textContent = `세부 단계 편집 - ${routine.name}`;
    stepTextarea.value = getSubSteps(routine).join("\n");
    aiStatus.textContent = "";
    stepDialog.showModal();
  }

  function closeStepDialog() {
    editingRoutineId = null;
    stepDialog.close();
  }

  function saveStepsFromDialog() {
    const routine = data.routines.find((r) => r.id === editingRoutineId);
    if (!routine) {
      closeStepDialog();
      return;
    }
    const steps = stepTextarea.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    routine.subSteps = steps;
    saveData();
    closeStepDialog();
    render();
  }

  function clearStepsFromDialog() {
    const routine = data.routines.find((r) => r.id === editingRoutineId);
    if (routine) {
      routine.subSteps = [];
      saveData();
    }
    closeStepDialog();
    render();
  }

  // --- rendering ---

  function renderDetailPanel(panelEl, routine, iso, dayIndex) {
    const steps = getSubSteps(routine);
    const count = steps.length;
    const arr = getStateArray(routine.id, iso, count);

    panelEl.innerHTML = "";
    panelEl.classList.remove("hidden");

    const title = document.createElement("div");
    title.className = "detail-panel-title";
    const dateText = document.createElement("span");
    dateText.textContent = `${DAY_LABELS[dayIndex]}요일 세부 단계`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "닫기 ✕";
    closeBtn.addEventListener("click", () => {
      openDetail[routine.id] = null;
      render();
    });
    title.appendChild(dateText);
    title.appendChild(closeBtn);
    panelEl.appendChild(title);

    steps.forEach((label, i) => {
      const row = document.createElement("label");
      row.className = "step-row" + (arr[i] ? " checked" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = arr[i];
      cb.addEventListener("change", () => {
        toggleUnit(routine.id, iso, i, count);
        render();
      });
      const span = document.createElement("span");
      span.textContent = label;
      row.appendChild(cb);
      row.appendChild(span);
      panelEl.appendChild(row);
    });
  }

  function renderRoutineCard(routine, weekDates, todayISO) {
    const node = template.content.cloneNode(true);
    node.querySelector(".routine-name").textContent = routine.name;
    node.querySelector(".delete-btn").addEventListener("click", () => deleteRoutine(routine.id));
    node.querySelector(".steps-btn").addEventListener("click", () => openStepDialog(routine.id));

    const grid = node.querySelector(".day-grid");
    const hasSteps = getSubSteps(routine).length > 0;
    const count = unitCountFor(routine);

    weekDates.forEach((date, idx) => {
      const iso = toISODate(date);
      const isActiveDay = routine.days.includes(idx);
      const cell = document.createElement("div");
      cell.className = "day-cell" + (isActiveDay ? "" : " inactive") + (iso === todayISO ? " today" : "");

      const label = document.createElement("div");
      label.className = "day-label";
      label.textContent = DAY_LABELS[idx];
      cell.appendChild(label);

      if (isActiveDay) {
        const arr = getStateArray(routine.id, iso, count);
        const done = arr.filter(Boolean).length;

        if (hasSteps) {
          const badge = document.createElement("button");
          badge.type = "button";
          badge.className = "badge-btn" + (done === count ? " complete" : "");
          badge.textContent = `${done}/${count}`;
          badge.addEventListener("click", () => {
            openDetail[routine.id] = openDetail[routine.id] === iso ? null : iso;
            render();
          });
          cell.appendChild(badge);
        } else {
          const tickRow = document.createElement("div");
          tickRow.className = "tick-row";
          for (let t = 1; t <= count; t++) {
            const tick = document.createElement("button");
            tick.type = "button";
            tick.className = "tick" + (t <= done ? " done" : "");
            tick.title = `${t}번째`;
            tick.addEventListener("click", () => {
              const current = getStateArray(routine.id, iso, count);
              const currentDone = current.filter(Boolean).length;
              const nextDone = t <= currentDone ? t - 1 : t;
              setStateArray(
                routine.id,
                iso,
                Array.from({ length: count }, (_, i) => i < nextDone)
              );
              render();
            });
            tickRow.appendChild(tick);
          }
          cell.appendChild(tickRow);

          const countLabel = document.createElement("div");
          countLabel.className = "count-label";
          countLabel.textContent = `${done}/${count}`;
          cell.appendChild(countLabel);
        }
      }

      grid.appendChild(cell);
    });

    const detailPanel = node.querySelector(".detail-panel");
    const activeIso = openDetail[routine.id];
    if (hasSteps && activeIso) {
      const idx = weekDates.findIndex((d) => toISODate(d) === activeIso);
      if (idx !== -1 && routine.days.includes(idx)) {
        renderDetailPanel(detailPanel, routine, activeIso, idx);
      } else {
        openDetail[routine.id] = null;
      }
    }

    return node;
  }

  function render() {
    const weekDates = getWeekDates();
    weekLabel.textContent = formatWeekLabel(weekDates);
    const todayISO = toISODate(new Date());

    listEl.innerHTML = "";
    if (data.routines.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "아직 등록된 루틴이 없어요. 위에서 루틴을 추가해보세요.";
      listEl.appendChild(empty);
      return;
    }

    data.routines.forEach((routine) => {
      listEl.appendChild(renderRoutineCard(routine, weekDates, todayISO));
    });
  }

  // --- settings panel wiring ---

  function refreshSettingsInputs() {
    apiKeyInput.value = settings.apiKey;
    modelInput.value = settings.model;
  }

  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    if (!settingsPanel.classList.contains("hidden")) refreshSettingsInputs();
  });

  settingsSaveBtn.addEventListener("click", () => {
    settings.apiKey = apiKeyInput.value.trim();
    settings.model = modelInput.value.trim() || DEFAULT_MODEL;
    saveSettings();
    settingsPanel.classList.add("hidden");
  });

  // --- step dialog wiring ---

  aiGenerateBtn.addEventListener("click", generateStepsWithAI);
  stepSaveBtn.addEventListener("click", saveStepsFromDialog);
  stepCancelBtn.addEventListener("click", closeStepDialog);
  stepClearBtn.addEventListener("click", clearStepsFromDialog);

  // --- main form / nav wiring ---

  addBtn.addEventListener("click", addRoutine);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addRoutine();
  });
  prevWeekBtn.addEventListener("click", () => {
    weekOffset -= 1;
    render();
  });
  nextWeekBtn.addEventListener("click", () => {
    weekOffset += 1;
    render();
  });

  refreshSettingsInputs();
  render();
})();
