/* Stay — a rep counter for the moment you want to quit.
   Everything lives in this browser. No account, no server, nothing sent. */

const KEY_EVENTS = "stay.events.v1";
const KEY_SESSION = "stay.session.v1";

const FIRST_BLOCK_MIN = 2;
const PAUSE_MS = 90000;

const $ = (id) => document.getElementById(id);
const now = () => Date.now();

/* ---------- storage ---------- */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, full disk — the app still works for this sitting */
  }
}

let events = load(KEY_EVENTS, []);
let session = load(KEY_SESSION, null);

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Entries written before ids existed still need to be editable.
if (events.some((e) => !e.id)) {
  for (const e of events) if (!e.id) e.id = uid();
  save(KEY_EVENTS, events);
}

function log(type, extra = {}) {
  events.push({ id: uid(), t: now(), type, ...extra });
  save(KEY_EVENTS, events);
}

function updateEvent(id, changes) {
  const e = events.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, changes);
  for (const k of ["task", "note", "feeling"]) if (!e[k]) delete e[k];
  save(KEY_EVENTS, events);
}

// A task name is one label the user typed, copied onto several entries.
// Correcting it should correct all of them, not leave the typo scattered.
function renameTask(from, to) {
  for (const e of events) {
    if (e.task !== from) continue;
    if (to) e.task = to;
    else delete e.task;
  }
  save(KEY_EVENTS, events);
}

function deleteEvent(id) {
  events = events.filter((e) => e.id !== id);
  save(KEY_EVENTS, events);
}

function setSession(s) {
  session = s;
  save(KEY_SESSION, s);
}

/* ---------- stats ---------- */

// Weeks start Monday, so a weekend slump doesn't get split across two weeks.
function weekKey(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const countOf = (type) => events.filter((e) => e.type === type).length;

function stats() {
  const stays = events.filter((e) => e.type === "stay");
  const perWeek = {};
  for (const e of stays) perWeek[weekKey(e.t)] = (perWeek[weekKey(e.t)] || 0) + 1;
  const thisWeek = perWeek[weekKey(now())] || 0;
  const best = Object.values(perWeek).reduce((a, b) => Math.max(a, b), 0);
  return { total: stays.length, thisWeek, best, starts: countOf("start") };
}

function bucketOf(t) {
  const h = new Date(t).getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late night";
}

/* ---------- screens ---------- */

const SCREENS = ["home", "naming", "running", "pause", "landed", "bailed", "log"];
let current = "home";

function show(name, push = true) {
  current = name;
  for (const id of SCREENS) $(id).classList.toggle("hidden", id !== name);
  window.scrollTo(0, 0);
  const state = { screen: name };
  if (push) history.pushState(state, "");
  else history.replaceState(state, "");
  if (name === "home") renderHome();
  if (name === "log") renderLog();
}

// Android's back button should move through the app, not straight out of it.
addEventListener("popstate", (e) => {
  const name = (e.state && e.state.screen) || "home";
  show(SCREENS.includes(name) ? name : "home", false);
});

/* ---------- home ---------- */

function renderHome() {
  const s = stats();
  $("heroCount").textContent = s.total;
  $("statWeek").textContent = s.thisWeek;
  $("statBest").textContent = s.best;
  $("statStarts").textContent = s.starts;
}

$("goStart").addEventListener("click", () => {
  $("task").value = "";
  renderRecent();
  validateTask();
  show("naming");
  setTimeout(() => $("task").focus(), 60);
});

$("goPull").addEventListener("click", () => openPause(null));
$("goLog").addEventListener("click", () => show("log"));

/* ---------- naming ---------- */

function renderRecent() {
  const seen = [];
  for (let i = events.length - 1; i >= 0 && seen.length < 4; i--) {
    const e = events[i];
    if (e.type === "start" && e.task && !seen.includes(e.task)) seen.push(e.task);
  }
  $("recent").innerHTML = "";
  for (const task of seen) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = task;
    b.addEventListener("click", () => {
      $("task").value = task;
      validateTask();
    });
    $("recent").append(b);
  }
}

function validateTask() {
  $("begin").disabled = $("task").value.trim().length < 2;
}

$("task").addEventListener("input", validateTask);
$("task").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("begin").disabled) $("begin").click();
});

$("nameBack").addEventListener("click", () => show("home"));

$("begin").addEventListener("click", () => {
  const task = $("task").value.trim().slice(0, 120);
  log("start", { task });
  setSession({ task, endAt: now() + FIRST_BLOCK_MIN * 60000, minutes: FIRST_BLOCK_MIN, landed: false });
  startRunning();
});

