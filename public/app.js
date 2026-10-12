"use strict";

const STEPS = [1, 2, 4, 7, 11, 16];   // délka úryvku v sekundách pro jednotlivé pokusy
const MAX_SECONDS = STEPS[STEPS.length - 1];
const SONGS_PER_DAY = 5;              // kolik písniček se hraje za den
const START_DATE = [2026, 10, 1];     // den #1 (rok, měsíc, den)
const MARKS = { skip: "⬛", wrong: "🟥", artist: "🟨", correct: "🟩", empty: "⬜" };

const MODES = {
  mix: { name: "Mix", songs: SONGS, decoys: DECOYS, storage: "hadacka:v3", share: "Hádačka" },
  rap: { name: "CZ rap", songs: RAP_SONGS, decoys: RAP_DECOYS, storage: "hadacka:rap:v1", share: "Hádačka CZ rap" },
};
const params = new URLSearchParams(location.search);
const modeId = MODES[params.get("mod")] ? params.get("mod") : "mix";
const MODE = MODES[modeId];

// odkaz na den v aktuálním režimu
function dayUrl(n) {
  const p = new URLSearchParams();
  if (modeId !== "mix") p.set("mod", modeId);
  if (n !== undefined) p.set("den", n);
  const q = p.toString();
  return q ? `?${q}` : "./";
}

const $ = (id) => document.getElementById(id);

// ---------- dny ----------

function dayNumberFor(date) {
  const start = Date.UTC(START_DATE[0], START_DATE[1] - 1, START_DATE[2]);
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((d - start) / 86400000) + 1;
}

function dateForDay(n) {
  return new Date(START_DATE[0], START_DATE[1] - 1, START_DATE[2] + n - 1);
}

const todayNum = Math.max(1, dayNumberFor(new Date()));
const requested = parseInt(params.get("den"), 10);
const dayNum = Number.isInteger(requested) && requested >= 1 && requested <= todayNum ? requested : todayNum;

// ---------- randomizer ----------
// Pořadí písniček je pro všechny hráče stejné (seed = režim + kolo), ale není vidět ze seznamu.
// Seznam se projde celý, pak se zamíchá znovu a jinak. V jednom dni ani ve dvou dnech po sobě
// není stejný interpret a písnička se nevrátí dřív, než zazní aspoň polovina ostatních.

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const rnd = mulberry32(hashSeed(seed));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSchedule(songs, days) {
  // písničky se stejným ID (kdyby byly v seznamu dvakrát) bereme jen jednou
  const unique = [...new Map(songs.map((s) => [s.id, s])).values()];
  const memory = Math.floor(unique.length / 2);
  const schedule = [];
  const recent = [];
  let pool = [];
  let cycle = 0;
  let prevDay = [];
  for (let d = 1; d <= days; d++) {
    const today = [];
    for (let slot = 0; slot < SONGS_PER_DAY; slot++) {
      // dalším zamícháním doplníme zásobník dřív, než dojde, aby bylo pořád z čeho vybírat
      if (pool.length < 20) pool.push(...shuffled(unique.filter((s) => !pool.includes(s)), `${modeId}:${cycle++}`));
      const usedArtist = (s) => today.some((t) => t.artist === s.artist);
      const rules = [
        (s) => !usedArtist(s) && !prevDay.some((t) => t.artist === s.artist) && !recent.includes(s.id),
        (s) => !usedArtist(s) && !recent.includes(s.id),
        (s) => !usedArtist(s),
        () => true,
      ];
      let i = -1;
      for (const ok of rules) if ((i = pool.findIndex(ok)) >= 0) break;
      const song = pool.splice(i, 1)[0];
      today.push(song);
      recent.push(song.id);
      if (recent.length > memory) recent.shift();
    }
    schedule.push(today);
    prevDay = today;
  }
  return schedule;
}

const schedule = buildSchedule(MODE.songs, todayNum);
const songsForDay = (n) => schedule[n - 1];
const daySongs = songsForDay(dayNum);

// ---------- uložený postup ----------

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(MODE.storage)) || { days: {} };
  } catch {
    return { days: {} };
  }
}

function saveStore() {
  try {
    localStorage.setItem(MODE.storage, JSON.stringify(store));
  } catch {}
}

const newRound = (song) => ({ songId: song.id, guesses: [], status: "playing" });
const store = loadStore();
// když se mezitím změnil seznam písniček, kola s jinou písničkou začnou znovu
const saved = store.days[dayNum];
const day = (store.days[dayNum] = {
  rounds: daySongs.map((s, i) => (saved?.rounds[i]?.songId === s.id ? saved.rounds[i] : newRound(s))),
});

const roundDone = (r) => r.status !== "playing";
const dayDone = (d) => d.rounds.every(roundDone);
const firstOpen = () => Math.max(0, day.rounds.findIndex((r) => !roundDone(r)));

