/**
 * SIMULATOR CREDIT IPOTECAR
 * =========================
 * Funcționalități:
 *  - Dobândă fixă perioadă 1 (primii N ani) + variabilă perioadă 2 (IRCC + marjă)
 *  - Plăți suplimentare recurente pe intervale de ani
 *  - Rambursări ocazionale (lump sum)
 *  - Modele evoluție IRCC (constant, crește, scade, custom)
 *  - Tip rată: anuitate / descrescătoare
 *  - Export CSV, grafice, stress test
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const state = {
  rateType:        'annuity',    // 'annuity' | 'decreasing'
  irccFreq:        3,            // update frequency months (3 | 6)
  irccModel:       'constant',   // 'constant' | 'increase' | 'decrease' | 'custom'
  prepayOption:    'reduce_period', // 'reduce_period' | 'reduce_rate'
  currency:        'RON',        // 'RON' | 'EUR'

  // Recurring extra payments by year interval: [{fromYear, toYear, amount}]
  recurringPrepays: [],

  // Lump-sum one-time payments: [{year, month, amount}]
  onetimePayments:  [],

  // Simulation results
  simulationResult: null,
  baseResult:       null,
  _params:          null,
  charts:           {},

  // Table state
  tableData:  [],
  tablePage:  1,
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function el(id)    { return document.getElementById(id); }
function numEl(id) { return parseFloat(el(id)?.value) || 0; }

const fmt = {
  money: v => {
    const n = Number(v);
    const abs = Math.abs(n);
    const str = abs.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = n < 0 ? '-' : '';
    if (state.currency === 'EUR') return sign + '€' + str;
    return sign + str + ' RON';
  },
  unit:  ()  => state.currency === 'EUR' ? 'EUR' : 'RON',
  sym:   ()  => state.currency === 'EUR' ? '€' : 'RON',
  pct:   v   => Number(v).toFixed(2) + '%',
  pct4:  v   => Number(v).toFixed(4) + '%',
  month: v   => {
    const y = Math.floor((v - 1) / 12) + 1;
    const m = ((v - 1) % 12) + 1;
    return `An ${y}, L${String(m).padStart(2,'0')}`;
  },
};

// ═══════════════════════════════════════════════════════════════
// IRCC SCENARIO GENERATION (perioadă variabilă)
// ═══════════════════════════════════════════════════════════════
/**
 * Generează array de valori IRCC pentru durationMonths luni.
 * IRCC se schimbă doar la granițele de perioadă (freq luni).
 */
function generateIRCCScenario(initialIRCC, durationMonths, model, freq) {
  if (durationMonths <= 0) return [];

  const totalPeriods = Math.ceil(durationMonths / freq);
  const periods = [];

  if (model === 'constant') {
    for (let i = 0; i < totalPeriods; i++) periods.push(initialIRCC);

  } else if (model === 'increase') {
    const annualRate = parseFloat(el('irccLinearRate')?.value) || 0;
    const ratePerPeriod = annualRate * (freq / 12);
    for (let i = 0; i < totalPeriods; i++)
      periods.push(Math.max(0, initialIRCC + i * ratePerPeriod));

  } else if (model === 'decrease') {
    const annualRate = parseFloat(el('irccLinearRate')?.value) || 0;
    const ratePerPeriod = annualRate * (freq / 12);
    for (let i = 0; i < totalPeriods; i++)
      periods.push(Math.max(0, initialIRCC - i * ratePerPeriod));

  } else if (model === 'custom') {
    const raw = el('irccCustomValues')?.value || '';
    const vals = raw.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    for (let i = 0; i < totalPeriods; i++)
      periods.push(vals[i] !== undefined ? vals[i] : (vals[vals.length - 1] || initialIRCC));
  }

  // Expandează la luni
  const monthly = [];
  for (let i = 0; i < totalPeriods; i++) {
    for (let j = 0; j < freq && monthly.length < durationMonths; j++) {
      monthly.push(periods[i]);
    }
  }
  return monthly;
}

/**
 * Generează array-ul IRCC complet (perioadă fixă + variabilă).
 * Pentru P1: ircc_equiv = period1Rate - margin (astfel IRCC+margin = period1Rate)
 * Pentru P2: IRCC variabil conform modelului
 */
function generateIRCCFull(period1Months, period1Rate, margin, irccMain, durationMonths, model, freq) {
  const p1 = Math.min(period1Months, durationMonths);
  const p2Months = durationMonths - p1;

  const p1IrccEquiv = p1 > 0 ? Math.max(0, period1Rate - margin) : 0;
  const p2IRCC = generateIRCCScenario(irccMain, p2Months, model, freq);

  const result = [];
  for (let i = 0; i < p1; i++) result.push(p1IrccEquiv);
  for (let i = 0; i < p2Months; i++) result.push(p2IRCC[i] ?? irccMain);

  return result;
}