/* ---------- running ---------- */

let ticker = null;

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function startRunning() {
  $("runTask").textContent = session.task;
  $("runSub").textContent = session.minutes === FIRST_BLOCK_MIN
    ? "two minutes on the clock"
    : `${session.minutes} more minutes`;
  show("running");
  tickRun();
  clearInterval(ticker);
  ticker = setInterval(tickRun, 250);
}

function tickRun() {
  if (!session) return;
  const left = session.endAt - now();
  if (left <= 0) {
    clearInterval(ticker);
    land();
    return;
  }
  $("clock").textContent = fmt(left);
}

function land() {
  if (!session) return;
  if (!session.landed) {
    log("complete", { task: session.task, minutes: session.minutes });
    setSession({ ...session, landed: true });
    if (navigator.vibrate) navigator.vibrate(180);
  }
  $("landTask").textContent = session.task;
  show("landed");
}

$("pullDuring").addEventListener("click", () => openPause(session ? session.task : null));

$("finishNow").addEventListener("click", () => {
  clearInterval(ticker);
  openBail(session ? session.task : null);
});

/* ---------- landed ---------- */

$("more").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip || !session) return;
  const min = Number(chip.dataset.min);
  log("extend", { task: session.task, minutes: min });
  setSession({ ...session, endAt: now() + min * 60000, minutes: min, landed: false });
  startRunning();
});

$("doneHere").addEventListener("click", () => {
  setSession(null);
  show("home");
});

/* ---------- the pause ---------- */

let pauseTimer = null;
let pauseTask = null;

function openPause(task) {
  pauseTask = task;
  clearInterval(ticker);
  $("pauseTask").textContent = task || "whatever you were about to walk away from";
  $("backToIt").disabled = true;
  $("imOut").disabled = true;
  $("pauseNote").textContent = "Both buttons wake up when the timer ends.";

  const readyAt = now() + PAUSE_MS;
  clearInterval(pauseTimer);

  const tick = () => {
    const left = readyAt - now();
    $("pauseClock").textContent = fmt(left);
    if (left <= 0) {
      clearInterval(pauseTimer);
      $("backToIt").disabled = false;
      $("imOut").disabled = false;
      $("pauseNote").textContent = "Still your call. It always was.";
      if (navigator.vibrate) navigator.vibrate(120);
    }
  };
  tick();
  pauseTimer = setInterval(tick, 250);
  show("pause");
}

$("backToIt").addEventListener("click", () => {
  clearInterval(pauseTimer);
  log("stay", { task: pauseTask || undefined });
  if (session && !session.landed && session.endAt > now()) startRunning();
  else if (session && session.landed) land();
  else show("home");
});

$("imOut").addEventListener("click", () => {
  clearInterval(pauseTimer);
  openBail(pauseTask);
});

/* ---------- bailing ---------- */

let bailTask = null;
let feeling = null;

function openBail(task) {
  bailTask = task;
  feeling = null;
  $("note").value = "";
  for (const c of $("feelings").children) c.setAttribute("aria-pressed", "false");
  show("bailed");
}

$("feelings").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  feeling = chip.dataset.f;
  for (const c of $("feelings").children) c.setAttribute("aria-pressed", String(c === chip));
});

$("saveBail").addEventListener("click", () => {
  log("bail", {
    task: bailTask || undefined,
    feeling: feeling || undefined,
    note: $("note").value.trim().slice(0, 200) || undefined
  });
  setSession(null);
  show("home");
});

/* ---------- log ---------- */

let editingId = null;
let confirmingId = null;

function renderLog() {
  const s = stats();
  const bails = events.filter((e) => e.type === "bail");
  const finished = countOf("complete");

  $("logSummary").textContent =
    `${s.starts} start${s.starts === 1 ? "" : "s"} · ${finished} finished · ` +
    `${s.total} urge${s.total === 1 ? "" : "s"} resisted · ${bails.length} quit`;

  const buckets = { morning: 0, afternoon: 0, evening: 0, "late night": 0 };
  for (const b of bails) buckets[bucketOf(b.t)]++;
  const max = Math.max(1, ...Object.values(buckets));

  $("bars").innerHTML = "";
  for (const [name, n] of Object.entries(buckets)) {
    const row = document.createElement("div");
    row.className = "bar";
    const label = document.createElement("span");
    label.textContent = name;
    const track = document.createElement("u");
    track.style.width = `${Math.round((n / max) * 100)}%`;
    if (n === 0) track.style.opacity = "0.18";
    const count = document.createElement("em");
    count.textContent = n;
    row.append(label, track, count);
    $("bars").append(row);
  }

  const recent = events.slice().reverse();   // everything, newest first
  $("logEmpty").classList.toggle("hidden", recent.length > 0);
  $("entries").innerHTML = "";

  for (const e of recent) {
    $("entries").append(editingId === e.id ? editRow(e) : entryRow(e));
  }
}