let roundIdx = dayDone(day) ? 0 : firstOpen();
const round = () => day.rounds[roundIdx];
const answer = () => daySongs[roundIdx];
const unlockedSeconds = () => (roundDone(round()) ? MAX_SECONDS : STEPS[Math.min(round().guesses.length, STEPS.length - 1)]);

// ---------- hledání ----------

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const label = (s) => `${s.artist} – ${s.title}`;
const sameArtist = (a, b) => norm(a.artist) === norm(b.artist);
const sameSong = (a, b) => sameArtist(a, b) && norm(a.title) === norm(b.title);

const OPTIONS = [];
const seenOptions = new Set();
for (const s of [...MODE.songs, ...MODE.decoys]) {
  const key = norm(label(s));
  if (seenOptions.has(key)) continue;
  seenOptions.add(key);
  OPTIONS.push({ artist: s.artist, title: s.title, key });
}
OPTIONS.sort((a, b) => label(a).localeCompare(label(b), "cs"));

function search(query) {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  return OPTIONS.filter((o) => words.every((w) => o.key.includes(w))).slice(0, 8);
}

// ---------- Deezer ----------

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "dz_" + Math.floor(Math.random() * 1e9);
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[cb];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 10000);
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("network")); };
    script.src = `${url}${url.includes("?") ? "&" : "?"}output=jsonp&callback=${cb}`;
    document.body.appendChild(script);
  });
}

const tracks = {};   // id -> data z Deezeru (nebo Promise, dokud se načítá)
const audio = new Audio();
audio.preload = "auto";

function fetchTrack(song) {
  if (!tracks[song.id]) {
    tracks[song.id] = jsonp(`https://api.deezer.com/track/${song.id}`).then((t) => {
      if (t.error || !t.preview) throw new Error("no preview");
      return (tracks[song.id] = t);
    }).catch((e) => {
      delete tracks[song.id];
      throw e;
    });
  }
  return Promise.resolve(tracks[song.id]);
}

async function loadRound() {
  stop();
  const idx = roundIdx;
  $("btn-play").disabled = true;
  $("play-icon").textContent = "…";
  $("load-msg").textContent = "Načítám písničku…";
  $("bar-progress").style.width = "0";
  $("time-now").textContent = "0:00";
  try {
    const t = await fetchTrack(answer());
    if (idx !== roundIdx) return;
    audio.src = t.preview;
    $("btn-play").disabled = false;
    $("play-icon").textContent = "▶";
    $("load-msg").textContent = "";
    renderResult();
  } catch {
    if (idx !== roundIdx) return;
    $("play-icon").textContent = "✕";
    $("load-msg").textContent = "Písničku se nepodařilo načíst. Zkus obnovit stránku.";
  }
  // další písničku si načteme dopředu
  const next = daySongs[idx + 1];
  if (next) fetchTrack(next).catch(() => {});
}

// ---------- přehrávání ----------

let raf = 0;

function stop() {
  audio.pause();
  cancelAnimationFrame(raf);
  $("play-icon").textContent = $("btn-play").disabled ? $("play-icon").textContent : "▶";
}

function tick() {
  const limit = unlockedSeconds();
  const t = Math.min(audio.currentTime, limit);
  $("bar-progress").style.width = `${(t / MAX_SECONDS) * 100}%`;
  $("time-now").textContent = `0:${String(Math.floor(t)).padStart(2, "0")}`;
  if (audio.currentTime >= limit || audio.ended) {
    stop();
    return;
  }
  raf = requestAnimationFrame(tick);
}

function play() {
  if (!audio.paused) return stop();
  audio.currentTime = 0;
  audio.play().then(() => {
    $("play-icon").textContent = "■";
    raf = requestAnimationFrame(tick);
  }).catch(() => toast("Přehrávání se nepovedlo"));
}

// ---------- hra ----------

function addGuess(guess) {
  stop();
  const r = round();
  r.guesses.push(guess);
  if (guess.kind === "correct") r.status = "won";
  else if (r.guesses.length >= STEPS.length) r.status = "lost";
  saveStore();
  render();
}

function submitGuess(text) {
  const picked = OPTIONS.find((o) => norm(label(o)) === norm(text));
  if (!picked) return toast("Vyber písničku z nabídky");
  if (round().guesses.some((g) => g.text && norm(g.text) === norm(label(picked)))) return toast("Tohle už jsi zkoušel");
  const kind = sameSong(picked, answer()) ? "correct" : sameArtist(picked, answer()) ? "artist" : "wrong";
  addGuess({ kind, text: label(picked) });
  $("guess-input").value = "";
  hideSuggestions();
}

function goToRound(i) {
  if (i === roundIdx) return;
  roundIdx = i;
  $("guess-input").value = "";
  hideSuggestions();
  render();
  loadRound();
}

