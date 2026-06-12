/* CAC MoM analysis — faithful port of the cac-mom-analysis skill's analyze.py.
   Pure functions; no DOM. Mirrors the skill's definitions exactly:
   - CAC always recomputed from summed cost / summed NTB (never the per-row column)
   - | NB | filter for NB-only; | B | excluded from recommendations only
   - currency/space stripping; truncated-header tolerance; n/a on zero NTB        */

const NB_RE = /\|\s*NB\s*\|/;
const B_RE = /\|\s*B\s*\|/;
// DSP: a leading number (date prefix) OR a DSP funnel keyword.
// Channel classification rules:
//  PPC  : starts with "PLTFRM |", contains | B | or | NB |, and has SP/SB/SBV/SD as a token
//  DSP  : starts with a date (leading digit) OR contains conversion/consideration/streaming tv/STV
//  Other: anything that matches neither
// Channel classification rules (confirmed):
//  PPC  : starts with "PLTFRM |" AND has | B | or | NB |
//  DSP  : starts with a date (leading digit) OR contains conversion/consideration/streaming tv/STV
//  Other: matches neither — OR matches BOTH (ambiguous), so it gets surfaced rather than hidden
const PPC_PREFIX_RE = /^\s*PLTFRM\s*\|/i;
const PPC_TAG_RE = /\|\s*B\s*\||\|\s*NB\s*\|/;
const DSP_KW_RE = /consideration|conversion|stv|streaming\s*tv/i;
const DSP_LEADNUM_RE = /^\s*\d/;

function cleanNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Normalize one parsed CSV (array of row objects) into clean records.
function normalize(rows) {
  // headers may have stray spaces; build a trimmed-key lookup per row
  return rows.map((raw) => {
    const r = {};
    for (const k in raw) r[k.trim()] = raw[k];
    return {
      campaign: String(r["campaign"] ?? ""),
      spend: cleanNum(r["total_cost"]),
      ntb: cleanNum(r["new_to_brand_purchases"]),
      ntb_sales: cleanNum(r["new_to_brand_product_sales"]),
      non_ntb: cleanNum(r["non_new_to_brand_purchases"]),
      non_ntb_sales: cleanNum(r["non_new_to_brand_product_sales"]),
    };
  }).filter((r) => r.campaign && r.campaign.trim() !== "" && r.campaign.trim().toLowerCase() !== "undefined");
}

function isNB(name) { return NB_RE.test(name); }
function isB(name) { return B_RE.test(name); }
function isPPC(name) {
  return PPC_PREFIX_RE.test(name) && PPC_TAG_RE.test(name);
}
function isDSP(name) { return DSP_LEADNUM_RE.test(name) || DSP_KW_RE.test(name); }
// A campaign matching BOTH patterns is ambiguous -> Others (so it's flagged, not silently bucketed).
function classifyChannel(name) {
  const ppc = isPPC(name), dsp = isDSP(name);
  if (ppc && dsp) return "other";
  if (ppc) return "ppc";
  if (dsp) return "dsp";
  return "other";
}

// Aggregate a set of records → metrics. CAC recomputed from totals.
function agg(records) {
  let spend = 0, ntb = 0, ntbSales = 0, nonNtb = 0, nonNtbSales = 0;
  for (const r of records) {
    spend += r.spend; ntb += r.ntb; ntbSales += r.ntb_sales;
    nonNtb += r.non_ntb; nonNtbSales += (r.non_ntb_sales || 0);
  }
  const totalPurch = ntb + nonNtb;
  const totalSales = ntbSales + nonNtbSales;
  return {
    spend: round2(spend),
    ntb_purchases: Math.round(ntb),
    ntb_sales: round2(ntbSales),
    total_sales: round2(totalSales),
    cac: ntb > 0 ? round2(spend / ntb) : null,
    ntb_pct: totalPurch > 0 ? round2(100 * ntb / totalPurch) : null,
    roas: spend > 0 ? round2(totalSales / spend) : null,       // overall: total sales / spend
    ntb_roas: spend > 0 ? round2(ntbSales / spend) : null,     // NTB sales / spend
  };
}

