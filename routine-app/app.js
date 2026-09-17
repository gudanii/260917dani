(() => {
  const STORAGE_KEY = "routine-app-data-v1";
  const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

  const nameInput = document.getElementById("routine-name");
  const countInput = document.getElementById("routine-count");
  const dayChecks = document.querySelectorAll("#day-checks input[type=checkbox]");
  const addBtn = document.getElementById("add-btn");
  const listEl = document.getElementById("routine-list");
  const template = document.getElementById("routine-template");
  const prevWeekBtn = document.getElementById("prev-week");
  const nextWeekBtn = document.getElementById("next-week");
  const weekLabel = document.getElementById("week-label");

  let weekOffset = 0;

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { routines: [], completions: {} };
      const parsed = JSON.parse(raw);
      return {
        routines: Array.isArray(parsed.routines) ? parsed.routines : [],
        completions: parsed.completions && typeof parsed.completions === "object" ? parsed.completions : {},
      };
    } catch {
      return { routines: [], completions: {} };
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage unavailable (private mode, quota) - state stays in-memory only
    }
  }

  let data = loadData();

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
    const first = dates[0];
    const last = dates[6];
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(first)} - ${fmt(last)}`;
  }

  function getCount(routineId, iso) {
    const r = data.completions[routineId];
    if (!r) return 0;
    return r[iso] || 0;
  }

  function setCount(routineId, iso, value) {
    if (!data.completions[routineId]) data.completions[routineId] = {};
    if (value <= 0) {
      delete data.completions[routineId][iso];
    } else {
      data.completions[routineId][iso] = value;
    }
    saveData();
  }

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
    saveData();
    render();
  }

  function renderRoutineCard(routine, weekDates, todayISO) {
    const node = template.content.cloneNode(true);
    node.querySelector(".routine-name").textContent = routine.name;
    node.querySelector(".delete-btn").addEventListener("click", () => deleteRoutine(routine.id));

    const grid = node.querySelector(".day-grid");
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
        const done = getCount(routine.id, iso);
        const tickRow = document.createElement("div");
        tickRow.className = "tick-row";
        for (let t = 1; t <= routine.targetCount; t++) {
          const tick = document.createElement("button");
          tick.type = "button";
          tick.className = "tick" + (t <= done ? " done" : "");
          tick.title = `${t}번째`;
          tick.addEventListener("click", () => {
            const current = getCount(routine.id, iso);
            const next = t <= current ? t - 1 : t;
            setCount(routine.id, iso, next);
            render();
          });
          tickRow.appendChild(tick);
        }
        cell.appendChild(tickRow);

        const countLabel = document.createElement("div");
        countLabel.className = "count-label";
        countLabel.textContent = `${done}/${routine.targetCount}`;
        cell.appendChild(countLabel);
      }

      grid.appendChild(cell);
    });

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

  render();
})();