// ---------- vykreslení ----------

const squares = (r) => Array.from({ length: STEPS.length }, (_, i) => MARKS[r.guesses[i]?.kind || "empty"]).join("");
const roundMark = (r) => (r.status === "won" ? "🟩" : r.status === "lost" ? "🟥" : r.guesses.length ? "▶" : "");
const wins = (d) => d.rounds.filter((r) => r.status === "won").length;

function render() {
  document.querySelectorAll("#modes a").forEach((el) => el.classList.toggle("active", el.dataset.mode === modeId));
  const date = dateForDay(dayNum).toLocaleDateString("cs-CZ");
  $("day-label").textContent = `#${dayNum} · ${date}${dayNum === todayNum ? "" : " · archiv"}`;

  // přepínač kol
  const open = firstOpen();
  $("rounds").innerHTML = "";
  day.rounds.forEach((r, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span>${i + 1}.</span><span class="st">${roundMark(r)}</span>`;
    b.classList.toggle("active", i === roundIdx);
    b.disabled = !roundDone(r) && i !== open;
    b.addEventListener("click", () => goToRound(i));
    $("rounds").appendChild(b);
  });

  // pokusy
  const r = round();
  $("guesses").innerHTML = "";
  for (let i = 0; i < STEPS.length; i++) {
    const g = r.guesses[i];
    const li = document.createElement("li");
    if (g) {
      li.className = g.kind;
      li.innerHTML = `<span class="mark">${MARKS[g.kind]}</span><span></span>`;
      li.lastChild.textContent = g.kind === "skip" ? "Přeskočeno" : g.text;
    } else if (i === r.guesses.length && !roundDone(r)) {
      li.className = "current";
    }
    $("guesses").appendChild(li);
  }

  $("bar-unlocked").style.width = `${(unlockedSeconds() / MAX_SECONDS) * 100}%`;

  const n = r.guesses.length;
  $("btn-skip").textContent = n >= STEPS.length - 1 ? "Vzdát se" : `Přeskočit (+${STEPS[n + 1] - STEPS[n]} s)`;
  $("guess-form").hidden = roundDone(r);
  renderResult();
  renderSummary();
}

function renderResult() {
  const r = round();
  $("result").hidden = !roundDone(r);
  if (!roundDone(r)) return;

  const n = r.guesses.length;
  const t = tracks[answer().id];
  $("result-msg").textContent = r.status === "won"
    ? (n === 1 ? "Z první vteřiny! 🤯" : `Uhodnuto na ${n}. pokus! 🎉`)
    : "Tentokrát ne 😕";
  $("result-song").textContent = label(answer());
  $("result-link").href = t?.link || `https://www.deezer.com/track/${answer().id}`;
  $("cover").src = t?.album?.cover_medium || "";

  const next = day.rounds.findIndex((x, i) => i > roundIdx && !roundDone(x));
  const target = next >= 0 ? next : firstOpen();
  $("btn-next").hidden = dayDone(day);
  $("btn-next").onclick = () => goToRound(target);
}

function renderSummary() {
  const done = dayDone(day);
  $("summary").hidden = !done;
  if (!done) return;

  const w = wins(day);
  const emoji = w === SONGS_PER_DAY ? "🏆" : w >= 3 ? "🎉" : w >= 1 ? "🙂" : "😕";
  $("summary-score").textContent = `${w} z ${SONGS_PER_DAY} uhodnuto ${emoji}`;
  $("summary-list").innerHTML = "";
  day.rounds.forEach((r, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="sq">${squares(r)}</span><span class="name"></span>`;
    li.lastChild.textContent = label(daySongs[i]);
    $("summary-list").appendChild(li);
  });
  $("btn-prev-day").hidden = dayNum <= 1;
}

function shareText() {
  const url = new URL(dayUrl(dayNum), location.href).href;
  const lines = day.rounds.map((r) => (r.status === "won" ? "🔊" : "🔇") + squares(r));
  return `${MODE.share} #${dayNum} 🎵 ${wins(day)}/${SONGS_PER_DAY}\n${lines.join("\n")}\n${url}`;
}

async function share() {
  const text = shareText();
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ text }); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Zkopírováno do schránky");
  } catch {
    prompt("Zkopíruj si výsledek:", text);
  }
}

function updateCountdown() {
  if (dayNum !== todayNum) {
    $("next-in").innerHTML = `<a href="${dayUrl()}" style="color:inherit">Zpět na dnešní písničky →</a>`;
    return;
  }
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const hms = [s / 3600, (s % 3600) / 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, "0")).join(":");
  $("next-in").textContent = `Nové písničky za ${hms}`;
}

let toastTimer = 0;
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 1800);
}

// ---------- našeptávač ----------

let suggestions = [];
let active = -1;