function delta(a, b) {
  const out = {};
  for (const k of ["spend", "ntb_purchases", "ntb_sales", "cac", "ntb_pct", "roas", "ntb_roas"]) {
    const av = a[k], bv = b[k];
    if (av === null || bv === null || av === undefined || bv === undefined) {
      out[k] = { abs: null, pct: null };
    } else {
      out[k] = { abs: round2(bv - av), pct: av !== 0 ? round1(100 * (bv - av) / av) : null };
    }
  }
  return out;
}

function categoryRows(early, late, categories) {
  const rows = {};
  for (const cat in categories) {
    const terms = categories[cat].map((t) => t.toLowerCase()).filter(Boolean);
    const match = (recs) => recs.filter((r) => {
      const n = r.campaign.toLowerCase();
      return terms.some((t) => n.includes(t));
    });
    const e = agg(match(early)), l = agg(match(late));
    rows[cat] = { early: e, late: l, delta: delta(e, l) };
  }
  return rows;
}

function perCampaign(records) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.campaign)) map.set(r.campaign, { spend: 0, ntb: 0, ntb_sales: 0, total_sales: 0 });
    const m = map.get(r.campaign);
    m.spend += r.spend; m.ntb += r.ntb;
    m.ntb_sales += r.ntb_sales;
    m.total_sales += r.ntb_sales + r.non_ntb_sales;
  }
  return map;
}

function campaignMovers(early, late) {
  const e = perCampaign(early), l = perCampaign(late);
  const names = new Set([...e.keys(), ...l.keys()]);
  const recs = [];
  for (const c of names) {
    const ev = e.get(c) || { spend: 0, ntb: 0, ntb_sales: 0, total_sales: 0 };
    const lv = l.get(c) || { spend: 0, ntb: 0, ntb_sales: 0, total_sales: 0 };
    const ecac = ev.ntb > 0 ? ev.spend / ev.ntb : null;
    const lcac = lv.ntb > 0 ? lv.spend / lv.ntb : null;
    // NTB % of sales — most recent (late) period only, per the spec
    const ntb_pct_sales_late = lv.total_sales > 0 ? round2(100 * lv.ntb_sales / lv.total_sales) : null;
    recs.push({
      campaign: c, is_nb: isNB(c), is_b: isB(c),
      spend_early: round2(ev.spend), spend_late: round2(lv.spend),
      ntb_early: Math.round(ev.ntb), ntb_late: Math.round(lv.ntb),
      sales_early: round2(ev.total_sales), sales_late: round2(lv.total_sales),
      ntb_sales_early: round2(ev.ntb_sales), ntb_sales_late: round2(lv.ntb_sales),
      ntb_pct_sales_late,
      cac_early: ecac !== null ? round2(ecac) : null,
      cac_late: lcac !== null ? round2(lcac) : null,
      cac_delta: (ecac !== null && lcac !== null) ? round2(lcac - ecac) : null,
      spend_delta: round2(lv.spend - ev.spend),
      sales_delta: round2(lv.total_sales - ev.total_sales),
      ntb_sales_delta: round2(lv.ntb_sales - ev.ntb_sales),
    });
  }
  return recs;
}

function recommendations(movers, benchmark) {
  const elig = movers.filter((m) => !m.is_b);
  const pause = [], lean = [];
  for (const m of elig) {
    const ls = m.spend_late, lcac = m.cac_late, lnb = m.ntb_late;
    if (ls >= 1000 && (lnb === 0 || (lcac !== null && lcac > 1.8 * benchmark))) {
      const reason = lnb === 0 ? "no NTB on meaningful spend" : `CAC $${Math.round(lcac)} vs ~$${Math.round(benchmark)} benchmark`;
      pause.push({ ...m, reason });
    } else if (ls >= 1000 && lcac !== null && lcac < 0.8 * benchmark) {
      const trend = m.spend_delta > 0 ? "scaling" : "efficient, has headroom";
      lean.push({ ...m, reason: `CAC $${Math.round(lcac)} (${trend})` });
    }
  }
  pause.sort((a, b) => (b.cac_late ?? 0) - (a.cac_late ?? 0));
  lean.sort((a, b) => (a.cac_late ?? 9e9) - (b.cac_late ?? 9e9));
  return { pause, lean };
}