// ═══════════════════════════════════════════════════════════════
// ANNUITY PAYMENT FORMULA
// ═══════════════════════════════════════════════════════════════
function computeAnnuityPayment(P, r, n) {
  if (r === 0) return P / n;
  return P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// ═══════════════════════════════════════════════════════════════
// SIMULARE LUNARĂ
// ═══════════════════════════════════════════════════════════════
/**
 * Params:
 *   loanAmount, durationMonths, margin
 *   period1Months       — câte luni sunt în perioadă fixă
 *   irccMonthly         — array IRCC per lună
 *   monthlyExtra        — array[month] extra plată lunară
 *   onetimePayments     — [{month, amount}]
 *   rateType, prepayOption
 *   insuranceRate       — % lunar din soldul rămas (ex: 0.026)
 */
function simulateMonthByMonth(params) {
  const {
    loanAmount, durationMonths, margin,
    period1Months,
    irccMonthly,
    monthlyExtra,
    onetimePayments,
    rateType,
    prepayOption,
    insuranceRate = 0,
  } = params;

  const onetimeMap = {};
  (onetimePayments || []).forEach(({ month, amount }) => {
    onetimeMap[month] = (onetimeMap[month] || 0) + amount;
  });

  const schedule = [];
  let balance = loanAmount;
  let remainingMonths = durationMonths;
  let currentPayment = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  let totalInsurance = 0;
  let month = 0;
  let maxRate = 0;
  let lastIRCC = null;

  while (balance > 0.01 && remainingMonths > 0) {
    month++;

    const ircc        = irccMonthly[month - 1] ?? (irccMonthly[irccMonthly.length - 1] ?? 0);
    const annualRate  = ircc + margin;
    const r           = annualRate / 100 / 12;
    const irccChanged = ircc !== lastIRCC;
    const isFixed     = period1Months > 0 && month <= period1Months;
    lastIRCC = ircc;

    if (annualRate > maxRate) maxRate = annualRate;

    let payment, interestPart, principalPart;

    if (rateType === 'annuity') {
      if (irccChanged || currentPayment === 0) {
        currentPayment = computeAnnuityPayment(balance, r, remainingMonths);
      }
      payment       = currentPayment;
      interestPart  = balance * r;
      principalPart = Math.max(0, payment - interestPart);
    } else {
      // Descrescătoare
      principalPart = balance / remainingMonths;
      interestPart  = balance * r;
      payment       = principalPart + interestPart;
    }

    if (principalPart > balance) principalPart = balance;
    payment = principalPart + interestPart;

    // Extra plată
    let extraPrepay = 0;
    const baseExtra = (monthlyExtra ? (monthlyExtra[month] || 0) : 0) + (onetimeMap[month] || 0);
    if (baseExtra > 0) {
      extraPrepay = Math.min(baseExtra, balance - principalPart);
    }

    const totalPrincipalThisMonth = principalPart + extraPrepay;
    balance = Math.max(0, balance - totalPrincipalThisMonth);

    // Asigurare de viață: % lunar din soldul ÎNAINTE de scăderea principalului
    const insurancePart = balance * (insuranceRate / 100);

    totalPaid      += payment + extraPrepay + insurancePart;
    totalInterest  += interestPart;
    totalInsurance += insurancePart;

    schedule.push({
      month,
      ircc,
      annualRate,
      monthlyRate: r * 100,
      payment,
      insurancePart,
      totalPayment: payment + insurancePart,
      interestPart,
      principalPart,
      extraPrepay,
      balance,
      irccChanged,
      isFixed,
    });

    remainingMonths--;

    if (prepayOption === 'reduce_rate' && extraPrepay > 0 && rateType === 'annuity') {
      currentPayment = computeAnnuityPayment(balance, r, remainingMonths);
    }

    if (balance < 0.01) break;
  }

  const actualYears   = month / 12;
  const effectiveRate = actualYears > 0 ? (totalInterest / loanAmount / actualYears) * 100 : 0;

  return { schedule, totalPaid, totalInterest, totalInsurance, finalMonth: month, maxRate, effectiveRate };
}

// ═══════════════════════════════════════════════════════════════
// ANALIZĂ COMPARATIVĂ
// ═══════════════════════════════════════════════════════════════
function runComparativeAnalysis(baseResult, prepayResult) {
  return {
    interestSaved: baseResult.totalInterest - prepayResult.totalInterest,
    monthsSaved:   baseResult.finalMonth    - prepayResult.finalMonth,
    totalSaved:    baseResult.totalPaid     - prepayResult.totalPaid,
  };
}

// ═══════════════════════════════════════════════════════════════
// STRESS TEST
// ═══════════════════════════════════════════════════════════════
function runStressTest(baseParams, stressIRCCDelta) {
  const stressedIRCC = baseParams.irccMonthly.map((v, i) => {
    // Nu modificăm dobânda fixă din P1
    if (i < (baseParams.period1Months || 0)) return v;
    return v + stressIRCCDelta;
  });
  return simulateMonthByMonth({ ...baseParams, irccMonthly: stressedIRCC });
}

// ═══════════════════════════════════════════════════════════════
// COLECTARE PARAMETRI
// ═══════════════════════════════════════════════════════════════
function collectParams() {
  const loanAmount     = numEl('loanAmount');
  const durationYears  = numEl('loanDuration');
  const margin         = numEl('bankMargin');
  const initialIRCC    = numEl('initialIRCC');
  const period1Years   = numEl('period1Years');
  const period1Rate    = numEl('period1Rate');
  const insuranceRate  = numEl('insuranceRate'); // % lunar din sold
  const durationMonths = Math.round(durationYears * 12);
  const period1Months  = Math.min(Math.round(period1Years * 12), durationMonths);

  // IRCC array (P1 + P2)
  const irccMonthly = generateIRCCFull(
    period1Months, period1Rate, margin,
    initialIRCC, durationMonths,
    state.irccModel, state.irccFreq
  );

  // Extra lunar din intervale recurente
  const monthlyExtra = new Array(durationMonths + 1).fill(0);
  for (const rp of state.recurringPrepays) {
    if (!rp.amount || rp.amount <= 0) continue;
    const fromM = Math.max(1, (rp.fromYear - 1) * 12 + 1);
    const toM   = (rp.toYear <= 0 ? durationYears : rp.toYear) * 12;
    for (let m = fromM; m <= Math.min(durationMonths, toM); m++) {
      monthlyExtra[m] += rp.amount;
    }
  }

  // Rambursări ocazionale: convertim an+lună -> lună absolută
  const onetimeAbsolute = state.onetimePayments.map(p => ({
    month:  (p.year - 1) * 12 + p.month,
    amount: p.amount,
  })).filter(p => p.amount > 0 && p.month >= 1 && p.month <= durationMonths);

  return {
    loanAmount,
    durationMonths,
    durationYears,
    margin,
    initialIRCC,
    period1Months,
    period1Rate,
    irccMonthly,
    monthlyExtra,
    insuranceRate,
    onetimePayments: onetimeAbsolute,
    rateType:     state.rateType,
    prepayOption: state.prepayOption,
  };
}

// ═══════════════════════════════════════════════════════════════
// RENDER RESULTS
// ═══════════════════════════════════════════════════════════════
function renderResults(result, baseResult, params) {
  const comp      = runComparativeAnalysis(baseResult, result);
  const hasPrepay = state.recurringPrepays.some(r => r.amount > 0)
                 || state.onetimePayments.some(r => r.amount > 0);

  el('resultsSection').className = 'results-visible';

  // ── KPI CARDS ─────────────────────────────────────────────
  const firstRow       = result.schedule[0];
  const initialPayment = firstRow?.payment || 0;
  const initInsurance  = firstRow?.insurancePart || 0;
  const initTotal      = firstRow?.totalPayment || 0;
  const firstP2Row     = result.schedule.find(r => !r.isFixed);
  const p2InitPayment  = firstP2Row?.totalPayment || 0;
  const maxTotal       = result.schedule.reduce((m, r) => Math.max(m, r.totalPayment), 0);
  const hasInsurance   = params.insuranceRate > 0;

  let kpiHTML = '';
  if (params.period1Months > 0) {
    kpiHTML += kpiCard('Total Lunar P1 (cu asig.)',
      fmt.money(initTotal), 'amber',
      `Rată ${fmt.money(initialPayment)} + asig. ${fmt.money(initInsurance)}`);
    kpiHTML += kpiCard('Total Lunar P2 Inițial (cu asig.)',
      fmt.money(p2InitPayment), 'sky',
      `IRCC ${fmt.pct(params.initialIRCC)} + marjă ${fmt.pct(params.margin)}`);
  } else {
    kpiHTML += kpiCard('Total Lunar Inițial (cu asig.)',
      fmt.money(initTotal), 'sky',
      `Rată ${fmt.money(initialPayment)} + asig. ${fmt.money(initInsurance)}`);
  }
  kpiHTML += kpiCard('Total Lunar Maxim', fmt.money(maxTotal), 'red',
    `DAE ${fmt.pct(result.maxRate)}`);
  kpiHTML += kpiCard('Total Plătit', fmt.money(result.totalPaid), '', '');
  kpiHTML += kpiCard('Total Dobândă', fmt.money(result.totalInterest), 'red',
    `${fmt.pct((result.totalInterest / result.totalPaid) * 100)} din total plătit`);
  if (hasInsurance) {
    kpiHTML += kpiCard('Total Asigurare', fmt.money(result.totalInsurance), 'amber',
      `${fmt.pct((result.totalInsurance / result.totalPaid) * 100)} din total plătit`);
  }
  kpiHTML += kpiCard('Dobândă Economisită', fmt.money(comp.interestSaved), 'green',
    hasPrepay ? `${fmt.money(comp.totalSaved)} economisit total` : 'Adaugă rambursare anticipată');
  kpiHTML += kpiCard('Perioadă Redusă',
    comp.monthsSaved > 0 ? `${Math.floor(comp.monthsSaved/12)}a ${comp.monthsSaved%12}l` : '—',
    'green', comp.monthsSaved > 0 ? `${comp.monthsSaved} luni mai devreme` : '');
  kpiHTML += kpiCard('Credit Finalizat', fmt.month(result.finalMonth), 'amber',
    `${result.finalMonth} luni totale`);
  kpiHTML += kpiCard('Dobândă Efectivă Medie', fmt.pct(result.effectiveRate) + '/an', 'teal',
    'Calculat pe durata reală');

  el('kpiGrid').innerHTML = kpiHTML;

  // ── DECISION ──────────────────────────────────────────────
  el('decisionContent').innerHTML = `
    <div class="decision-box">
      <div class="decision-icon">💡</div>
      <div class="decision-text">
        Fiecare leu rambursat anticipat îți oferă un randament garantat de
        <strong>${fmt.pct(result.effectiveRate)} anual</strong>,
        echivalent cu un instrument fără risc garantat de stat —
        superior oricărui depozit bancar în condiții normale de piață.
      </div>
    </div>
    <div class="decision-stats">
      ${decStat('Randament implicit',     fmt.pct(result.effectiveRate))}
      ${decStat('Dobândă economisită',    fmt.money(comp.interestSaved))}
      ${decStat('Luni economiste',        comp.monthsSaved + ' luni')}
      ${decStat('Cost total / creditat',  fmt.pct((result.totalInterest / params.loanAmount) * 100))}
    </div>
  `;

  // ── CHARTS ────────────────────────────────────────────────
  renderCharts(result, baseResult, params);

  // ── TABLE ─────────────────────────────────────────────────
  state.tableData = result.schedule;
  state.tablePage = 1;

  // Hartă lună → rând din scenariul de bază (pentru coloana Economie Lunară)
  state.baseScheduleMap = {};
  (baseResult.schedule || []).forEach(r => { state.baseScheduleMap[r.month] = r; });

  renderTable();

  state.simulationResult = result;
  state._params          = params;
  state._baseResult      = baseResult;

  el('section-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function kpiCard(label, value, type, sub) {
  return `<div class="kpi-card ${type}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function decStat(label, val) {
  return `<div class="decision-stat">
    <div class="decision-stat-label">${label}</div>
    <div class="decision-stat-val">${val}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════
function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); state.charts[key] = null; }
}

