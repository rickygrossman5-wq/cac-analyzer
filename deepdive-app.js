/* SP CAC Deep Dive — UI. Parsing lives in deepdive-analysis.js. */

const dd = { campaigns: null, query: "", expanded: new Set(), sort: { key: "spend", dir: "desc" }, allExpanded: false };

/* ---- columns shown for both campaign and target rows ---- */
const DD_COLS = [
  { id: "name",                label: "Campaign / Target", type: "name", align: "left" },
  { id: "match_type",          label: "Match",        type: "match", align: "left" },
  { id: "impressions",         label: "Impr",         type: "int" },
  { id: "clicks",              label: "Clicks",       type: "int" },
  { id: "spend",               label: "Spend",        type: "money" },
  { id: "adv_purchases",       label: "Adv Purch",    type: "int" },
  { id: "adv_sales",           label: "Adv Sales",    type: "money" },
  { id: "purchases_halo",      label: "Halo Purch",   type: "int" },
  { id: "sales_halo",          label: "Halo Sales",   type: "money" },
  { id: "ntb_purchases_adv",   label: "NTB Purch (adv)",  type: "int" },
  { id: "ntb_purchases_halo",  label: "NTB Purch (halo)", type: "int" },
  { id: "ntb_sales_adv",       label: "NTB Sales (adv)",  type: "money" },
  { id: "ntb_sales_halo",      label: "NTB Sales (halo)", type: "money" },
  { id: "ntb_pct_sales",       label: "NTB % of Sales",   type: "pct" },
  { id: "cac_advertised",      label: "CAC (adv)",    type: "cac" },
  { id: "cac_halo",            label: "CAC (halo)",   type: "cac" },
  { id: "cac",                 label: "CAC (blended)",type: "cac" },
];

/* ---- formatting ---- */
const ddMoney = (n) => n == null ? "—" : (Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + n.toFixed(0));
const ddInt = (n) => n == null ? "—" : Math.round(n).toLocaleString("en-US");
const ddCac = (n) => n == null || n === 0 ? "—" : "$" + n.toFixed(2);
const ddPct = (n) => n == null ? "—" : n.toFixed(1) + "%";
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function ddCell(row, col) {
  if (col.type === "name") {
    if (row.type === "campaign") {
      const flags = `${row.is_nb ? '<span class="flag nb">NB</span>' : ""}${row.is_b ? '<span class="flag b">B</span>' : ""}`;
      return `<span class="dd-toggle" data-name="${esc(row.name)}">${dd.expanded.has(row.name) || dd.allExpanded ? "−" : "+"}</span><span class="dd-campname">${esc(shortName(row.name))}</span>${flags}<span class="dd-tcount">${row.target_count}</span>`;
    }
    return `<span class="dd-target">${esc(row.target)}</span>`;
  }
  const v = row[col.id];
  switch (col.type) {
    case "match": return v ? `<span class="dd-match">${esc(v)}</span>` : "";
    case "money": return ddMoney(v);
    case "int": return ddInt(v);
    case "cac": return ddCac(v);
    case "pct": return ddPct(v);
    default: return v ?? "";
  }
}
function shortName(c) { return c.replace(/^PLTFRM\s*\|\s*/, "").replace(/\s*\|\s*SP$/, ""); }

/* ---- file load ---- */
(function wire() {
  const input = document.getElementById("file-dd");
  const drop = document.getElementById("drop-file");
  const cue = document.getElementById("cue-dd");
  const nameEl = document.getElementById("name-dd");
  const handle = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // This report uses backslash-escaped quotes (\" and "asin=\"...\"") which break
      // standard CSV quoting. Neutralize backslash-escapes so PapaParse reads rows cleanly.
      let text = String(reader.result).replace(/\\"/g, "'");
      const res = Papa.parse(text, { header: true, skipEmptyLines: true });
      dd.campaigns = window.DEEPDIVE.parseDeepDive(res.data);
      cue.textContent = `${dd.campaigns.length} campaigns`;
      nameEl.textContent = file.name;
      drop.classList.add("loaded");
      document.getElementById("run").disabled = false;
      document.getElementById("run-hint").textContent = "Ready";
    };
    reader.onerror = () => { cue.textContent = "Couldn't read that file"; };
    reader.readAsText(file);
  };
  input.addEventListener("change", (e) => handle(e.target.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drag"); handle(e.dataTransfer.files[0]); });
})();

document.getElementById("run").addEventListener("click", () => {
  renderAll();
  document.getElementById("results").hidden = false;
  document.getElementById("results").scrollIntoView({ behavior: "smooth" });
});

/* ---- render ---- */
function renderAll() { renderCards(); renderTable(); }

function renderCards() {
  const cs = dd.campaigns;
  const tot = cs.reduce((a, c) => {
    a.spend += c.spend; a.ntb += c.ntb_purchases_total; a.sales += c.sales_total;
    a.ntb_sales += c.ntb_sales_total; a.targets += c.target_count; return a;
  }, { spend: 0, ntb: 0, sales: 0, ntb_sales: 0, targets: 0 });
  const cac = tot.ntb > 0 ? tot.spend / tot.ntb : null;
  const ntbPct = tot.sales > 0 ? 100 * tot.ntb_sales / tot.sales : null;
  const cards = [
    { label: "SP Spend", val: ddMoney(tot.spend) },
    { label: "Blended CAC", val: ddCac(cac) },
    { label: "NTB Purchases", val: ddInt(tot.ntb) },
    { label: "NTB % of Sales", val: ddPct(ntbPct) },
    { label: "Campaigns / Targets", val: `${cs.length} / ${tot.targets}` },
  ];
  document.getElementById("dd-cards").innerHTML = cards.map((c) => `
    <div class="card"><div class="card-label">${c.label}</div><div class="card-val">${c.val}</div></div>`).join("");
}

function sortedCampaigns() {
  const q = dd.query.toLowerCase();
  let list = dd.campaigns;
  if (q) list = list.filter((c) =>
    c.name.toLowerCase().includes(q) || c.targets.some((t) => (t.target || "").toLowerCase().includes(q)));
  const { key, dir } = dd.sort, mult = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === "name") return mult * String(a.name).localeCompare(String(b.name));
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    return mult * (av - bv);
  });
}

