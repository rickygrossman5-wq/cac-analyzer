window.CAC = (() => {

  /* ---------- column helpers ---------- */
  function col(row, ...aliases) {
    for (const a of aliases) {
      const k = Object.keys(row).find(k => k.trim().toLowerCase() === a.toLowerCase());
      if (k !== undefined && row[k] !== '' && row[k] !== undefined) return row[k];
    }
    return null;
  }
  function n(v) {
    if (v === null || v === undefined || v === '') return 0;
    return parseFloat(String(v).replace(/[$,%]/g, '').replace(/,/g, '')) || 0;
  }

  /* ---------- normalize raw CSV rows ---------- */
  function normalize(rawData) {
    return rawData.map(row => {
      const name = col(row, 'Campaign Name', 'Campaign name', 'Name', 'name') || '';
      return {
        name: String(name).trim(),
        spend: n(col(row, 'Spend', 'spend', 'Total Spend', 'Cost', 'Total Cost')),
        ntb_purchases: n(col(row,
          '14-day NTB orders (#)', 'NTB orders (#)', 'New-to-brand orders',
          'New-to-brand purchases', '14 Day NTB Orders', 'NTB Orders',
          '14-day new-to-brand orders (#)'
        )),
        ntb_sales: n(col(row,
          '14-day NTB sales ($)', 'NTB sales ($)', 'New-to-brand sales',
          'New-to-brand purchases revenue', '14 Day NTB Sales', 'NTB Sales',
          '14-day new-to-brand sales ($)'
        )),
        total_purchases: n(col(row,
          '14-day total orders (#)', 'Total orders (#)', 'Total Orders',
          'Orders', 'Purchases', '14 Day Total Orders', '14-day orders (#)'
        )),
        total_sales: n(col(row,
          '14-day total sales ($)', 'Total sales ($)', 'Total Sales',
          'Sales', 'Revenue', '14 Day Total Sales', '14-day sales ($)'
        )),
      };
    }).filter(r => r.name);
  }

  /* ---------- campaign flags ---------- */
  const isNB  = name => /\|\s*NB\s*\|/i.test(name);
  const isB   = name => /\|\s*B\s*\|/i.test(name);
  const isDSP = name => /^\d/.test(name.trim()) ||
    /\b(consideration|conversion|stv|streaming|awareness)\b/i.test(name);

  /* ---------- aggregate a set of records ---------- */
  function agg(recs) {
    const spend          = recs.reduce((s, r) => s + r.spend, 0);
    const ntb_purchases  = recs.reduce((s, r) => s + r.ntb_purchases, 0);
    const ntb_sales      = recs.reduce((s, r) => s + r.ntb_sales, 0);
    const total_sales    = recs.reduce((s, r) => s + r.total_sales, 0);
    return {
      spend,
      ntb_purchases,
      ntb_sales,
      total_sales,
      cac:     ntb_purchases > 0 ? spend / ntb_purchases : null,
      ntb_pct: total_sales   > 0 ? (ntb_sales / total_sales) * 100 : null,
      roas:    spend         > 0 ? total_sales / spend : null,
    };
  }

  /* ---------- delta object between two agg snapshots ---------- */
  function delta(e, l) {
    const out = {};
    for (const k of ['spend','ntb_purchases','ntb_sales','cac','ntb_pct','roas']) {
      if (e[k] === null || l[k] === null) { out[k] = { abs: null, pct: null }; continue; }
      const abs = l[k] - e[k];
      out[k] = { abs, pct: e[k] !== 0 ? parseFloat(((abs / Math.abs(e[k])) * 100).toFixed(1)) : null };
    }
    return out;
  }

  /* ---------- scope = overall + NB breakdown ---------- */
  function buildScope(eRecs, lRecs) {
    const ea = agg(eRecs), la = agg(lRecs);
    const enb = agg(eRecs.filter(r => isNB(r.name)));
    const lnb = agg(lRecs.filter(r => isNB(r.name)));
    return {
      overall: { early: ea,  late: la,  delta: delta(ea,  la)  },
      nb:      { early: enb, late: lnb, delta: delta(enb, lnb) },
    };
  }

  /* ---------- reason string for movers ---------- */
  function reason(e, l, cac_e, cac_l) {
    if (cac_l === null)  return 'No NTB purchases in later period';
    if (cac_e === null)  return 'New campaign — no prior period data';
    const d = cac_l - cac_e;
    if (Math.abs(d) < 1) return 'CAC stable month over month';
    if (d > 0) {
      if (l.spend > e.spend && l.ntb_purchases <= e.ntb_purchases) return 'Spend increased but NTB purchases did not grow';
      if (l.spend > e.spend) return 'Spend grew faster than NTB purchases';
      return 'NTB purchases declined';
    }
    return l.ntb_purchases > e.ntb_purchases ? 'NTB purchases grew' : 'Spend efficiency improved';
  }

  /* ---------- main ---------- */
  function analyze(earlyRecs, lateRecs, categories, labels) {
    const ePPC = earlyRecs.filter(r => !isDSP(r.name));
    const lPPC = lateRecs.filter(r => !isDSP(r.name));
    const eDSP = earlyRecs.filter(r =>  isDSP(r.name));
    const lDSP = lateRecs.filter(r =>  isDSP(r.name));

    const scopes = {
      all: buildScope(earlyRecs, lateRecs),
      ppc:
