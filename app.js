/* UI + rendering for the CAC MoM analyzer. Analysis logic lives in analysis.js. */

const state = {
  earlyRaw: null, lateRaw: null,
  earlyRecs: null, lateRecs: null,
  result: null, showAllMovers: false, chart: null, scope: "all",
  moverSort: { key: "cac_delta", dir: "desc" }, moverQuery: "",
};

// Categories start blank so each user adds their own (no presets to clear out).
const STARTING_CATEGORY_ROWS = 3;

/* ---------- file handling ---------- */
function wireDrop(side) {
  const input = document.getElementById(`file-${side}`);
  const drop = document.getElementById(`drop-${side}`);
  const cue = document.getElementById(`cue-${side}`);
  const nameEl = document.getElementById(`name-${side}`);

  const handle = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const recs = window.CAC.normalize(res.data);
        if (side === "early") { state.earlyRaw = res.data; state.earlyRecs = recs; }
        else { state.lateRaw = res.data; state.lateRecs = recs; }
        cue.textContent = `${recs.length} campaigns`;
        nameEl.textContent = file.name;
        drop.classList.add("loaded");
        updateRunState();
      },
      error: () => { cue.textContent = "Couldn't read that file"; },
    });
  };

  input.addEventListener("change", (e) => handle(e.target.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("drag");
    handle(e.dataTransfer.files[0]);
  });
}
wireDrop("early"); wireDrop("late");

/* ---------- categories UI ---------- */
const catRows = document.getElementById("cat-rows");
function addCatRow(name = "", terms = "") {
  const row = document.createElement("div");
  row.className = "cat-row";
  row.innerHTML = `
    <input type="text" class="cat-name" placeholder="Category" value="${escapeAttr(name)}">
    <input type="text" class="cat-terms" placeholder="terms, comma, separated" value="${escapeAttr(terms)}">
    <button class="cat-del" title="Remove">×</button>`;
  row.querySelector(".cat-del").addEventListener("click", () => row.remove());
  catRows.appendChild(row);
}
for (let i = 0; i < STARTING_CATEGORY_ROWS; i++) addCatRow();
document.getElementById("add-cat").addEventListener("click", () => addCatRow());

document.getElementById("skip-cats").addEventListener("change", (e) => {
  document.getElementById("cat-body").style.display = e.target.checked ? "none" : "";
});

function readCategories() {
  if (document.getElementById("skip-cats").checked) return {};
  const cats = {};
  catRows.querySelectorAll(".cat-row").forEach((row) => {
    const name = row.querySelector(".cat-name").value.trim();
    const terms = row.querySelector(".cat-terms").value.split(",").map((t) => t.trim()).filter(Boolean);
    if (name && terms.length) cats[name] = terms;
  });
  return cats;
}

/* ---------- run ---------- */
function updateRunState() {
  const ready = state.earlyRecs && state.lateRecs;
  const btn = document.getElementById("run");
  btn.disabled = !ready;
  document.getElementById("run-hint").textContent = ready ? "Ready" : "Load both files to continue";
}

document.getElementById("run").addEventListener("click", () => {
  const labels = {
    early: document.getElementById("label-early").value.trim() || "Earlier",
    late: document.getElementById("label-late").value.trim() || "Later",
  };
  state.result = window.CAC.analyze(state.earlyRecs, state.lateRecs, readCategories(), labels);
  state.scope = "all";
  state.moverSort = { key: "cac_delta", dir: "desc" };
  state.moverQuery = "";
  const ms = document.getElementById("movers-search"); if (ms) ms.value = "";
  document.querySelectorAll(".scope-opt").forEach((b) => b.classList.toggle("active", b.dataset.scope === "all"));
  saveSession();
  render();
  document.getElementById("results").hidden = false;
  if (!state.restoring) document.getElementById("results").scrollIntoView({ behavior: "smooth" });
});

/* ---------- session persistence (survives page navigation within the tab) ---------- */
const MOM_KEY = "cacMomState_v1";
function saveSession() {
  try {
    const cats = [];
    catRows.querySelectorAll(".cat-row").forEach((row) => {
      cats.push({ name: row.querySelector(".cat-name").value, terms: row.querySelector(".cat-terms").value });
    });
    sessionStorage.setItem(MOM_KEY, JSON.stringify({
      earlyRecs: state.earlyRecs, lateRecs: state.lateRecs,
      labels: {
        early: document.getElementById("label-early").value,
        late: document.getElementById("label-late").value,
      },
      names: {
        early: document.getElementById("name-early").textContent,
        late: document.getElementById("name-late").textContent,
      },
      cats, skip: document.getElementById("skip-cats").checked,
    }));
  } catch (e) { /* storage unavailable: silently skip */ }
}