function renderTable() {
  const head = `<tr>${DD_COLS.map((c) => {
    const active = c.id === dd.sort.key;
    const caret = active ? (dd.sort.dir === "asc" ? " ▲" : " ▼") : "";
    const sortable = c.type !== "match" ? " sortable" : "";
    return `<th class="${sortable.trim()}${active ? " active" : ""}" data-key="${c.id}" style="text-align:${c.align === "left" ? "left" : "right"}">${c.label}${caret}</th>`;
  }).join("")}</tr>`;
  document.getElementById("dd-head").innerHTML = head;

  const q = dd.query.toLowerCase();
  const rowsHtml = [];
  for (const c of sortedCampaigns()) {
    rowsHtml.push(`<tr class="dd-camp-row">${DD_COLS.map((col) => `<td class="${tdCls(col)}">${ddCell(c, col)}</td>`).join("")}</tr>`);
    const open = dd.allExpanded || dd.expanded.has(c.name);
    if (open) {
      // when filtering, only show matching targets if the campaign name itself doesn't match
      let targets = c.targets;
      if (q && !c.name.toLowerCase().includes(q)) targets = targets.filter((t) => (t.target || "").toLowerCase().includes(q));
      for (const t of targets) {
        rowsHtml.push(`<tr class="dd-target-row">${DD_COLS.map((col) => `<td class="${tdCls(col)}">${ddCell(t, col)}</td>`).join("")}</tr>`);
      }
    }
  }
  document.getElementById("dd-body").innerHTML = rowsHtml.join("");

  const shownCount = sortedCampaigns().length;
  document.getElementById("dd-count").textContent =
    q ? `${shownCount} match${shownCount === 1 ? "" : "es"}` : `${shownCount} campaigns`;

  // wire toggles
  document.querySelectorAll(".dd-toggle").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = el.dataset.name;
      if (dd.allExpanded) { // switch from all-expanded to manual, collapsing this one
        dd.allExpanded = false;
        dd.expanded = new Set(dd.campaigns.map((c) => c.name));
        dd.expanded.delete(n);
      } else if (dd.expanded.has(n)) dd.expanded.delete(n);
      else dd.expanded.add(n);
      renderTable();
    });
  });
  // clicking a campaign row toggles too
  document.querySelectorAll(".dd-camp-row").forEach((row) => {
    row.addEventListener("click", () => {
      const t = row.querySelector(".dd-toggle"); if (t) t.click();
    });
  });
  // header sort
  document.querySelectorAll("#dd-head th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (dd.sort.key === k) dd.sort.dir = dd.sort.dir === "asc" ? "desc" : "asc";
      else { dd.sort.key = k; dd.sort.dir = k === "name" ? "asc" : "desc"; }
      renderTable();
    });
  });
}

function tdCls(col) {
  let cls = "";
  if (col.align !== "left") cls += "num";
  if (col.type === "money" || col.type === "cac" || col.type === "int") cls += " muted-num";
  return cls.trim();
}

document.getElementById("dd-search").addEventListener("input", (e) => { dd.query = e.target.value; renderTable(); });
document.getElementById("dd-expand-all").addEventListener("click", (e) => {
  dd.allExpanded = !dd.allExpanded;
  dd.expanded.clear();
  e.target.textContent = dd.allExpanded ? "Collapse all" : "Expand all";
  renderTable();
});

/* ---- Excel export: one row per campaign + its targets, flat with a Level column ---- */
document.getElementById("export").addEventListener("click", () => {
  const wb = XLSX.utils.book_new();
  const header = ["Level", "Campaign", "Target", "Match Type", "Impressions", "Clicks", "Spend",
    "Adv Purchases", "Adv Sales", "Halo Purchases", "Halo Sales",
    "NTB Purch (adv)", "NTB Purch (halo)", "NTB Sales (adv)", "NTB Sales (halo)",
    "NTB % of Sales", "CAC (adv)", "CAC (halo)", "CAC (blended)"];
  const aoa = [header];
  for (const c of sortedCampaigns()) {
    aoa.push(["Campaign", window.DEEPDIVE.ddCleanName(c.name), "(all targets)", "",
      c.impressions, c.clicks, c.spend, c.adv_purchases, c.adv_sales, c.purchases_halo, c.sales_halo,
      c.ntb_purchases_adv, c.ntb_purchases_halo, c.ntb_sales_adv, c.ntb_sales_halo,
      c.ntb_pct_sales, c.cac_advertised, c.cac_halo, c.cac]);
    for (const t of c.targets) {
      aoa.push(["Target", window.DEEPDIVE.ddCleanName(c.name), t.target, t.match_type,
        t.impressions, t.clicks, t.spend, t.adv_purchases, t.adv_sales, t.purchases_halo, t.sales_halo,
        t.ntb_purchases_adv, t.ntb_purchases_halo, t.ntb_sales_adv, t.ntb_sales_halo,
        t.ntb_pct_sales, t.cac_advertised, t.cac_halo, t.cac]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "SP CAC Deep Dive");
  XLSX.writeFile(wb, "SP_CAC_Deep_Dive.xlsx");
});