// Build overall + NB summary for an arbitrary subset of records.
function scopeSummary(early, late) {
  const overall = { early: agg(early), late: agg(late) };
  overall.delta = delta(overall.early, overall.late);
  const nbE = early.filter((r) => isNB(r.campaign));
  const nbL = late.filter((r) => isNB(r.campaign));
  const nb = { early: agg(nbE), late: agg(nbL) };
  nb.delta = delta(nb.early, nb.late);
  return { overall, nb };
}

// Top-level: takes normalized early/late record arrays + category map.
function analyze(early, late, categories, labels) {
  // Channel split: PPC / DSP / Other
  const byCh = (recs, ch) => recs.filter((r) => classifyChannel(r.campaign) === ch);
  const ppcEarly = byCh(early, "ppc"), ppcLate = byCh(late, "ppc");
  const dspEarly = byCh(early, "dsp"), dspLate = byCh(late, "dsp");
  const othEarly = byCh(early, "other"), othLate = byCh(late, "other");

  const scopes = {
    all: scopeSummary(early, late),
    ppc: scopeSummary(ppcEarly, ppcLate),
    dsp: scopeSummary(dspEarly, dspLate),
    other: scopeSummary(othEarly, othLate),
  };
  const counts = {
    all: { early: early.length, late: late.length },
    ppc: { early: ppcEarly.length, late: ppcLate.length },
    dsp: { early: dspEarly.length, late: dspLate.length },
    other: { early: othEarly.length, late: othLate.length },
  };

  // Per-DSP-campaign MoM summaries (full metrics via agg/delta), sorted by late spend.
  const dspNames = new Set([...dspEarly, ...dspLate].map((r) => r.campaign));
  const dspCampaigns = [...dspNames].map((name) => {
    const e = early.filter((r) => r.campaign === name);
    const l = late.filter((r) => r.campaign === name);
    const ea = agg(e), la = agg(l);
    return { name, early: ea, late: la, delta: delta(ea, la) };
  }).sort((a, b) => (b.late.spend || 0) - (a.late.spend || 0));

  // Per-Other-campaign MoM summaries (same treatment as DSP, shown as per-campaign rows).
  const othNames = new Set([...othEarly, ...othLate].map((r) => r.campaign));
  const otherCampaigns = [...othNames].map((name) => {
    const e = early.filter((r) => r.campaign === name);
    const l = late.filter((r) => r.campaign === name);
    const ea = agg(e), la = agg(l);
    return { name, early: ea, late: la, delta: delta(ea, la) };
  }).sort((a, b) => (b.late.spend || 0) - (a.late.spend || 0));

  // Back-compat: top-level overall/nb mirror the "all" scope.
  const overall = scopes.all.overall;
  const nb = scopes.all.nb;

  const cats = Object.keys(categories).length ? categoryRows(early, late, categories) : {};
  const movers = campaignMovers(early, late).map((m) => ({ ...m, channel: classifyChannel(m.campaign), is_dsp: classifyChannel(m.campaign) === "dsp" }));
  const benchmark = nb.late.cac || overall.late.cac || 30;
  const recs = recommendations(movers, benchmark);

  return { labels, overall, nb, scopes, counts, dspCampaigns, otherCampaigns, categories: cats, movers, benchmark: round2(benchmark), recommendations: recs };
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

// expose
window.CAC = { normalize, analyze, agg, delta, isNB, isB, isDSP, isPPC, classifyChannel };