function showSuggestions() {
  suggestions = search($("guess-input").value);
  active = -1;
  const ul = $("suggestions");
  ul.innerHTML = "";
  suggestions.forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = label(s);
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pick(i);
    });
    ul.appendChild(li);
  });
  ul.hidden = suggestions.length === 0;
}

function hideSuggestions() {
  $("suggestions").hidden = true;
  suggestions = [];
  active = -1;
}

function pick(i) {
  $("guess-input").value = label(suggestions[i]);
  hideSuggestions();
}

function highlight(i) {
  active = (i + suggestions.length) % suggestions.length;
  [...$("suggestions").children].forEach((li, j) => li.classList.toggle("active", j === active));
  $("suggestions").children[active]?.scrollIntoView({ block: "nearest" });
}

// ---------- archiv a statistiky ----------

function renderArchive() {
  const list = $("archive-list");
  list.innerHTML = "";
  for (let n = todayNum; n >= 1; n--) {
    const d = store.days[n];
    const started = d?.rounds.some((r) => r.guesses.length);
    const st = !started ? "" : dayDone(d) ? `${wins(d)}/${SONGS_PER_DAY}` : "▶";
    const a = document.createElement("a");
    a.href = n === todayNum ? dayUrl() : dayUrl(n);
    if (n === todayNum) a.className = "today";
    a.innerHTML = `<span>#${n}</span><span class="st">${st}</span>`;
    list.appendChild(a);
  }
}

function renderStats() {
  const allRounds = Object.values(store.days).flatMap((d) => d.rounds).filter(roundDone);
  const won = allRounds.filter((r) => r.status === "won");
  const dist = Array(STEPS.length).fill(0);
  won.forEach((r) => dist[r.guesses.length - 1]++);
  const daysDone = Object.values(store.days).filter(dayDone).length;

  // série = počet dní po sobě, kdy jsi dohrál všech 5 písniček
  const complete = (n) => store.days[n] && dayDone(store.days[n]);
  let current = 0;
  for (let n = complete(todayNum) ? todayNum : todayNum - 1; n >= 1 && complete(n); n--) current++;
  let best = 0, run = 0;
  for (let n = 1; n <= todayNum; n++) best = Math.max(best, (run = complete(n) ? run + 1 : 0));

  const pct = allRounds.length ? Math.round((won.length / allRounds.length) * 100) : 0;
  const lost = allRounds.length - won.length;
  const max = Math.max(1, lost, ...dist);
  $("stats").innerHTML = `
    <div class="stat-row">
      <div><b>${daysDone}</b><span>dohraných dní</span></div>
      <div><b>${pct}%</b><span>uhodnutých písniček</span></div>
      <div><b>${current}</b><span>série dní</span></div>
      <div><b>${best}</b><span>nejdelší série</span></div>
    </div>
    <p class="sub">Na kolikátý pokus jsi hádal (${allRounds.length} písniček):</p>
    <div class="dist">
      ${dist.map((c, i) => `<div><span>${i + 1}</span><i style="width:${(c / max) * 85}%">${c}</i></div>`).join("")}
      <div><span>✕</span><i style="width:${(lost / max) * 85}%">${lost}</i></div>
    </div>`;
}

// ---------- události ----------

$("btn-play").addEventListener("click", play);
$("btn-skip").addEventListener("click", () => addGuess({ kind: "skip" }));
$("guess-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (active >= 0) pick(active);
  else if (suggestions.length === 1) pick(0);
  submitGuess($("guess-input").value);
});
$("guess-input").addEventListener("input", showSuggestions);
$("guess-input").addEventListener("blur", hideSuggestions);
$("guess-input").addEventListener("keydown", (e) => {
  if (!suggestions.length) return;
  if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
  else if (e.key === "Escape") hideSuggestions();
});

$("btn-share").addEventListener("click", share);
$("btn-prev-day").addEventListener("click", () => (location.href = dayUrl(dayNum - 1)));
$("btn-help").addEventListener("click", () => $("dlg-help").showModal());
$("btn-archive").addEventListener("click", () => { renderArchive(); $("dlg-archive").showModal(); });
$("btn-stats").addEventListener("click", () => { renderStats(); $("dlg-stats").showModal(); });
document.querySelectorAll("dialog .close").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => e.target === d && d.close()));

// značky na liště
for (const s of STEPS.slice(0, -1)) {
  const m = document.createElement("span");
  m.style.left = `${(s / MAX_SECONDS) * 100}%`;
  $("bar-marks").appendChild(m);
}

render();
loadRound();
updateCountdown();
setInterval(updateCountdown, 1000);

try {
  if (!localStorage.getItem("hadacka:seen-help")) {
    $("dlg-help").showModal();
    localStorage.setItem("hadacka:seen-help", "1");
  }
} catch {}