const chartOpts = {
  responsive: true,
  animation: { duration: 400 },
  plugins: {
    legend: {
      labels: { color: '#6b8099', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 11 }
    },
    tooltip: {
      backgroundColor: '#0e0f1a',
      borderColor: '#1f2435',
      borderWidth: 1,
      titleColor: '#e0e8f4',
      bodyColor: '#6b8099',
      titleFont: { family: 'JetBrains Mono', size: 11 },
      bodyFont:  { family: 'JetBrains Mono', size: 11 },
    }
  },
  scales: {
    x: {
      ticks: { color: '#2d4055', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 12 },
      grid:  { color: '#151c28' }
    },
    y: {
      ticks: { color: '#2d4055', font: { family: 'JetBrains Mono', size: 9 } },
      grid:  { color: '#151c28' }
    }
  }
};

function renderCharts(result, baseResult, params) {
  const sched    = result.schedule;
  const nMonths  = sched.length;
  const step     = nMonths > 240 ? 6 : nMonths > 120 ? 3 : 1;
  const filtered = sched.filter((_, i) => i % step === 0);
  const labels   = filtered.map(r => `L${r.month}`);

  // 1. IRCC evolution
  destroyChart('ircc');
  state.charts.ircc = new Chart(el('chartIRCC'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'IRCC %',
          data: filtered.map(r => +r.ircc.toFixed(4)),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.07)',
          borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true,
        },
        {
          label: 'DAE %',
          data: filtered.map(r => +r.annualRate.toFixed(4)),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.04)',
          borderWidth: 1.5, tension: 0.3, pointRadius: 0, fill: false,
          borderDash: [4, 3],
        }
      ]
    },
    options: { ...chartOpts }
  });

  // 2. Monthly rate
  destroyChart('rate');
  state.charts.rate = new Chart(el('chartRate'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Rată lunară (${fmt.sym()})`,
        data: filtered.map(r => +r.payment.toFixed(2)),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.07)',
        borderWidth: 2, tension: 0.1, pointRadius: 0, fill: true,
      }]
    },
    options: {
      ...chartOpts,
      scales: {
        ...chartOpts.scales,
        y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => fmt.money(v) } }
      }
    }
  });

  // 3. Balance
  destroyChart('balance');
  state.charts.balance = new Chart(el('chartBalance'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Sold rămas (${fmt.sym()})`,
        data: filtered.map(r => +r.balance.toFixed(2)),
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74,222,128,0.07)',
        borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true,
      }]
    },
    options: {
      ...chartOpts,
      scales: {
        ...chartOpts.scales,
        y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => (v/1000).toFixed(0)+'k' } }
      }
    }
  });

  // 4. Comparison with/without prepay
  const bStep = Math.max(step, baseResult.schedule.length > 240 ? 6 : 3);
  const bFilt = baseResult.schedule.filter((_, i) => i % bStep === 0);
  const rFilt = result.schedule.filter((_, i) => i % bStep === 0);
  const maxLen = Math.max(bFilt.length, rFilt.length);
  const cLabels = Array.from({ length: maxLen }, (_, i) => `L${(i+1)*bStep}`);

  destroyChart('comparison');
  state.charts.comparison = new Chart(el('chartComparison'), {
    type: 'line',
    data: {
      labels: cLabels,
      datasets: [
        {
          label: `Fără rambursare`,
          data: bFilt.map(r => +r.balance.toFixed(2)),
          borderColor: '#f87171',
          backgroundColor: 'rgba(248,113,113,0.05)',
          borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true,
        },
        {
          label: `Cu rambursare`,
          data: rFilt.map(r => +r.balance.toFixed(2)),
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74,222,128,0.05)',
          borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true,
        }
      ]
    },
    options: {
      ...chartOpts,
      scales: {
        ...chartOpts.scales,
        y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: v => (v/1000).toFixed(0)+'k' } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// TABEL AMORTIZARE
// ═══════════════════════════════════════════════════════════════
const PAGE_SIZE = 50;

function renderTable(filterText = '') {
  const allRows  = state.tableData || [];
  const filtered = filterText
    ? allRows.filter(r =>
        String(r.month).includes(filterText) ||
        fmt.month(r.month).toLowerCase().includes(filterText.toLowerCase()))
    : allRows;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  state.tablePage  = Math.max(1, Math.min(state.tablePage || 1, totalPages));

  const start = (state.tablePage - 1) * PAGE_SIZE;
  const rows  = filtered.slice(start, start + PAGE_SIZE);

  el('amortBody').innerHTML = rows.map(r => {
    const cls = [
      r.isFixed         ? 'is-fixed'    : '',
      r.irccChanged     ? 'ircc-changed' : '',
      r.extraPrepay > 0 ? 'has-prepay'  : '',
    ].filter(Boolean).join(' ');

    // Economie lunară = cât mai puțină dobândă plătești ÎN LUNA ASTA față de baza
    const baseRow      = state.baseScheduleMap?.[r.month];
    const savedMonthly = baseRow ? Math.max(0, baseRow.interestPart - r.interestPart) : 0;

    return `<tr class="${cls}">
      <td>${fmt.month(r.month)}</td>
      <td>${r.isFixed ? '<span style="color:var(--amber)">FIXAT</span>' : fmt.pct(r.ircc)}</td>
      <td>${fmt.pct(r.annualRate)}</td>
      <td>${fmt.money(r.payment)}</td>
      <td style="color:var(--amber)">${r.insurancePart > 0 ? fmt.money(r.insurancePart) : '—'}</td>
      <td>${fmt.money(r.totalPayment)}</td>
      <td>${fmt.money(r.interestPart)}</td>
      <td>${fmt.money(r.principalPart)}</td>
      <td>${r.extraPrepay > 0 ? fmt.money(r.extraPrepay) : '—'}</td>
      <td style="color:var(--t1);font-weight:600">${fmt.money(r.totalPayment + r.extraPrepay)}</td>
      <td style="color:var(--green)">${savedMonthly > 0.005 ? '+' + fmt.money(savedMonthly) : '—'}</td>
      <td>${fmt.money(r.balance)}</td>
    </tr>`;
  }).join('');

  // Paginare
  const pg = el('tablePagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }

  const cur = state.tablePage;
  const range = 2;
  const pages = [];

  if (cur > range + 2) pages.push(1, '…');
  else for (let i = 1; i < Math.min(cur, range + 1); i++) pages.push(i);

  for (let i = Math.max(1, cur - range); i <= Math.min(totalPages, cur + range); i++) pages.push(i);

  if (cur < totalPages - range - 1) pages.push('…', totalPages);
  else for (let i = Math.max(cur + 1, totalPages - range); i <= totalPages; i++) pages.push(i);

  pg.innerHTML = `
    <button class="page-btn" onclick="changePage(${cur-1})" ${cur===1?'disabled':''}>‹</button>
    ${[...new Set(pages)].map(p =>
      p === '…'
        ? `<span class="page-info">…</span>`
        : `<button class="page-btn ${p===cur?'active':''}" onclick="changePage(${p})">${p}</button>`
    ).join('')}
    <button class="page-btn" onclick="changePage(${cur+1})" ${cur===totalPages?'disabled':''}>›</button>
    <span class="page-info">${filtered.length} luni</span>
  `;
}

function changePage(p) {
  state.tablePage = p;
  renderTable(el('tableSearch')?.value || '');
}

// ═══════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════
function exportCSV() {
  const sched = state.tableData || [];
  const header = 'An,Luna,Luna Nr.,Tip,IRCC%,DAE%,Rata Baza,Asigurare,Rata+Asig.,Dobanda,Principal,Ramb.Sup.,Total,Economie Lunara,Sold Ramas\n';
  const rows = sched.map(r => {
    const yr = Math.floor((r.month - 1) / 12) + 1;
    const mn = ((r.month - 1) % 12) + 1;
    const tip = r.isFixed ? 'FIXA' : 'IRCC';
    const baseRow = state.baseScheduleMap?.[r.month];
    const savedMonthly = baseRow ? Math.max(0, baseRow.interestPart - r.interestPart) : 0;
    return [yr, mn, r.month, tip,
      r.ircc.toFixed(4), r.annualRate.toFixed(4),
      r.payment.toFixed(2), r.insurancePart.toFixed(2), r.totalPayment.toFixed(2),
      r.interestPart.toFixed(2), r.principalPart.toFixed(2),
      r.extraPrepay.toFixed(2), (r.totalPayment + r.extraPrepay).toFixed(2),
      savedMonthly.toFixed(2), r.balance.toFixed(2)].join(',');
  });
  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'credit_ipotecar.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// STRESS TEST RENDER
// ═══════════════════════════════════════════════════════════════
function renderStressTest() {
  if (!state._params) return;
  const stressResult = runStressTest(state._params, 2);
  const orig = state.simulationResult;

  const origRate   = orig.schedule[0]?.payment || 0;
  const stressRate = stressResult.schedule[0]?.payment || 0;
  const delta      = stressRate - origRate;

  // Găsim prima rată din P2 (variabilă) pentru stress test
  const p1m = state._params.period1Months || 0;
  const origP2Rate   = orig.schedule[p1m]?.payment || origRate;
  const stressP2Rate = stressResult.schedule[p1m]?.payment || stressRate;
  const deltaP2 = stressP2Rate - origP2Rate;

  el('stressContent').innerHTML = `
    <div class="stress-grid">
      ${stressItem('Rată Variabilă Nouă', fmt.money(stressP2Rate), '')}
      ${stressItem('Impact Lunar', '+' + fmt.money(deltaP2), `vs ${fmt.money(origP2Rate)}`)}
      ${stressItem('Impact Anual', '+' + fmt.money(deltaP2 * 12), 'extra pe an')}
      ${stressItem('Dobândă Extra', '+' + fmt.money(stressResult.totalInterest - orig.totalInterest), 'cost suplimentar total')}
    </div>
  `;
}

function stressItem(label, value, delta) {
  return `<div class="stress-item">
    <div class="stress-label">${label}</div>
    <div class="stress-value">${value}</div>
    ${delta ? `<div class="stress-delta">${delta}</div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// UI: MODEL IRCC PARAMS
// ═══════════════════════════════════════════════════════════════
function renderIRCCParams() {
  const container = el('irccModelParams');
  const model     = state.irccModel;

  if (model === 'constant') {
    container.innerHTML = `<p class="hint">IRCC rămâne constant la valoarea inițială pe toată durata variabilă.</p>`;
  } else if (model === 'increase') {
    container.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="field">
          <label>Rată anuală de creștere IRCC</label>
          <div class="input-wrap">
            <input type="number" id="irccLinearRate" value="0.25" min="0" max="5" step="0.05">
            <span class="unit">%/AN</span>
          </div>
        </div>
      </div>`;
  } else if (model === 'decrease') {
    container.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="field">
          <label>Rată anuală de scădere IRCC</label>
          <div class="input-wrap">
            <input type="number" id="irccLinearRate" value="0.25" min="0" max="5" step="0.05">
            <span class="unit">%/AN</span>
          </div>
        </div>
      </div>`;
  } else if (model === 'custom') {
    container.innerHTML = `
      <div class="field">
        <label>Valori IRCC (separate prin virgulă, una per perioadă de actualizare)</label>
        <textarea id="irccCustomValues" placeholder="5.99, 6.25, 6.50, 6.75, 7.00, 6.80 …"></textarea>
        <p class="hint">Fiecare valoare = o perioadă de actualizare (trimestru/semestru). Ultima valoare se repetă dacă lista e mai scurtă.</p>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// UI: PLĂȚI LUNARE RECURENTE
// ═══════════════════════════════════════════════════════════════
function renderRecurringList() {
  const container  = el('recurringList');
  const maxYears   = numEl('loanDuration') || 30;
  const currUnit   = fmt.unit();

  if (state.recurringPrepays.length === 0) {
    container.innerHTML = `<p class="hint" style="margin-top:0">Nicio plată suplimentară adăugată.</p>`;
    return;
  }

  container.innerHTML = state.recurringPrepays.map((rp, i) => `
    <div class="pay-row">
      <div class="field">
        <label>De la an</label>
        <div class="input-wrap">
          <input type="number" class="rp-fromYear" data-idx="${i}"
            value="${rp.fromYear}" min="1" max="${maxYears}">
          <span class="unit">AN</span>
        </div>
      </div>
      <div class="field">
        <label>Până la an</label>
        <div class="input-wrap">
          <input type="number" class="rp-toYear" data-idx="${i}"
            value="${rp.toYear || maxYears}" min="1" max="${maxYears}">
          <span class="unit">AN</span>
        </div>
      </div>
      <div class="field">
        <label>Extra / lună</label>
        <div class="input-wrap">
          <input type="number" class="rp-amount" data-idx="${i}"
            value="${rp.amount}" min="0" step="100">
          <span class="unit currency-unit">${currUnit}</span>
        </div>
      </div>
      <button class="btn-remove" onclick="removeRecurring(${i})">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.rp-fromYear').forEach(inp => inp.addEventListener('change', () => {
    state.recurringPrepays[+inp.dataset.idx].fromYear = parseInt(inp.value) || 1;
  }));
  container.querySelectorAll('.rp-toYear').forEach(inp => inp.addEventListener('change', () => {
    state.recurringPrepays[+inp.dataset.idx].toYear = parseInt(inp.value) || 0;
  }));
  container.querySelectorAll('.rp-amount').forEach(inp => inp.addEventListener('change', () => {
    state.recurringPrepays[+inp.dataset.idx].amount = parseFloat(inp.value) || 0;
  }));
}

function addRecurring() {
  const maxYears = numEl('loanDuration') || 30;
  state.recurringPrepays.push({ fromYear: 1, toYear: maxYears, amount: 500 });
  renderRecurringList();
}

function removeRecurring(i) {
  state.recurringPrepays.splice(i, 1);
  renderRecurringList();
}

// ═══════════════════════════════════════════════════════════════
// UI: RAMBURSĂRI OCAZIONALE (lump sum)
// ═══════════════════════════════════════════════════════════════
function renderOnetimeList() {
  const container = el('onetimeList');
  const currUnit  = fmt.unit();

  if (state.onetimePayments.length === 0) {
    container.innerHTML = `<p class="hint" style="margin-top:0">Nicio rambursare ocazională adăugată.</p>`;
    return;
  }

  container.innerHTML = state.onetimePayments.map((p, i) => `
    <div class="onetime-row">
      <div class="field">
        <label>An</label>
        <div class="input-wrap">
          <input type="number" class="ot-year" data-idx="${i}"
            value="${p.year}" min="1" max="30">
          <span class="unit" style="font-size:0.55rem">AN</span>
        </div>
      </div>
      <div class="field">
        <label>Luna</label>
        <div class="input-wrap">
          <input type="number" class="ot-month" data-idx="${i}"
            value="${p.month}" min="1" max="12">
          <span class="unit" style="font-size:0.55rem">L</span>
        </div>
      </div>
      <div class="field">
        <label>Suma</label>
        <div class="input-wrap">
          <input type="number" class="ot-amount" data-idx="${i}"
            value="${p.amount}" min="0" step="500">
          <span class="unit currency-unit">${currUnit}</span>
        </div>
      </div>
      <button class="btn-remove" onclick="removeOnetime(${i})">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.ot-year').forEach(inp => inp.addEventListener('change', () => {
    state.onetimePayments[+inp.dataset.idx].year = parseInt(inp.value) || 1;
  }));
  container.querySelectorAll('.ot-month').forEach(inp => inp.addEventListener('change', () => {
    state.onetimePayments[+inp.dataset.idx].month = parseInt(inp.value) || 1;
  }));
  container.querySelectorAll('.ot-amount').forEach(inp => inp.addEventListener('change', () => {
    state.onetimePayments[+inp.dataset.idx].amount = parseFloat(inp.value) || 0;
  }));
}

function addOnetime() {
  state.onetimePayments.push({ year: 5, month: 1, amount: 20000 });
  renderOnetimeList();
}

function removeOnetime(i) {
  state.onetimePayments.splice(i, 1);
  renderOnetimeList();
}

// ═══════════════════════════════════════════════════════════════
// CURRENCY UPDATE
// ═══════════════════════════════════════════════════════════════
function updateCurrencyUnits() {
  const unit = fmt.unit();
  document.querySelectorAll('.currency-unit').forEach(el => { el.textContent = unit; });
  renderRecurringList();
  renderOnetimeList();
}

// ═══════════════════════════════════════════════════════════════
// SIMULARE PRINCIPALĂ
// ═══════════════════════════════════════════════════════════════
function simulate() {
  const amount = numEl('loanAmount');
  const years  = numEl('loanDuration');
  if (amount <= 0 || years <= 0) {
    alert('Introdu o sumă și o durată validă!');
    return;
  }

  const btn = el('btnSimulate');
  btn.innerHTML = '⌛ Calculez…';
  btn.disabled  = true;

  setTimeout(() => {
    try {
      const params = collectParams();

      // Scenariul de bază (fără rambursări anticipate, dar cu asigurare)
      const baseParams = {
        ...params,
        monthlyExtra:    new Array(params.durationMonths + 1).fill(0),
        onetimePayments: [],
      };
      const baseResult = simulateMonthByMonth(baseParams);
      const fullResult = simulateMonthByMonth(params);

      renderResults(fullResult, baseResult, params);
    } catch (e) {
      console.error(e);
      alert('Eroare la calcul: ' + e.message);
    }

    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5L13 8L3 13.5V2.5Z"/></svg> Simulează Credit';
    btn.disabled  = false;
  }, 30);
}

// ═══════════════════════════════════════════════════════════════
// TOGGLE SETUP HELPER
// ═══════════════════════════════════════════════════════════════
function setupToggle(containerId, stateKey, cb) {
  el(containerId)?.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el(containerId).querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state[stateKey] = btn.dataset.value;
      if (cb) cb(btn.dataset.value);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Currency toggle
  el('currencyToggle')?.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el('currencyToggle').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currency = btn.dataset.value;
      updateCurrencyUnits();
    });
  });

  // Toggles
  setupToggle('rateTypeToggle',    'rateType');
  setupToggle('prepayOptionToggle','prepayOption');

  // IRCC freq toggle (valori numerice)
  el('irccFreqToggle')?.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el('irccFreqToggle').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.irccFreq = parseInt(btn.dataset.value);
    });
  });

  // IRCC model tabs
  document.querySelectorAll('.model-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.model-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.irccModel = btn.dataset.model;
      renderIRCCParams();
    });
  });

  renderIRCCParams();
  renderRecurringList();
  renderOnetimeList();

  el('btnAddRecurring')?.addEventListener('click', addRecurring);
  el('btnAddOnetime')?.addEventListener('click',   addOnetime);
  el('btnSimulate')?.addEventListener('click',     simulate);
  el('btnStress')?.addEventListener('click',       renderStressTest);
  el('btnExportCSV')?.addEventListener('click',    exportCSV);

  el('tableSearch')?.addEventListener('input', e => {
    state.tablePage = 1;
    renderTable(e.target.value);
  });

  // ── SINCRONIZARE totalVariableRate ↔ bankMargin ↔ initialIRCC ──────────
  // Regula: totalVariableRate = IRCC + marjă
  // Orice câmp modificat recalculează IRCC

  function syncIRCC() {
    const total  = parseFloat(el('totalVariableRate')?.value) || 0;
    const margin = parseFloat(el('bankMargin')?.value) || 0;
    const ircc   = Math.max(0, total - margin);
    if (el('initialIRCC')) el('initialIRCC').value = ircc.toFixed(2);
  }

  function syncTotal() {
    const ircc   = parseFloat(el('initialIRCC')?.value) || 0;
    const margin = parseFloat(el('bankMargin')?.value) || 0;
    if (el('totalVariableRate')) el('totalVariableRate').value = (ircc + margin).toFixed(2);
  }

  // Inițializare: calculăm IRCC din totalVariableRate și marjă
  syncIRCC();

  el('totalVariableRate')?.addEventListener('input', syncIRCC);
  el('bankMargin')?.addEventListener('input', syncIRCC);
  el('initialIRCC')?.addEventListener('input', syncTotal);

  // ── AVANS (Down Payment) Calculator ─────────────────────────────
  // Avansul NU face parte din credit.
  // Credit = Valoare Imobil − Avans
  function updateLoanFromAvans() {
    const propVal = parseFloat(el('propertyValue')?.value) || 0;
    const pct     = parseFloat(el('downPaymentPct')?.value) || 0;

    if (propVal <= 0) {
      if (el('downPaymentAmt')) el('downPaymentAmt').value = '';
      return;
    }

    const avans  = +(propVal * pct / 100).toFixed(2);
    const credit = Math.max(0, propVal - avans);

    if (el('downPaymentAmt')) el('downPaymentAmt').value = avans.toFixed(2);
    if (el('loanAmount'))     el('loanAmount').value     = Math.round(credit);
  }

  el('propertyValue')?.addEventListener('input',  updateLoanFromAvans);
  el('downPaymentPct')?.addEventListener('input', updateLoanFromAvans);
  updateLoanFromAvans(); // aplică valorile default la încărcare

  // Ctrl+Enter simulează
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) simulate();
  });
});