function labelFor(e) {
  if (e.type === "stay") return ["Stayed", "stayed"];
  if (e.type === "bail") return ["Quit", "bailed"];
  if (e.type === "complete") return [`Finished ${e.minutes} min`, ""];
  if (e.type === "extend") return [`Kept going, +${e.minutes} min`, ""];
  return ["Started", ""];
}

function entryRow(e) {
  const li = document.createElement("li");

  const row = document.createElement("div");
  row.className = "entryrow";

  const main = document.createElement("div");
  main.className = "entrymain";

  const head = document.createElement("div");
  const [text, cls] = labelFor(e);
  const tag = document.createElement("span");
  tag.className = cls;
  tag.textContent = text;
  head.append(tag);
  if (e.task) head.append(document.createTextNode(` · ${e.task}`));
  main.append(head);

  const said = [e.feeling, e.note].filter(Boolean).join(" — ");
  if (said) {
    const s2 = document.createElement("span");
    s2.className = "said";
    s2.textContent = said;
    main.append(s2);
  }

  const when = document.createElement("span");
  when.className = "when";
  when.textContent = new Date(e.t).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
  });
  main.append(when);
  row.append(main);

  // Side buttons, stacked so a long task name keeps the width it needs.
  const side = document.createElement("div");
  side.className = "sidebtns";

  const edit = document.createElement("button");
  edit.className = "mini";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => {
    editingId = e.id;
    confirmingId = null;
    renderLog();
  });

  const del = document.createElement("button");
  del.className = "mini danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    confirmingId = e.id;
    editingId = null;
    renderLog();
  });

  side.append(edit, del);
  row.append(side);
  li.append(row);

  // The confirm needs more words than fit at the side, so it drops below.
  if (confirmingId === e.id) {
    const bar = document.createElement("div");
    bar.className = "rowbtns";

    const sure = document.createElement("button");
    sure.className = "mini danger";
    sure.textContent = "Delete for good";
    sure.addEventListener("click", () => {
      deleteEvent(e.id);
      confirmingId = null;
      renderLog();
    });

    const nope = document.createElement("button");
    nope.className = "mini";
    nope.textContent = "Keep it";
    nope.addEventListener("click", () => {
      confirmingId = null;
      renderLog();
    });

    bar.append(sure, nope);
    li.append(bar);
  }

  return li;
}

function editRow(e) {
  const li = document.createElement("li");

  const form = document.createElement("div");
  form.className = "editform";

  const taskLabel = document.createElement("label");
  taskLabel.textContent = "What it was";
  const task = document.createElement("input");
  task.type = "text";
  task.value = e.task || "";
  task.placeholder = "leave empty to clear it";
  form.append(taskLabel, task);

  let note = null;
  if (e.type === "bail") {
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note";
    note = document.createElement("input");
    note.type = "text";
    note.value = e.note || "";
    form.append(noteLabel, note);
  }

  const hint = document.createElement("p");
  hint.className = "note";
  hint.style.margin = "2px 0 0";
  hint.textContent = "Fixing the name fixes it on every entry that uses it.";
  form.append(hint);

  const btns = document.createElement("div");
  btns.className = "rowbtns";

  const save = document.createElement("button");
  save.className = "mini";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    const wanted = task.value.trim().slice(0, 120);
    if (note) updateEvent(e.id, { note: note.value.trim().slice(0, 200) });
    if (wanted !== (e.task || "")) renameTask(e.task, wanted);
    editingId = null;
    renderLog();
  });

  const cancel = document.createElement("button");
  cancel.className = "mini";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    editingId = null;
    renderLog();
  });

  btns.append(save, cancel);
  form.append(btns);
  li.append(form);

  task.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save.click(); });
  setTimeout(() => task.focus(), 40);
  return li;
}

$("logBack").addEventListener("click", () => show("home"));

/* ---------- waking up ---------- */

// Phones throttle timers in the background, so never trust the interval —
// every tick recomputes from a stored deadline.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (current === "running") tickRun();
});

function boot() {
  if (session && !session.landed && session.endAt > now()) {
    history.replaceState({ screen: "running" }, "");
    startRunning();
  } else if (session && session.endAt <= now()) {
    history.replaceState({ screen: "landed" }, "");
    land();
  } else {
    show("home", false);
  }
}

boot();

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
