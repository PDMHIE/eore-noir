const WORDS_URL = "./words.json";
const DATE_OF_FIRST_WORD = "2026-03-10"; // YYYY-MM-DD
const TZ = "Europe/Dublin";

function getYyyyMmDdInTZ(date = new Date(), timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBetweenUTC(startYmd, endYmd) {
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / MS_PER_DAY);
}

function pushDataLayer(event, details = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...details });
}

function $(sel) {
  return document.querySelector(sel);
}

function setText(sel, value) {
  const el = $(sel);
  if (!el) return false;
  el.textContent = value ?? "";
  return true;
}

function setError(msg) {
  // try to show it in-page
  setText("#error", msg || "");
  // always log too
  if (msg) console.error(msg);
}

async function fetchWords() {
  const res = await fetch(WORDS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch ${WORDS_URL}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("words.json must be a non-empty array");
  }
  for (const [i, w] of data.entries()) {
    if (!w.word || !w.definition || !w.usage) {
      throw new Error(`Entry ${i} missing required fields (word, definition, usage)`);
    }
  }
  return data;
}

function computeMeta(wordsLength) {
  const todayYmd = getYyyyMmDdInTZ(new Date(), TZ);
  const dayIndex = Math.max(0, daysBetweenUTC(DATE_OF_FIRST_WORD, todayYmd));
  const selectedIndex = dayIndex % wordsLength;
  return { todayYmd, dayIndex, selectedIndex };
}

function render(entry, meta, currentIndex) {
  const ok =
    setText("#today", meta.todayYmd) &&
    setText("#index", `${currentIndex} (day ${meta.dayIndex})`) &&
    setText("#word", entry.word) &&
    setText("#pos", entry.partOfSpeech ? `(${entry.partOfSpeech})` : "") &&
    setText("#definition", entry.definition) &&
    setText("#usage", entry.usage);

  if (!ok) {
    // This is the root cause of your error: missing IDs in HTML.
    setError(
      "Page HTML is missing one or more required elements (today, index, word, pos, definition, usage, error)."
    );
  }
}

let words = [];
let meta = null;
let currentIndex = 0;

function showIndex(i) {
  currentIndex = (i + words.length) % words.length;
  render(words[currentIndex], meta, currentIndex);
}

async function shareCurrent() {
  const entry = words[currentIndex];
  const text = `Word of the Day (${meta.todayYmd}): ${entry.word}\nMeaning: ${entry.definition}\nUsage: ${entry.usage}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: "Word of the Day", text });
      pushDataLayer("wotd_share", { method: "native", word: entry.word });
      return;
    }
  } catch {
    // fallback
  }

  await navigator.clipboard.writeText(text);
  pushDataLayer("wotd_share", { method: "clipboard", word: entry.word });
  alert("Copied to clipboard");
}

function bindButtons() {
  const prev = $("#btnPrev");
  const next = $("#btnNext");
  const share = $("#btnShare");

  if (!prev || !next || !share) {
    setError("Page HTML is missing buttons (btnShare, btnPrev, btnNext).");
    return;
  }

  prev.addEventListener("click", () => showIndex(currentIndex - 1));
  next.addEventListener("click", () => showIndex(currentIndex + 1));
  share.addEventListener("click", shareCurrent);
}

(async function init() {
  try {
    words = await fetchWords();
    meta = computeMeta(words.length);

    showIndex(meta.selectedIndex);
    bindButtons();

    pushDataLayer("wotd_loaded", {
      date: meta.todayYmd,
      word: words[currentIndex].word,
      index: currentIndex,
    });

    setError("");
  } catch (err) {
    setError(String(err?.message || err));
    pushDataLayer("wotd_error", { message: String(err?.message || err) });
  }
})();
