/* SP CAC Deep Dive — parses the "NTB by Campaign + Target" report.
   Structure of that report:
     - grain="CAMPAIGN" rows (sort_order 0): authoritative per-campaign totals; target="(all targets)"
     - grain="target"   rows (sort_order 1): one row per target within a campaign.
       The `campaign` column fills down — a blank campaign means "same campaign as the row above".
       Rows with no target name (blank target/match_type) are unattributed residue and are dropped.
   All campaigns in this report are Sponsored Products (| SP |).                                  */

const DD_NB_RE = /\|\s*NB\s*\|/;
const DD_B_RE = /\|\s*B\s*\|/;

function ddCleanNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// strip CSV quote-escape artifacts from names (e.g. PLTFRM | "Whey Protein" -> readable)
function ddCleanName(s) {
  return String(s == null ? "" : s)
    .replace(/\\+"/g, '"')   // \" -> "
    .replace(/\\+/g, "")     // stray backslashes
    .replace(/"{2,}/g, '"')  // "" -> "
    .replace(/"/g, "")        // drop remaining quote artifacts from CSV escaping
    .trim();
}

function ddRound(n) { return Math.round(n * 100) / 100; }

function ddNum(raw) {
  const r = {};
  for (const k in raw) r[k.trim()] = raw[k];
  return r;
}

// Parse rows (array of objects from PapaParse) into campaigns with nested targets.
function parseDeepDive(rows) {
  const norm = rows.map(ddNum).filter((r) => r.grain);
  const campaigns = new Map(); // campaign name -> record

  // 1) campaign-grain rows = authoritative totals
  for (const r of norm) {
    if (String(r.grain).toUpperCase() !== "CAMPAIGN") continue;
    const name = ddCleanName(r.campaign);
    if (!name) continue;
    campaigns.set(name, buildCampaign(name, r));
  }

  // 2) target-grain rows, with fill-down on campaign
  let lastCampaign = null;
  for (const r of norm) {
    if (String(r.grain).toLowerCase() !== "target") continue;
    const rawName = r.campaign != null && String(r.campaign).trim() !== "" ? ddCleanName(r.campaign) : null;
    if (rawName) lastCampaign = rawName;
    const owner = rawName || lastCampaign;
    const targetName = r.target != null ? String(r.target).trim() : "";
    if (!owner || !targetName) continue; // drop unattributed residue
    let camp = campaigns.get(owner);
    if (!camp) { camp = buildCampaign(owner, null); campaigns.set(owner, camp); }
    camp.targets.push(buildTarget(r));
  }

  // finalize: derive metrics, sort targets by spend desc
  const out = [];
  for (const camp of campaigns.values()) {
    deriveMetrics(camp);
    camp.targets.forEach(deriveMetrics);
    camp.targets.sort((a, b) => b.spend - a.spend);
    camp.target_count = camp.targets.length;
    out.push(camp);
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

function buildCampaign(name, r) {
  const base = {
    type: "campaign", name, is_nb: DD_NB_RE.test(name), is_b: DD_B_RE.test(name),
    targets: [],
  };
  assignRaw(base, r);
  return base;
}

function buildTarget(r) {
  const t = {
    type: "target",
    target: ddCleanName(r.target),
    match_type: r.match_type != null ? String(r.match_type).trim() : "",
  };
  assignRaw(t, r);
  return t;
}

// pull every numeric field from the report onto the record
function assignRaw(obj, r) {
  const fields = ["impressions", "clicks", "spend", "adv_purchases", "adv_sales",
    "purchases_halo", "sales_halo", "ntb_purchases_adv", "ntb_purchases_halo",
    "ntb_sales_adv", "ntb_sales_halo", "cac_advertised", "cac_halo"];
  for (const f of fields) obj[f] = r ? ddCleanNum(r[f]) : 0;
}

// derived/combined metrics used in the table
function deriveMetrics(o) {
  o.purchases_total = ddRound(o.adv_purchases + o.purchases_halo);
  o.sales_total = ddRound(o.adv_sales + o.sales_halo);
  o.ntb_purchases_total = ddRound(o.ntb_purchases_adv + o.ntb_purchases_halo);
  o.ntb_sales_total = ddRound(o.ntb_sales_adv + o.ntb_sales_halo);
  // CAC from the report is per-grain; recompute a blended CAC from spend / total NTB purchases
  o.cac = o.ntb_purchases_total > 0 ? ddRound(o.spend / o.ntb_purchases_total) : null;
  // NTB share of sales (advertised + halo)
  o.ntb_pct_sales = o.sales_total > 0 ? ddRound(100 * o.ntb_sales_total / o.sales_total) : null;
  o.spend = ddRound(o.spend);
}

window.DEEPDIVE = { parseDeepDive, ddCleanName };