function restoreSession() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(MOM_KEY)); } catch (e) { return; }
  if (!saved || !saved.earlyRecs || !saved.lateRecs) return;

  state.earlyRecs = saved.earlyRecs; state.lateRecs = saved.lateRecs;
  document.getElementById("label-early").value = saved.labels.early || "";
  document.getElementById("label-late").value = saved.labels.late || "";

  // restore file "loaded" cues
  const setLoaded = (side, name, recs) => {
    document.getElementById(`cue-${side}`).textContent = `${recs.length} campaigns`;
    document.getElementById(`name-${side}`).textContent = name || "";
    document.getElementById(`drop-${side}`).classList.add("loaded");
  };
  setLoaded("early", saved.names && saved.names.early, saved.earlyRecs);
  setLoaded("late", saved.names && saved.names.late, saved.lateRecs);

  // restore categories
  if (saved.cats && saved.cats.length) {
    catRows.innerHTML = "";
    saved.cats.forEach((c) => addCatRow(c.name, c.terms));
  }
  if (saved.skip) {
    document.getElementById("skip-cats").checked = true;
    document.getElementById("cat-body").style.display = "none";
  }

  updateRunState();
  // re-run the analysis silently (no scroll) so it's on screen after navigating back
  state.restoring = true;
  document.getElementById("run").click();
  state.restoring = false;
}

function resetAll() {
  try { sessionStorage.removeItem(MOM_KEY); } catch (e) {}
  state.earlyRaw = state.lateRaw = state.earlyRecs = state.lateRecs = state.result = null;
  ["early", "late"].forEach((side) => {
    document.getElementById(`file-${side}`).value = "";
    document.getElementById(`cue-${side}`).textContent = "Click or drop a CSV";
    document.getElementById(`name-${side}`).textContent = "";
    document.getElementById(`drop-${side}`).classList.remove("loaded");
  });
  document.getElementById("label-early").value = "";
  document.getElementById("label-late").value = "";
  catRows.innerHTML = "";
  for (let i = 0; i < STARTING_CATEGORY_ROWS; i++) addCatRow();
  document.getElementById("skip-cats").checked = false;
  document.getElementById("cat-body").style.display = "";
  document.getElementById("results").hidden = true;
  updateRunState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
const resetBtn = document.getElementById("reset");
if (resetBtn) resetBtn.addEventListener("click", resetAll);

/* ---------- formatting helpers ---------- */
const money = (n) => n === null ? "n/a" : (Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + n.toFixed(0));
const moneyFull = (n) => n === null ? "n/a" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const cac = (n) => n === null ? "n/a" : "$" + n.toFixed(2);
const pct = (n) => n === null ? "n/a" : n.toFixed(1) + "%";
const num = (n) => n === null ? "n/a" : Math.round(n).toLocaleString("en-US");
const roasFmt = (n) => n === null ? "n/a" : n.toFixed(2) + "x";

// direction: which way is "good" for a metric
const GOOD_DOWN = new Set(["cac"]);
function deltaClass(metric, d) {
  if (d.abs === null || d.abs === 0) return "flat";
  const rising = d.abs > 0;
  if (metric === "spend") return "flat";
  if (GOOD_DOWN.has(metric)) return rising ? "down" : "up";
  return rising ? "up" : "down";
}
function deltaText(metric, d) {
  if (d.abs === null) return "—";
  const sign = d.abs > 0 ? "+" : "";
  const base = metric === "cac" ? `${sign}$${d.abs.toFixed(2)}`
    : metric === "ntb_pct" ? `${sign}${d.abs.toFixed(1)}pt`
    : (metric === "roas" || metric === "ntb_roas") ? `${sign}${d.abs.toFixed(2)}x`
    : metric === "ntb_purchases" ? `${sign}${num(d.abs)}`
    : `${sign}${money(d.abs)}`;
  return d.pct !== null ? `${base} · ${sign}${d.pct}%` : base;
}
function escapeAttr(s){return String(s).replace(/"/g,"&quot;");}
function escapeHtml(s){return String(s).replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}

/* ---------- render ---------- */
function render() {
  const r = state.result;
  document.getElementById("period-name").textContent = `${r.labels.early} → ${r.labels.late}`;
  document.getElementById("count-ppc").textContent = r.counts.ppc.late;
  document.getElementById("count-dsp").textContent = r.counts.dsp.late;
  const co = document.getElementById("count-other"); if (co) co.textContent = r.counts.other.late;
  renderScope(r); renderCategories(r); renderMovers(r); renderRecs(r);
}

// cards + summary for the currently selected channel scope
function renderScope(r) {
  const scope = state.scope || "all";
  const s = r.scopes[scope];
  renderCards(r, s, scope);
  renderSummary(r, s);
}

const SCOPE_NAME = { all: "All channels", ppc: "PPC only", dsp: "DSP only", other: "Others" };

function renderCards(r, s, scope) {
  const o = s.overall, n = s.nb;
  const cacLabel = scope === "dsp" ? "DSP CAC" : scope === "ppc" ? "PPC CAC" : scope === "other" ? "Others CAC" : "Overall CAC";
  // second card: NB CAC for All/PPC; for DSP/Other show campaign count (NB is usually n/a there)
  let secondCard;
  if (scope === "dsp" || scope === "other") {
    const key = scope;
    const label = scope === "dsp" ? "DSP campaigns" : "Other campaigns";
    secondCard = { label, val: String(r.counts[key].late), flow: `${r.counts[key].early} →`, m: "count", d: { abs: r.counts[key].late - r.counts[key].early, pct: null } };
  } else {
    secondCard = { label: "NB CAC", val: cac(n.late.cac), flow: `${cac(n.early.cac)} →`, m: "cac", d: n.delta.cac };
  }
  const cards = [
    { label: cacLabel, val: cac(o.late.cac), flow: `${cac(o.early.cac)} →`, m: "cac", d: o.delta.cac },
    secondCard,
    { label: `Spend`, val: money(o.late.spend), flow: `${money(o.early.spend)} →`, m: "spend", d: o.delta.spend },
    { label: `ROAS`, val: roasFmt(o.late.roas), flow: `${roasFmt(o.early.roas)} →`, m: "roas", d: o.delta.roas },
    { label: `NTB ROAS`, val: roasFmt(o.late.ntb_roas), flow: `${roasFmt(o.early.ntb_roas)} →`, m: "ntb_roas", d: o.delta.ntb_roas },
  ];
  document.getElementById("headline-cards").innerHTML = cards.map((c) => {
    let deltaHtml;
    if (c.m === "count") {
      const dd = c.d.abs;
      deltaHtml = `<div class="card-delta flat">${dd > 0 ? "+" + dd : dd < 0 ? dd : "no change"}${dd !== 0 ? " campaign" + (Math.abs(dd) === 1 ? "" : "s") : ""}</div>`;
    } else {
      deltaHtml = `<div class="card-delta ${deltaClass(c.m, c.d)}">${deltaText(c.m, c.d)}</div>`;
    }
    return `
    <div class="card">
      <div class="card-label">${c.label}</div>
      <div class="card-val">${c.val}</div>
      <div class="card-flow">${c.flow}</div>
      ${deltaHtml}
    </div>`;
  }).join("");
}

const METRICS = [["spend","Spend"],["ntb_purchases","NTB purch"],["ntb_sales","NTB sales"],["cac","CAC"],["ntb_pct","NTB %"],["roas","ROAS"],["ntb_roas","NTB ROAS"]];
function fmtMetric(key, v){
  if(key==="cac")return cac(v); if(key==="spend"||key==="ntb_sales")return moneyFull(v);
  if(key==="ntb_pct")return pct(v); if(key==="roas"||key==="ntb_roas")return v===null?"n/a":v.toFixed(2)+"x";
  return num(v);
}

function renderSummary(r, s) {
  const scope = state.scope || "all";
  const seg = (label, data) => METRICS.map(([k, name], i) => `
    <tr>
      ${i === 0 ? `<td class="seg-label" rowspan="${METRICS.length}">${escapeHtml(label)}</td>` : ""}
      <td class="metric-name">${name}</td>
      <td class="muted">${fmtMetric(k, data.early[k])}</td>
      <td>${fmtMetric(k, data.late[k])}</td>
      <td class="${deltaClass(k, data.delta[k])}">${deltaText(k, data.delta[k])}</td>
    </tr>`).join("");

  let body = seg("Overall", s.overall);
  let extraNote = "";
  if (scope === "ppc") {
    body += seg("NB only", s.nb);
  } else if (scope === "dsp") {
    // replace the (empty) NB block with one segment per DSP campaign
    body += r.dspCampaigns.map((c) => seg(shortName(c.name), c)).join("");
    extraNote = `<p class="caption">Each DSP campaign shown month over month. ${r.dspCampaigns.length} campaign${r.dspCampaigns.length === 1 ? "" : "s"} classified as DSP.</p>`;
  } else if (scope === "other") {
    body += r.otherCampaigns.map((c) => seg(shortName(c.name), c)).join("");
    extraNote = `<p class="caption">Campaigns that don't match the PPC or DSP naming rules (e.g. a misspelled prefix or a different vendor). ${r.otherCampaigns.length} campaign${r.otherCampaigns.length === 1 ? "" : "s"} in Others — worth checking the names.</p>`;
  }

  document.getElementById("summary-table").innerHTML = `
    <table>
      <thead><tr><th>Segment</th><th>Metric</th><th>${r.labels.early}</th><th>${r.labels.late}</th><th>Δ</th></tr></thead>
      <tbody>${body}</tbody>
    </table>${extraNote}`;
}

function renderCategories(r) {
  const cats = r.categories; const names = Object.keys(cats);
  const block = document.getElementById("cat-block");
  if (!names.length) {
    block.hidden = true;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    return;
  }
  block.hidden = false;
  const rows = names.map((c) => {
    const d = cats[c];
    return `<tr>
      <td class="seg-label">${escapeHtml(c)}</td>
      <td class="muted">${money(d.early.spend)}</td><td>${money(d.late.spend)}</td>
      <td class="muted">${money(d.early.ntb_sales)}</td><td>${money(d.late.ntb_sales)}</td>
      <td class="muted">${cac(d.early.cac)}</td><td>${cac(d.late.cac)}</td>
      <td class="${deltaClass("cac", d.delta.cac)}">${deltaText("cac", d.delta.cac)}</td>
    </tr>`;
  }).join("");
  document.getElementById("cat-table").innerHTML = `
    <table>
      <thead><tr><th>Category</th>
        <th>Spend ${r.labels.early}</th><th>${r.labels.late}</th>
        <th>NTB sales ${r.labels.early}</th><th>${r.labels.late}</th>
        <th>CAC ${r.labels.early}</th><th>${r.labels.late}</th><th>CAC Δ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  // caption: biggest CAC driver
  let worst = null;
  names.forEach((c) => { const d = cats[c].delta.cac.abs; if (d !== null && (worst === null || d > cats[worst].delta.cac.abs)) worst = c; });
  if (worst !== null && cats[worst].delta.cac.abs > 0) {
    const w = cats[worst];
    const np = w.delta.ntb_purchases.abs;
    document.getElementById("cat-caption").textContent =
      `${worst} drove the largest CAC increase (${deltaText("cac", w.delta.cac)}). Spend moved ${deltaText("spend", w.delta.spend)} while NTB purchases moved ${np>=0?"+":""}${num(np)} — ${np<=0?"incremental dollars bought no net-new customers.":"some of the added spend converted."}`;
  } else { document.getElementById("cat-caption").textContent = ""; }

  renderCatChart(r);
}

function renderCatChart(r) {
  const names = Object.keys(r.categories);
  const early = names.map((c) => r.categories[c].early.cac ?? 0);
  const late = names.map((c) => r.categories[c].late.cac ?? 0);
  const ctx = document.getElementById("cat-chart");
  if (state.chart) state.chart.destroy();
  const css = getComputedStyle(document.documentElement);
  state.chart = new Chart(ctx, {
    type: "bar",
    data: { labels: names, datasets: [
      { label: `CAC ${r.labels.early}`, data: early, backgroundColor: "#3a3a3a" },
      { label: `CAC ${r.labels.late}`, data: late, backgroundColor: "#e7e7e7" },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#8a8a8a", font: { family: "Archivo", size: 11 } } } },
      scales: {
        x: { ticks: { color: "#cfcfcf", font: { family: "Newsreader", size: 13 } }, grid: { display: false } },
        y: { ticks: { color: "#6e6e6e", callback: (v) => "$" + v }, grid: { color: "#1d1d1d" } },
      },
    },
  });
}

// Column definitions for the movers table.
// key: sort key on the record; label uses {E}/{L} placeholders for period labels.
// type controls formatting + good-direction for delta coloring.
const MOVER_COLS = [
  { id: "campaign", label: "Campaign", type: "text", align: "left" },
  { id: "spend_late", label: "Spend {L}", type: "money" },
  { id: "spend_delta", label: "Spend Δ", type: "money_delta", good: "none" },
  { id: "sales_late", label: "Sales {L}", type: "money" },
  { id: "sales_delta", label: "Sales Δ", type: "money_delta", good: "up" },
  { id: "ntb_sales_late", label: "NTB sales {L}", type: "money" },
  { id: "ntb_sales_delta", label: "NTB sales Δ", type: "money_delta", good: "up" },
  { id: "ntb_pct_sales_late", label: "NTB % of sales", type: "pct" },
  { id: "cac_late", label: "CAC {L}", type: "cac" },
  { id: "cac_delta", label: "CAC Δ", type: "cac_delta", good: "down" },
];

function moverCell(m, col) {
  const v = m[col.id];
  switch (col.type) {
    case "text":
      return `${escapeHtml(shortName(m.campaign))}${m.is_nb ? '<span class="flag nb">NB</span>' : ""}${m.is_b ? '<span class="flag b">B</span>' : ""}${m.is_dsp ? '<span class="flag dsp">DSP</span>' : ""}`;
    case "money": return money(v);
    case "cac": return cac(v);
    case "pct": return v === null ? "n/a" : v.toFixed(1) + "%";
    case "money_delta": {
      if (v === null) return "—";
      const cls = col.good === "none" ? "flat" : (v > 0 ? (col.good === "up" ? "up" : "down") : v < 0 ? (col.good === "up" ? "down" : "up") : "flat");
      return `<span class="${cls}">${v > 0 ? "+" : ""}${money(v)}</span>`;
    }
    case "cac_delta": {
      if (v === null) return "—";
      const cls = v > 0 ? "down" : v < 0 ? "up" : "flat";
      return `<span class="${cls}">${v > 0 ? "+" : ""}$${v.toFixed(2)}</span>`;
    }
    default: return v ?? "";
  }
}

function renderMovers(r) {
  const sort = state.moverSort; // {key, dir}
  const q = (state.moverQuery || "").toLowerCase();

  let list = [...r.movers];
  if (q) list = list.filter((m) => m.campaign.toLowerCase().includes(q));

  // sort
  const { key, dir } = sort;
  const mult = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === "campaign") return mult * String(av).localeCompare(String(bv));
    // nulls always sort to the bottom regardless of direction
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return mult * (av - bv);
  });

  const total = list.length;
  const shown = state.showAllMovers ? list : list.slice(0, 10);

  const head = MOVER_COLS.map((c) => {
    const label = c.label.replace("{E}", r.labels.early).replace("{L}", r.labels.late);
    const active = c.id === key;
    const caret = active ? (dir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="sortable${active ? " active" : ""}" data-key="${c.id}" style="text-align:${c.align === "left" ? "left" : "right"}">${label}${caret}</th>`;
  }).join("");

  const rows = shown.map((m) => `
    <tr>${MOVER_COLS.map((c) => `<td${c.align === "left" ? "" : ""} class="${c.type === "money" || c.type === "cac" ? "muted-num" : ""}">${moverCell(m, c)}</td>`).join("")}</tr>`).join("");

  document.getElementById("movers-table").innerHTML = `
    <table class="movers">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  document.getElementById("movers-count").textContent =
    q ? `${total} match${total === 1 ? "" : "es"}` : `${total} campaigns`;
  const btn = document.getElementById("toggle-movers");
  btn.style.display = total > 10 ? "" : "none";
  btn.textContent = state.showAllMovers ? "Show top 10 only" : `Show all ${total}`;

  // wire header sort clicks (re-bound each render since innerHTML replaced them)
  document.querySelectorAll("#movers-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.moverSort.key === k) {
        state.moverSort.dir = state.moverSort.dir === "asc" ? "desc" : "asc";
      } else {
        state.moverSort.key = k;
        // sensible default direction: text asc, numbers desc (biggest first)
        state.moverSort.dir = k === "campaign" ? "asc" : "desc";
      }
      renderMovers(state.result);
    });
  });
}

document.getElementById("toggle-movers").addEventListener("click", () => {
  state.showAllMovers = !state.showAllMovers; renderMovers(state.result);
});
document.getElementById("movers-search").addEventListener("input", (e) => {
  state.moverQuery = e.target.value;
  renderMovers(state.result);
});

// channel scope toggle
document.getElementById("scope-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".scope-opt");
  if (!btn) return;
  state.scope = btn.dataset.scope;
  document.querySelectorAll(".scope-opt").forEach((b) => b.classList.toggle("active", b === btn));
  renderScope(state.result);
});

function renderRecs(r) {
  const item = (m, kind) => `
    <div class="rec-item ${kind}">
      <div class="rec-name">${escapeHtml(shortName(m.campaign))}</div>
      <div class="rec-reason">${money(m.spend_late)} spend · ${escapeHtml(m.reason)}</div>
    </div>`;
  const pause = r.recommendations.pause, lean = r.recommendations.lean;
  document.getElementById("pause-list").innerHTML = pause.length ? pause.map((m) => item(m, "pause")).join("") : '<div class="rec-empty">Nothing flagged to pause.</div>';
  document.getElementById("lean-list").innerHTML = lean.length ? lean.map((m) => item(m, "lean")).join("") : '<div class="rec-empty">Nothing flagged to lean into.</div>';
}

function shortName(c) { return c.replace(/^PLTFRM\s*\|\s*/, "").replace(/\s*\|\s*SP$/, ""); }

/* ---------- Excel export (mirrors skill's 4 tabs) ---------- */
document.getElementById("export").addEventListener("click", () => {
  const r = state.result; const wb = XLSX.utils.book_new();
  const el = r.labels.early, ll = r.labels.late;
  const MET = [["spend","Spend $"],["ntb_purchases","NTB Purch"],["ntb_sales","NTB Sales $"],["cac","CAC $"],["ntb_pct","NTB %"],["roas","ROAS"],["ntb_roas","NTB ROAS"]];

  // Summary — all channel scopes (All / PPC / DSP / Others), each with Overall + NB
  const SCOPES = [["All channels", r.scopes.all], ["PPC only", r.scopes.ppc], ["DSP only", r.scopes.dsp], ["Others", r.scopes.other]];
  const sum = [["Channel","Segment","Metric",el,ll,"Δ abs","Δ %"]];
  SCOPES.forEach(([scopeName, s])=>{
    [["Overall",s.overall],["NB-only (| NB |)",s.nb]].forEach(([seg,data])=>{
      MET.forEach(([k,name])=>sum.push([scopeName,seg,name,data.early[k],data.late[k],data.delta[k].abs,data.delta[k].pct]));
    });
    sum.push([]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");

  // By Category
  if (Object.keys(r.categories).length) {
    const cat = [["Category","Metric",el,ll,"Δ abs","Δ %"]];
    for (const c in r.categories){ const d=r.categories[c];
      MET.forEach(([k,name])=>cat.push([c,name,d.early[k],d.late[k],d.delta[k].abs,d.delta[k].pct]));
      cat.push([]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cat), "By Category");
  }

  // Campaign Movers
  const mov = [["Campaign","NB?","B?","DSP?",`Spend ${el}`,`Spend ${ll}`,"Spend Δ",`NTB ${el}`,`NTB ${ll}`,`CAC ${el}`,`CAC ${ll}`,"CAC Δ"]];
  [...r.movers].sort((a,b)=>Math.abs(b.cac_delta??0)-Math.abs(a.cac_delta??0)).forEach((m)=>{
    mov.push([m.campaign,m.is_nb?"Y":"",m.is_b?"Y":"",m.is_dsp?"Y":"",m.spend_early,m.spend_late,m.spend_delta,m.ntb_early,m.ntb_late,m.cac_early,m.cac_late,m.cac_delta]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mov), "Campaign Movers");

  // Recommendations
  const rec = [["Action","Campaign",`Spend ${ll}`,`CAC ${ll}`,`NTB ${ll}`,"Reason"]];
  rec.push(["PAUSE / CUT — excludes | B |","","","","",""]);
  r.recommendations.pause.forEach((m)=>rec.push(["Pause",m.campaign,m.spend_late,m.cac_late,m.ntb_late,m.reason]));
  rec.push([]); rec.push(["LEAN IN — excludes | B |","","","","",""]);
  r.recommendations.lean.forEach((m)=>rec.push(["Lean in",m.campaign,m.spend_late,m.cac_late,m.ntb_late,m.reason]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rec), "Recommendations");

  XLSX.writeFile(wb, `CAC_MoM_${el}_to_${ll}.xlsx`);
});

// Restore any saved session AFTER all helpers are defined (avoids TDZ on const formatters).
restoreSession();
