/**
 * SIMULATOR CREDIT IPOTECAR v2.1
 * ================================
 * FIX CRITIC: Costul de evaluare NU se deduce din principal.
 *   - Credit = suma introdusă de utilizator (ex: 408,000)
 *   - Costul de evaluare (ex: 509.57) = taxă upfront separată
 *   - Anuitatea se calculează pe suma completă a creditului
 *   - Asigurarea = % din soldul la ÎNCEPUTUL lunii (înainte de rată)
 *
 * Verificare luna 1 (408,000 RON, 4.79%/an, 360 luni, asig. 0.026%):
 *   Dobândă    = 408,000 × 4.79/100/12 = 1,628.60
 *   Anuitate   = 2,138.17
 *   Principal  = 509.57 → Sold = 407,490.43
 *   Asigurare  = 408,000 × 0.026/100 = 106.08
 *   Total      = 2,138.17 + 106.08 = 2,244.25 ✓
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const state = {
  rateType:        'annuity',
  irccFreq:        3,
  irccModel:       'constant',
  prepayOption:    'reduce_period',
  currency:        'RON',
  lang:            'ro',
  recurringPrepays: [],
  onetimePayments:  [],
  simulationResult: null,
  baseResult:       null,
  _params:          null,
  _baseResult:      null,
  _stressRan:       false,
  charts:           {},
  tableData:        [],
  tablePage:        1,
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function el(id)    { return document.getElementById(id); }
function numEl(id) { return parseFloat(el(id)?.value) || 0; }

const fmt = {
  money: v => {
    const n = Number(v), abs = Math.abs(n);
    const str = abs.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = n < 0 ? '-' : '';
    return state.currency === 'EUR' ? sign + '€' + str : sign + str + ' RON';
  },
  unit:  () => state.currency === 'EUR' ? 'EUR' : 'RON',
  sym:   () => state.currency === 'EUR' ? '€' : 'RON',
  pct:   v  => Number(v).toFixed(2) + '%',
  month: v  => {
    const y = Math.floor((v - 1) / 12) + 1;
    const m = ((v - 1) % 12) + 1;
    return state.lang === 'en' ? `Yr ${y}, M${String(m).padStart(2,'0')}` : `An ${y}, L${String(m).padStart(2,'0')}`;
  },
};

// ═══════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════
const LANG = {
  ro: {
    header_subtitle:'Simulator IRCC · România', header_status:'Calculator activ',
    sec_params:'Parametri Credit', sec_rates:'Structura Dobânzii', sec_ircc:'Evoluție IRCC',
    sec_prepay:'Rambursare Anticipată', sec_results:'Rezultate', sec_decision:'Analiză Decizională',
    sec_stress:'Stress Test', sec_charts:'Grafice', sec_table:'Tabel Amortizare',
    currency_lbl:'Monedă', eur_rate:'Curs EUR', loan_amount:'Sumă Credit',
    evaluation_cost:'Cost Evaluare', kpi_evaluation_cost:'Cost Evaluare (upfront)',
    loan_duration:'Durată Credit', rate_type:'Tip Rată', annuity:'Anuitate', decreasing:'Descrescătoare',
    insurance_rate:'Asigurare Viață', pct_sold:'% lunar din sold',
    avans_title:'Calcul Avans', avans_desc:'Completează valoarea imobilului pentru a calcula automat avansul și creditul',
    property_value:'Valoare Imobil', down_pct:'Procent Avans', down_amt:'Sumă Avans', calculated_auto:'calculat automat',
    hint_avans:'Avansul se plătește direct vânzătorului și <strong>nu face parte din credit</strong>. Credit = Valoare imobil − Avans.',
    hint_insurance:'Asigurarea se calculează lunar ca <strong>% din soldul la începutul lunii</strong> și se adaugă la rată.',
    hint_evaluation:'Costul de evaluare este o <strong>taxă upfront separată</strong>, nu se deduce din principalul creditului.',
    period1_title:'Perioadă Fixă', optional_tag:'opțional', period1_desc:'Dobândă fixă — de obicei primii 3–5 ani',
    period1_dur:'Durată perioadă fixă', period1_rate:'Dobândă anuală fixă',
    hint_p1:'Setează durata la <strong>0 ani</strong> dacă creditul nu are perioadă fixă.',
    period_then:'apoi', period2_title:'Perioadă Variabilă', period2_desc:'IRCC + Marjă bancă — restul duratei creditului',
    total_var_rate:'Dobândă totală variabilă', ircc_margin_note:'IRCC + marjă', bank_margin:'Marjă bancă',
    ircc_label:'IRCC', ircc_update:'Actualizare IRCC', quarterly:'Trimestrial', semiannual:'Semestrial',
    applicable_p2:'Aplicabil perioadei variabile (P2)',
    model_constant:'Constant', model_increase:'Crește', model_decrease:'Scade', model_custom:'Custom',
    hint_ircc_constant:'IRCC rămâne constant la valoarea inițială pe toată durata variabilă.',
    ircc_increase_label:'Rată anuală de creștere IRCC', ircc_decrease_label:'Rată anuală de scădere IRCC',
    ircc_custom_label:'Valori IRCC (separate prin virgulă, una per perioadă de actualizare)',
    ircc_custom_ph:'5.99, 6.25, 6.50, 6.75, 7.00, 6.80 …',
    hint_ircc_custom:'Fiecare valoare = o perioadă de actualizare. Ultima valoare se repetă.',
    prepay_option:'La rambursare anticipată', reduce_period:'Reduc Perioada', reduce_rate:'Reduc Rata',
    recurring_title:'Plăți Lunare Suplimentare', recurring_desc:'Specifică intervale de ani în care plătești o sumă fixă extra.',
    onetime_title:'Rambursări Ocazionale', onetime_desc:'Sume plătite o singură dată (injectare de capital).',
    btn_add_recurring:'+ Adaugă interval', btn_add_onetime:'+ Adaugă rambursare',
    no_recurring:'Nicio plată suplimentară adăugată.', no_onetime:'Nicio rambursare ocazională adăugată.',
    rp_from:'De la an', rp_to:'Până la an', rp_extra:'Extra / lună',
    ot_year:'An', ot_month_lbl:'Luna', ot_amount:'Suma',
    simulate_btn:'Simulează Credit', simulating:'⌛ Calculez…',
    alert_invalid:'Introdu o sumă și o durată validă!', alert_error:'Eroare la calcul: ',
    stress_btn:'⚡ Simulează +2% IRCC', search_placeholder:'Caută luna…',
    th_month:'Luna', th_ircc:'IRCC %', th_dae:'DAE %', th_rate:'Rată', th_insurance:'Asigurare',
    th_rate_ins:'Rată + Asig.', th_interest:'Dobândă', th_principal:'Principal',
    th_prepay:'Ramb. Sup.', th_total:'Total', th_savings:'Economie Lunară', th_balance:'Sold Rămas',
    fixed_tag:'FIXAT', pagination_months:'luni',
    chart_ircc_title:'Evoluție IRCC', chart_rate_title:'Rată Lunară',
    chart_balance_title:'Sold Rămas', chart_cmp_title:'Cu vs. Fără Rambursare',
    chart_dae_series:'DAE %',
    chart_monthly_rate: sym => `Rată lunară (${sym})`,
    chart_balance_lbl:  sym => `Sold rămas (${sym})`,
    chart_no_prepay:'Fără rambursare', chart_with_prepay:'Cu rambursare',
    kpi_p1_total:'Total Lunar P1 (cu asig.)', kpi_p2_initial:'Total Lunar P2 Inițial (cu asig.)',
    kpi_monthly_initial:'Total Lunar Inițial (cu asig.)', kpi_max_monthly:'Total Lunar Maxim',
    kpi_total_paid:'Total Plătit', kpi_total_interest:'Total Dobândă', kpi_total_insurance:'Total Asigurare',
    kpi_interest_saved:'Dobândă Economisită', kpi_period_reduced:'Perioadă Redusă',
    kpi_loan_finished:'Credit Finalizat', kpi_effective_rate:'Dobândă Efectivă Medie',
    kpi_add_prepay:'Adaugă rambursare anticipată', kpi_total_saved:'economisit total',
    kpi_from_total:'din total plătit', kpi_months_earlier:'luni mai devreme',
    kpi_months_total:'luni totale', kpi_calculated:'Calculat pe durata reală',
    kpi_per_year:'/an', years_short:'a', months_short:'l', ins_abbr:'asig.',
    decision_body: rate => `Fiecare leu rambursat anticipat îți oferă un randament garantat de <strong>${rate} anual</strong>, echivalent cu un instrument fără risc garantat de stat — superior oricărui depozit bancar în condiții normale de piață.`,
    decision_implicit:'Randament implicit', decision_int_saved:'Dobândă economisită',
    decision_mon_saved:'Luni economiste', decision_cost:'Cost total / creditat',
    stress_p2_rate:'Rată Variabilă Nouă', stress_monthly:'Impact Lunar',
    stress_annual:'Impact Anual', stress_extra_int:'Dobândă Extra',
    stress_extra_yr:'extra pe an', stress_extra_tot:'cost suplimentar total',
    csv_header:'An,Luna,Luna Nr.,Tip,IRCC%,DAE%,Rata Baza,Asigurare,Rata+Asig.,Dobanda,Principal,Ramb.Sup.,Total,Economie Lunara,Sold Ramas\n',
    csv_fixed:'FIXA', csv_ircc:'IRCC',
    footer_text:'Simulator Credit Ipotecar · Calcule orientative · Nu constituie consultanță financiară',
  },
  en: {
    header_subtitle:'IRCC Simulator · Romania', header_status:'Calculator active',
    sec_params:'Loan Parameters', sec_rates:'Interest Structure', sec_ircc:'IRCC Evolution',
    sec_prepay:'Early Repayment', sec_results:'Results', sec_decision:'Decision Analysis',
    sec_stress:'Stress Test', sec_charts:'Charts', sec_table:'Amortization Table',
    currency_lbl:'Currency', eur_rate:'EUR Rate', loan_amount:'Loan Amount',
    evaluation_cost:'Evaluation Cost / Fees', kpi_evaluation_cost:'Evaluation Cost (upfront)',
    loan_duration:'Loan Duration', rate_type:'Payment Type', annuity:'Annuity', decreasing:'Decreasing',
    insurance_rate:'Life Insurance', pct_sold:'% monthly on balance',
    avans_title:'Down Payment', avans_desc:'Fill in property value to auto-calculate down payment and loan amount',
    property_value:'Property Value', down_pct:'Down Payment %', down_amt:'Down Payment Amount', calculated_auto:'auto-calculated',
    hint_avans:'Down payment is paid directly to the seller and <strong>is not part of the loan</strong>. Loan = Property value − Down payment.',
    hint_insurance:'Insurance is calculated monthly as <strong>% of balance at start of month</strong> and added to the payment.',
    hint_evaluation:'Evaluation cost is an <strong>upfront fee, separate from loan principal</strong>. It is not deducted from the loan amount.',
    period1_title:'Fixed Period', optional_tag:'optional', period1_desc:'Fixed interest — usually first 3–5 years',
    period1_dur:'Fixed period duration', period1_rate:'Fixed annual interest rate',
    hint_p1:'Set duration to <strong>0 years</strong> if the loan has no fixed period.',
    period_then:'then', period2_title:'Variable Period', period2_desc:'IRCC + Bank margin — rest of loan duration',
    total_var_rate:'Total variable interest', ircc_margin_note:'IRCC + margin', bank_margin:'Bank margin',
    ircc_label:'IRCC', ircc_update:'IRCC Update', quarterly:'Quarterly', semiannual:'Semi-annual',
    applicable_p2:'Applicable to variable period (P2)',
    model_constant:'Constant', model_increase:'Increases', model_decrease:'Decreases', model_custom:'Custom',
    hint_ircc_constant:'IRCC remains constant at the initial value for the entire variable period.',
    ircc_increase_label:'IRCC annual increase rate', ircc_decrease_label:'IRCC annual decrease rate',
    ircc_custom_label:'IRCC values (comma-separated, one per update period)',
    ircc_custom_ph:'5.99, 6.25, 6.50, 6.75, 7.00, 6.80 …',
    hint_ircc_custom:'Each value = one update period. The last value repeats if the list is shorter.',
    prepay_option:'On early repayment', reduce_period:'Reduce Period', reduce_rate:'Reduce Payment',
    recurring_title:'Additional Monthly Payments', recurring_desc:'Specify year intervals for fixed extra payments.',
    onetime_title:'One-time Repayments', onetime_desc:'Specific amounts paid once (capital injection).',
    btn_add_recurring:'+ Add interval', btn_add_onetime:'+ Add repayment',
    no_recurring:'No additional payments added.', no_onetime:'No one-time repayments added.',
    rp_from:'From year', rp_to:'To year', rp_extra:'Extra / month',
    ot_year:'Year', ot_month_lbl:'Month', ot_amount:'Amount',
    simulate_btn:'Simulate Loan', simulating:'⌛ Calculating…',
    alert_invalid:'Enter a valid amount and duration!', alert_error:'Calculation error: ',
    stress_btn:'⚡ Simulate +2% IRCC', search_placeholder:'Search month…',
    th_month:'Month', th_ircc:'IRCC %', th_dae:'APR %', th_rate:'Payment', th_insurance:'Insurance',
    th_rate_ins:'Payment + Ins.', th_interest:'Interest', th_principal:'Principal',
    th_prepay:'Extra Prepay', th_total:'Total', th_savings:'Monthly Savings', th_balance:'Balance',
    fixed_tag:'FIXED', pagination_months:'months',
    chart_ircc_title:'IRCC Evolution', chart_rate_title:'Monthly Payment',
    chart_balance_title:'Remaining Balance', chart_cmp_title:'With vs. Without Repayment',
    chart_dae_series:'APR %',
    chart_monthly_rate: sym => `Monthly rate (${sym})`,
    chart_balance_lbl:  sym => `Remaining balance (${sym})`,
    chart_no_prepay:'Without repayment', chart_with_prepay:'With repayment',
    kpi_p1_total:'Monthly Total P1 (with ins.)', kpi_p2_initial:'Initial Monthly P2 (with ins.)',
    kpi_monthly_initial:'Initial Monthly Total (with ins.)', kpi_max_monthly:'Max Monthly Total',
    kpi_total_paid:'Total Paid', kpi_total_interest:'Total Interest', kpi_total_insurance:'Total Insurance',
    kpi_interest_saved:'Interest Saved', kpi_period_reduced:'Period Reduced',
    kpi_loan_finished:'Loan Finished', kpi_effective_rate:'Average Effective Rate',
    kpi_add_prepay:'Add early repayment', kpi_total_saved:'total saved',
    kpi_from_total:'of total paid', kpi_months_earlier:'months earlier',
    kpi_months_total:'total months', kpi_calculated:'Calculated over actual duration',
    kpi_per_year:'/yr', years_short:'y', months_short:'m', ins_abbr:'ins.',
    decision_body: rate => `Every unit repaid early gives you a guaranteed return of <strong>${rate} per year</strong>, equivalent to a risk-free state-guaranteed instrument — superior to any bank deposit in normal conditions.`,
    decision_implicit:'Implicit return', decision_int_saved:'Interest saved',
    decision_mon_saved:'Months saved', decision_cost:'Total cost / loaned',
    stress_p2_rate:'New Variable Rate', stress_monthly:'Monthly Impact',
    stress_annual:'Annual Impact', stress_extra_int:'Extra Interest',
    stress_extra_yr:'extra per year', stress_extra_tot:'total extra cost',
    csv_header:'Year,Month,Month No.,Type,IRCC%,APR%,Base Rate,Insurance,Rate+Ins.,Interest,Principal,Extra.Prepay,Total,Monthly Savings,Balance\n',
    csv_fixed:'FIXED', csv_ircc:'IRCC',
    footer_text:'Mortgage Simulator · Indicative calculations · Not financial advice',
  },
};

// ═══════════════════════════════════════════════════════════════
// IRCC SCENARIO GENERATION
// ═══════════════════════════════════════════════════════════════
function generateIRCCScenario(initialIRCC, durationMonths, model, freq) {
  if (durationMonths <= 0) return [];
  const totalPeriods = Math.ceil(durationMonths / freq);
  const periods = [];

  if (model === 'constant') {
    for (let i = 0; i < totalPeriods; i++) periods.push(initialIRCC);
  } else if (model === 'increase') {
    const rate = (parseFloat(el('irccLinearRate')?.value) || 0) * (freq / 12);
    for (let i = 0; i < totalPeriods; i++) periods.push(Math.max(0, initialIRCC + i * rate));
  } else if (model === 'decrease') {
    const rate = (parseFloat(el('irccLinearRate')?.value) || 0) * (freq / 12);
    for (let i = 0; i < totalPeriods; i++) periods.push(Math.max(0, initialIRCC - i * rate));
  } else if (model === 'custom') {
    const vals = (el('irccCustomValues')?.value || '').split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    for (let i = 0; i < totalPeriods; i++)
      periods.push(vals[i] !== undefined ? vals[i] : (vals[vals.length - 1] || initialIRCC));
  }

  const monthly = [];
  for (let i = 0; i < totalPeriods; i++)
    for (let j = 0; j < freq && monthly.length < durationMonths; j++)
      monthly.push(periods[i]);
  return monthly;
}

function generateIRCCFull(p1Months, p1Rate, margin, irccMain, totalMonths, model, freq) {
  const p1 = Math.min(p1Months, totalMonths);
  const p2 = totalMonths - p1;
  const p1Equiv = p1 > 0 ? Math.max(0, p1Rate - margin) : 0;
  const p2IRCC  = generateIRCCScenario(irccMain, p2, model, freq);
  const result  = [];
  for (let i = 0; i < p1; i++) result.push(p1Equiv);
  for (let i = 0; i < p2; i++) result.push(p2IRCC[i] ?? irccMain);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// ANNUITY FORMULA
// ═══════════════════════════════════════════════════════════════
function computeAnnuityPayment(P, r, n) {
  if (r === 0) return P / n;
  const pow = Math.pow(1 + r, n);
  return P * r * pow / (pow - 1);
}

// ═══════════════════════════════════════════════════════════════
// CORE SIMULATION
// ═══════════════════════════════════════════════════════════════
function simulateMonthByMonth(params) {
  const { loanAmount, durationMonths, margin, period1Months, irccMonthly,
          monthlyExtra, onetimePayments, rateType, prepayOption, insuranceRate = 0 } = params;

  const onetimeMap = {};
  (onetimePayments || []).forEach(({ month, amount }) => {
    onetimeMap[month] = (onetimeMap[month] || 0) + amount;
  });

  const schedule = [];
  let balance = loanAmount, remainingMonths = durationMonths;
  let currentPayment = 0, totalPaid = 0, totalInterest = 0, totalInsurance = 0;
  let month = 0, maxRate = 0, lastIRCC = null;

  while (balance > 0.01 && remainingMonths > 0) {
    month++;
    const ircc       = irccMonthly[month - 1] ?? (irccMonthly[irccMonthly.length - 1] ?? 0);
    const annualRate = ircc + margin;
    const r          = annualRate / 100 / 12;
    const irccChanged = ircc !== lastIRCC;
    const isFixed    = period1Months > 0 && month <= period1Months;
    lastIRCC = ircc;
    if (annualRate > maxRate) maxRate = annualRate;

    let payment, interestPart, principalPart;

    if (rateType === 'annuity') {
      if (currentPayment === 0) {
        // Prima lună: anuitate pe suma completă a creditului pentru durata totală
        currentPayment = computeAnnuityPayment(loanAmount, r, remainingMonths);
      } else if (irccChanged) {
        // Schimbare IRCC: recalculează pe soldul curent și lunile rămase
        currentPayment = computeAnnuityPayment(balance, r, remainingMonths);
      }
      payment       = currentPayment;
      interestPart  = balance * r;
      principalPart = Math.max(0, payment - interestPart);
    } else {
      principalPart = balance / remainingMonths;
      interestPart  = balance * r;
      payment       = principalPart + interestPart;
    }

    if (principalPart > balance) principalPart = balance;
    payment = principalPart + interestPart;

    // Asigurare = % din soldul la ÎNCEPUTUL lunii (înainte de rambursare)
    const startBalance  = balance;
    const insurancePart = startBalance * (insuranceRate / 100);

    // Rambursare anticipată
    let extraPrepay = 0;
    const baseExtra = (monthlyExtra ? (monthlyExtra[month] || 0) : 0) + (onetimeMap[month] || 0);
    if (baseExtra > 0) extraPrepay = Math.min(baseExtra, balance - principalPart);

    balance = Math.max(0, balance - principalPart - extraPrepay);
    totalPaid      += payment + extraPrepay + insurancePart;
    totalInterest  += interestPart;
    totalInsurance += insurancePart;

    schedule.push({ month, ircc, annualRate, monthlyRate: r * 100, payment, insurancePart,
      totalPayment: payment + insurancePart, interestPart, principalPart, extraPrepay, balance,
      irccChanged, isFixed });

    remainingMonths--;
    if (prepayOption === 'reduce_rate' && extraPrepay > 0 && rateType === 'annuity')
      currentPayment = computeAnnuityPayment(balance, r, remainingMonths);
    if (balance < 0.01) break;
  }

  const actualYears   = month / 12;
  const effectiveRate = actualYears > 0 ? (totalInterest / loanAmount / actualYears) * 100 : 0;
  return { schedule, totalPaid, totalInterest, totalInsurance, finalMonth: month, maxRate, effectiveRate };
}

// ═══════════════════════════════════════════════════════════════
// COMPARATIVE ANALYSIS & STRESS TEST
// ═══════════════════════════════════════════════════════════════
function runComparativeAnalysis(base, prepay) {
  return { interestSaved: base.totalInterest - prepay.totalInterest,
           monthsSaved:   base.finalMonth    - prepay.finalMonth,
           totalSaved:    base.totalPaid     - prepay.totalPaid };
}

function runStressTest(params, delta) {
  const p1m = params.period1Months || 0;
  return simulateMonthByMonth({
    ...params,
    irccMonthly: params.irccMonthly.map((v, i) => i < p1m ? v : v + delta)
  });
}

// ═══════════════════════════════════════════════════════════════
// COLLECT PARAMS — FIX CRITIC APLICAT AICI
// ═══════════════════════════════════════════════════════════════
function collectParams() {
  // ★ FIX: loanAmount = suma completă a creditului (fără deducere cost evaluare)
  const loanAmount     = numEl('loanAmount');     // 408,000 → rămâne 408,000
  const evaluationCost = numEl('evaluationCost'); // 509.57 → taxă upfront separată
  const durationYears  = numEl('loanDuration');
  const margin         = numEl('bankMargin');
  const initialIRCC    = numEl('initialIRCC');
  const period1Years   = numEl('period1Years');
  const period1Rate    = numEl('period1Rate');
  const insuranceRate  = numEl('insuranceRate');
  const durationMonths = Math.round(durationYears * 12);
  const period1Months  = Math.min(Math.round(period1Years * 12), durationMonths);

  const irccMonthly = generateIRCCFull(
    period1Months, period1Rate, margin, initialIRCC, durationMonths, state.irccModel, state.irccFreq
  );

  const monthlyExtra = new Array(durationMonths + 1).fill(0);
  for (const rp of state.recurringPrepays) {
    if (!rp.amount || rp.amount <= 0) continue;
    const fromM = Math.max(1, (rp.fromYear - 1) * 12 + 1);
    const toM   = (rp.toYear <= 0 ? durationYears : rp.toYear) * 12;
    for (let m = fromM; m <= Math.min(durationMonths, toM); m++) monthlyExtra[m] += rp.amount;
  }

  const onetimeAbsolute = state.onetimePayments
    .map(p => ({ month: (p.year - 1) * 12 + p.month, amount: p.amount }))
    .filter(p => p.amount > 0 && p.month >= 1 && p.month <= durationMonths);

  return { loanAmount, evaluationCost, durationMonths, durationYears, margin,
           initialIRCC, period1Months, period1Rate, irccMonthly, monthlyExtra,
           insuranceRate, onetimePayments: onetimeAbsolute, rateType: state.rateType,
           prepayOption: state.prepayOption };
}

// ═══════════════════════════════════════════════════════════════
// RENDER RESULTS
// ═══════════════════════════════════════════════════════════════
function renderResults(result, baseResult, params, skipScroll = false) {
  const L    = LANG[state.lang];
  const comp = runComparativeAnalysis(baseResult, result);
  const hasPrepay = state.recurringPrepays.some(r => r.amount > 0) || state.onetimePayments.some(r => r.amount > 0);

  el('resultsSection').className = 'results-visible';
  if (!skipScroll) { state._stressRan = false; el('stressContent').innerHTML = ''; }

  const firstRow      = result.schedule[0];
  const initPayment   = firstRow?.payment      || 0;
  const initInsurance = firstRow?.insurancePart || 0;
  const initTotal     = firstRow?.totalPayment  || 0;
  const firstP2Row    = result.schedule.find(r => !r.isFixed);
  const p2InitTotal   = firstP2Row?.totalPayment || 0;
  const maxTotal      = result.schedule.reduce((m, r) => Math.max(m, r.totalPayment), 0);
  const evalCost      = params.evaluationCost || 0;
  const grandTotal    = result.totalPaid + evalCost; // principal + dobândă + asigurare + taxă evaluare

  let kpiHTML = '';
  if (params.period1Months > 0) {
    kpiHTML += kpiCard(L.kpi_p1_total, fmt.money(initTotal), 'amber',
      `${L.th_rate} ${fmt.money(initPayment)} + ${L.ins_abbr} ${fmt.money(initInsurance)}`);
    kpiHTML += kpiCard(L.kpi_p2_initial, fmt.money(p2InitTotal), 'sky',
      `IRCC ${fmt.pct(params.initialIRCC)} + marjă ${fmt.pct(params.margin)}`);
  } else {
    kpiHTML += kpiCard(L.kpi_monthly_initial, fmt.money(initTotal), 'sky',
      `${L.th_rate} ${fmt.money(initPayment)} + ${L.ins_abbr} ${fmt.money(initInsurance)}`);
  }
  kpiHTML += kpiCard(L.kpi_max_monthly, fmt.money(maxTotal), 'red', `DAE ${fmt.pct(result.maxRate)}`);
  kpiHTML += kpiCard(L.kpi_total_paid, fmt.money(grandTotal), '', '');
  if (evalCost > 0)
    kpiHTML += kpiCard(L.kpi_evaluation_cost, fmt.money(evalCost), 'amber',
      `${fmt.pct((evalCost / grandTotal) * 100)} ${L.kpi_from_total}`);
  kpiHTML += kpiCard(L.kpi_total_interest, fmt.money(result.totalInterest), 'red',
    `${fmt.pct((result.totalInterest / grandTotal) * 100)} ${L.kpi_from_total}`);
  if (params.insuranceRate > 0)
    kpiHTML += kpiCard(L.kpi_total_insurance, fmt.money(result.totalInsurance), 'amber',
      `${fmt.pct((result.totalInsurance / grandTotal) * 100)} ${L.kpi_from_total}`);
  kpiHTML += kpiCard(L.kpi_interest_saved, fmt.money(comp.interestSaved), 'green',
    hasPrepay ? `${fmt.money(comp.totalSaved)} ${L.kpi_total_saved}` : L.kpi_add_prepay);
  kpiHTML += kpiCard(L.kpi_period_reduced,
    comp.monthsSaved > 0
      ? `${Math.floor(comp.monthsSaved/12)}${L.years_short} ${comp.monthsSaved%12}${L.months_short}`
      : '—',
    'green', comp.monthsSaved > 0 ? `${comp.monthsSaved} ${L.kpi_months_earlier}` : '');
  kpiHTML += kpiCard(L.kpi_loan_finished, fmt.month(result.finalMonth), 'amber',
    `${result.finalMonth} ${L.kpi_months_total}`);
  kpiHTML += kpiCard(L.kpi_effective_rate, fmt.pct(result.effectiveRate) + L.kpi_per_year, 'teal', L.kpi_calculated);

  el('kpiGrid').innerHTML = kpiHTML;

  el('decisionContent').innerHTML = `
    <div class="decision-box">
      <div class="decision-icon">💡</div>
      <div class="decision-text">${L.decision_body(fmt.pct(result.effectiveRate))}</div>
    </div>
    <div class="decision-stats">
      ${decStat(L.decision_implicit,  fmt.pct(result.effectiveRate))}
      ${decStat(L.decision_int_saved, fmt.money(comp.interestSaved))}
      ${decStat(L.decision_mon_saved, comp.monthsSaved + ' ' + L.pagination_months)}
      ${decStat(L.decision_cost,      fmt.pct((result.totalInterest / params.loanAmount) * 100))}
    </div>`;

  renderCharts(result, baseResult, params);

  state.tableData       = result.schedule;
  state.tablePage       = 1;
  state.simulationResult = result;
  state._params         = params;
  state._baseResult     = baseResult;
  state.baseScheduleMap = {};
  (baseResult.schedule || []).forEach(r => { state.baseScheduleMap[r.month] = r; });

  renderTable();
  if (!skipScroll) el('section-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function kpiCard(label, value, type, sub) {
  return `<div class="kpi-card ${type}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}
function decStat(label, val) {
  return `<div class="decision-stat"><div class="decision-stat-label">${label}</div><div class="decision-stat-val">${val}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════
function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); state.charts[key] = null; }
}

const chartOpts = {
  responsive: true, animation: { duration: 400 },
  plugins: {
    legend: { labels: { color: '#6b8099', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 11 } },
    tooltip: { backgroundColor: '#0e0f1a', borderColor: '#1f2435', borderWidth: 1,
      titleColor: '#e0e8f4', bodyColor: '#6b8099',
      titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 11 } }
  },
  scales: {
    x: { ticks: { color: '#2d4055', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 12 }, grid: { color: '#151c28' } },
    y: { ticks: { color: '#2d4055', font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: '#151c28' } }
  }
};

function renderCharts(result, baseResult, params) {
  const L = LANG[state.lang];
  const s = result.schedule, n = s.length;
  const step = n > 240 ? 6 : n > 120 ? 3 : 1;
  const f    = s.filter((_, i) => i % step === 0);
  const lbl  = f.map(r => `L${r.month}`);

  destroyChart('ircc');
  state.charts.ircc = new Chart(el('chartIRCC'), { type:'line', data:{ labels:lbl, datasets:[
    { label:'IRCC %', data:f.map(r=>+r.ircc.toFixed(4)), borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.07)', borderWidth:2, tension:0.3, pointRadius:0, fill:true },
    { label:L.chart_dae_series, data:f.map(r=>+r.annualRate.toFixed(4)), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,0.04)', borderWidth:1.5, tension:0.3, pointRadius:0, fill:false, borderDash:[4,3] }
  ]}, options:{...chartOpts} });

  destroyChart('rate');
  state.charts.rate = new Chart(el('chartRate'), { type:'line', data:{ labels:lbl, datasets:[
    { label:L.chart_monthly_rate(fmt.sym()), data:f.map(r=>+r.payment.toFixed(2)), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,0.07)', borderWidth:2, tension:0.1, pointRadius:0, fill:true }
  ]}, options:{...chartOpts, scales:{...chartOpts.scales, y:{...chartOpts.scales.y, ticks:{...chartOpts.scales.y.ticks, callback:v=>fmt.money(v)}}}} });

  destroyChart('balance');
  state.charts.balance = new Chart(el('chartBalance'), { type:'line', data:{ labels:lbl, datasets:[
    { label:L.chart_balance_lbl(fmt.sym()), data:f.map(r=>+r.balance.toFixed(2)), borderColor:'#4ade80', backgroundColor:'rgba(74,222,128,0.07)', borderWidth:2, tension:0.3, pointRadius:0, fill:true }
  ]}, options:{...chartOpts, scales:{...chartOpts.scales, y:{...chartOpts.scales.y, ticks:{...chartOpts.scales.y.ticks, callback:v=>(v/1000).toFixed(0)+'k'}}}} });

  const bStep = Math.max(step, baseResult.schedule.length > 240 ? 6 : 3);
  const bf = baseResult.schedule.filter((_,i)=>i%bStep===0);
  const rf = result.schedule.filter((_,i)=>i%bStep===0);
  const cl = Array.from({length:Math.max(bf.length,rf.length)},(_,i)=>`L${(i+1)*bStep}`);

  destroyChart('comparison');
  state.charts.comparison = new Chart(el('chartComparison'), { type:'line', data:{ labels:cl, datasets:[
    { label:L.chart_no_prepay,   data:bf.map(r=>+r.balance.toFixed(2)), borderColor:'#f87171', backgroundColor:'rgba(248,113,113,0.05)', borderWidth:2, tension:0.3, pointRadius:0, fill:true },
    { label:L.chart_with_prepay, data:rf.map(r=>+r.balance.toFixed(2)), borderColor:'#4ade80', backgroundColor:'rgba(74,222,128,0.05)', borderWidth:2, tension:0.3, pointRadius:0, fill:true }
  ]}, options:{...chartOpts, scales:{...chartOpts.scales, y:{...chartOpts.scales.y, ticks:{...chartOpts.scales.y.ticks, callback:v=>(v/1000).toFixed(0)+'k'}}}} });
}

// ═══════════════════════════════════════════════════════════════
// TABLE WITH PAGINATION
// ═══════════════════════════════════════════════════════════════
const PAGE_SIZE = 50;

function renderTable(filterText = '') {
  const L = LANG[state.lang];
  const all = state.tableData || [];
  const filtered = filterText
    ? all.filter(r => String(r.month).includes(filterText) || fmt.month(r.month).toLowerCase().includes(filterText.toLowerCase()))
    : all;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  state.tablePage  = Math.max(1, Math.min(state.tablePage || 1, totalPages));
  const rows = filtered.slice((state.tablePage-1)*PAGE_SIZE, state.tablePage*PAGE_SIZE);

  // Rândul luna 0 — sold inițial
  let zero = '';
  if (state.tablePage === 1 && !filterText && state._params) {
    const sold0 = state._params.loanAmount;
    const f = all[0];
    const lbl0 = state.lang === 'en' ? 'Yr 1, M00' : 'An 1, L00';
    zero = `<tr class="month-zero">
      <td>${lbl0}</td>
      <td>${f ? (f.isFixed ? `<span style="color:var(--amber)">${L.fixed_tag}</span>` : fmt.pct(f.ircc)) : '—'}</td>
      <td>${f ? fmt.pct(f.annualRate) : '—'}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      <td style="color:var(--t1);font-weight:600">${fmt.money(sold0)}</td>
    </tr>`;
  }

  el('amortBody').innerHTML = zero + rows.map(r => {
    const cls = [r.isFixed?'is-fixed':'', r.irccChanged?'ircc-changed':'', r.extraPrepay>0?'has-prepay':''].filter(Boolean).join(' ');
    const base = state.baseScheduleMap?.[r.month];
    const saved = base ? Math.max(0, base.interestPart - r.interestPart) : 0;
    return `<tr class="${cls}">
      <td>${fmt.month(r.month)}</td>
      <td>${r.isFixed ? `<span style="color:var(--amber)">${L.fixed_tag}</span>` : fmt.pct(r.ircc)}</td>
      <td>${fmt.pct(r.annualRate)}</td>
      <td>${fmt.money(r.payment)}</td>
      <td style="color:var(--amber)">${r.insurancePart>0?fmt.money(r.insurancePart):'—'}</td>
      <td>${fmt.money(r.totalPayment)}</td>
      <td>${fmt.money(r.interestPart)}</td>
      <td>${fmt.money(r.principalPart)}</td>
      <td>${r.extraPrepay>0?fmt.money(r.extraPrepay):'—'}</td>
      <td style="color:var(--t1);font-weight:600">${fmt.money(r.totalPayment+r.extraPrepay)}</td>
      <td style="color:var(--green)">${saved>0.005?'+'+fmt.money(saved):'—'}</td>
      <td>${fmt.money(r.balance)}</td>
    </tr>`;
  }).join('');

  const pg = el('tablePagination');
  if (totalPages <= 1) { pg.innerHTML=''; return; }
  const cur=state.tablePage, rng=2, pages=[];
  if (cur > rng+2) pages.push(1,'…'); else for(let i=1;i<Math.min(cur,rng+1);i++) pages.push(i);
  for(let i=Math.max(1,cur-rng);i<=Math.min(totalPages,cur+rng);i++) pages.push(i);
  if (cur < totalPages-rng-1) pages.push('…',totalPages); else for(let i=Math.max(cur+1,totalPages-rng);i<=totalPages;i++) pages.push(i);
  pg.innerHTML = `
    <button class="page-btn" onclick="changePage(${cur-1})" ${cur===1?'disabled':''}>‹</button>
    ${[...new Set(pages)].map(p=>p==='…'?`<span class="page-info">…</span>`:`<button class="page-btn ${p===cur?'active':''}" onclick="changePage(${p})">${p}</button>`).join('')}
    <button class="page-btn" onclick="changePage(${cur+1})" ${cur===totalPages?'disabled':''}>›</button>
    <span class="page-info">${filtered.length} ${L.pagination_months}</span>`;
}

function changePage(p) { state.tablePage=p; renderTable(el('tableSearch')?.value||''); }

// ═══════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════
function exportCSV() {
  const L = LANG[state.lang];
  const rows = (state.tableData||[]).map(r => {
    const yr=Math.floor((r.month-1)/12)+1, mn=((r.month-1)%12)+1;
    const base=state.baseScheduleMap?.[r.month];
    const saved=base?Math.max(0,base.interestPart-r.interestPart):0;
    return [yr,mn,r.month,r.isFixed?L.csv_fixed:L.csv_ircc,
      r.ircc.toFixed(4),r.annualRate.toFixed(4),r.payment.toFixed(2),r.insurancePart.toFixed(2),
      r.totalPayment.toFixed(2),r.interestPart.toFixed(2),r.principalPart.toFixed(2),
      r.extraPrepay.toFixed(2),(r.totalPayment+r.extraPrepay).toFixed(2),saved.toFixed(2),r.balance.toFixed(2)].join(',');
  });
  const blob = new Blob([L.csv_header+rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href=url; a.download='credit_ipotecar.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// STRESS TEST
// ═══════════════════════════════════════════════════════════════
function renderStressTest() {
  if (!state._params) return;
  const L = LANG[state.lang];
  state._stressRan = true;
  const sr   = runStressTest(state._params, 2);
  const orig = state.simulationResult;
  const p1m  = state._params.period1Months || 0;
  const origR  = orig.schedule[p1m]?.payment || orig.schedule[0]?.payment || 0;
  const stressR = sr.schedule[p1m]?.payment || sr.schedule[0]?.payment || 0;
  const delta  = stressR - origR;

  el('stressContent').innerHTML = `<div class="stress-grid">
    ${stressItem(L.stress_p2_rate,   fmt.money(stressR), '')}
    ${stressItem(L.stress_monthly,   '+'+fmt.money(delta),       `vs ${fmt.money(origR)}`)}
    ${stressItem(L.stress_annual,    '+'+fmt.money(delta*12),    L.stress_extra_yr)}
    ${stressItem(L.stress_extra_int, '+'+fmt.money(sr.totalInterest-orig.totalInterest), L.stress_extra_tot)}
  </div>`;
}

function stressItem(label, value, delta) {
  return `<div class="stress-item"><div class="stress-label">${label}</div><div class="stress-value">${value}</div>${delta?`<div class="stress-delta">${delta}</div>`:''}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// IRCC MODEL PARAMS UI
// ═══════════════════════════════════════════════════════════════
function renderIRCCParams() {
  const L = LANG[state.lang], c = el('irccModelParams');
  if (state.irccModel==='constant') {
    c.innerHTML=`<p class="hint">${L.hint_ircc_constant}</p>`;
  } else if (state.irccModel==='increase') {
    c.innerHTML=`<div class="form-grid form-grid-2"><div class="field"><label>${L.ircc_increase_label}</label><div class="input-wrap"><input type="number" id="irccLinearRate" value="0.25" min="0" max="5" step="0.05"><span class="unit">%/AN</span></div></div></div>`;
  } else if (state.irccModel==='decrease') {
    c.innerHTML=`<div class="form-grid form-grid-2"><div class="field"><label>${L.ircc_decrease_label}</label><div class="input-wrap"><input type="number" id="irccLinearRate" value="0.25" min="0" max="5" step="0.05"><span class="unit">%/AN</span></div></div></div>`;
  } else if (state.irccModel==='custom') {
    c.innerHTML=`<div class="field"><label>${L.ircc_custom_label}</label><textarea id="irccCustomValues" placeholder="${L.ircc_custom_ph}"></textarea><p class="hint">${L.hint_ircc_custom}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT LISTS UI
// ═══════════════════════════════════════════════════════════════
function renderRecurringList() {
  const L=LANG[state.lang], c=el('recurringList'), maxY=numEl('loanDuration')||30, u=fmt.unit();
  if (state.recurringPrepays.length===0) { c.innerHTML=`<p class="hint" style="margin-top:0">${L.no_recurring}</p>`; return; }
  c.innerHTML=state.recurringPrepays.map((rp,i)=>`
    <div class="pay-row">
      <div class="field"><label>${L.rp_from}</label><div class="input-wrap"><input type="number" class="rp-fromYear" data-idx="${i}" value="${rp.fromYear}" min="1" max="${maxY}"><span class="unit">AN</span></div></div>
      <div class="field"><label>${L.rp_to}</label><div class="input-wrap"><input type="number" class="rp-toYear" data-idx="${i}" value="${rp.toYear||maxY}" min="1" max="${maxY}"><span class="unit">AN</span></div></div>
      <div class="field"><label>${L.rp_extra}</label><div class="input-wrap"><input type="number" class="rp-amount" data-idx="${i}" value="${rp.amount}" min="0" step="100"><span class="unit currency-unit">${u}</span></div></div>
      <button class="btn-remove" onclick="removeRecurring(${i})">×</button>
    </div>`).join('');
  c.querySelectorAll('.rp-fromYear').forEach(i=>i.addEventListener('change',()=>{state.recurringPrepays[+i.dataset.idx].fromYear=parseInt(i.value)||1;}));
  c.querySelectorAll('.rp-toYear').forEach(i=>i.addEventListener('change',()=>{state.recurringPrepays[+i.dataset.idx].toYear=parseInt(i.value)||0;}));
  c.querySelectorAll('.rp-amount').forEach(i=>i.addEventListener('change',()=>{state.recurringPrepays[+i.dataset.idx].amount=parseFloat(i.value)||0;}));
}

function addRecurring() { state.recurringPrepays.push({fromYear:1,toYear:numEl('loanDuration')||30,amount:500}); renderRecurringList(); }
function removeRecurring(i) { state.recurringPrepays.splice(i,1); renderRecurringList(); }

function renderOnetimeList() {
  const L=LANG[state.lang], c=el('onetimeList'), u=fmt.unit();
  if (state.onetimePayments.length===0) { c.innerHTML=`<p class="hint" style="margin-top:0">${L.no_onetime}</p>`; return; }
  c.innerHTML=state.onetimePayments.map((p,i)=>`
    <div class="onetime-row">
      <div class="field"><label>${L.ot_year}</label><div class="input-wrap"><input type="number" class="ot-year" data-idx="${i}" value="${p.year}" min="1" max="30"><span class="unit" style="font-size:0.55rem">AN</span></div></div>
      <div class="field"><label>${L.ot_month_lbl}</label><div class="input-wrap"><input type="number" class="ot-month" data-idx="${i}" value="${p.month}" min="1" max="12"><span class="unit" style="font-size:0.55rem">L</span></div></div>
      <div class="field"><label>${L.ot_amount}</label><div class="input-wrap"><input type="number" class="ot-amount" data-idx="${i}" value="${p.amount}" min="0" step="500"><span class="unit currency-unit">${u}</span></div></div>
      <button class="btn-remove" onclick="removeOnetime(${i})">×</button>
    </div>`).join('');
  c.querySelectorAll('.ot-year').forEach(i=>i.addEventListener('change',()=>{state.onetimePayments[+i.dataset.idx].year=parseInt(i.value)||1;}));
  c.querySelectorAll('.ot-month').forEach(i=>i.addEventListener('change',()=>{state.onetimePayments[+i.dataset.idx].month=parseInt(i.value)||1;}));
  c.querySelectorAll('.ot-amount').forEach(i=>i.addEventListener('change',()=>{state.onetimePayments[+i.dataset.idx].amount=parseFloat(i.value)||0;}));
}

function addOnetime() { state.onetimePayments.push({year:5,month:1,amount:20000}); renderOnetimeList(); }
function removeOnetime(i) { state.onetimePayments.splice(i,1); renderOnetimeList(); }

function updateCurrencyUnits() {
  const u=fmt.unit();
  document.querySelectorAll('.currency-unit').forEach(e=>{e.textContent=u;});
  renderRecurringList(); renderOnetimeList();
}

// ═══════════════════════════════════════════════════════════════
// LANGUAGE
// ═══════════════════════════════════════════════════════════════
function applyLanguage(lang) {
  state.lang=lang;
  const L=LANG[lang];
  document.querySelectorAll('[data-i18n]').forEach(n=>{if(L[n.dataset.i18n]!==undefined)n.textContent=L[n.dataset.i18n];});
  document.querySelectorAll('[data-i18n-html]').forEach(n=>{if(L[n.dataset.i18nHtml]!==undefined)n.innerHTML=L[n.dataset.i18nHtml];});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(n=>{if(L[n.dataset.i18nPlaceholder]!==undefined)n.placeholder=L[n.dataset.i18nPlaceholder];});
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));
  document.documentElement.lang=lang;
  renderIRCCParams(); renderRecurringList(); renderOnetimeList();
  if (state.simulationResult&&state._params&&state._baseResult) renderResults(state.simulationResult,state._baseResult,state._params,true);
  if (state._stressRan) renderStressTest();
}

// ═══════════════════════════════════════════════════════════════
// MAIN SIMULATE
// ═══════════════════════════════════════════════════════════════
function simulate() {
  const L=LANG[state.lang];
  if (numEl('loanAmount')<=0||numEl('loanDuration')<=0) { alert(L.alert_invalid); return; }
  const svg='<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5L13 8L3 13.5V2.5Z"/></svg>';
  const btn=el('btnSimulate'); btn.innerHTML=L.simulating; btn.disabled=true;
  setTimeout(()=>{
    try {
      const params=collectParams();
      const baseParams={...params, monthlyExtra:new Array(params.durationMonths+1).fill(0), onetimePayments:[]};
      const baseResult=simulateMonthByMonth(baseParams);
      const fullResult=simulateMonthByMonth(params);
      renderResults(fullResult,baseResult,params);
    } catch(e) { console.error(e); alert(LANG[state.lang].alert_error+e.message); }
    btn.innerHTML=`${svg} ${LANG[state.lang].simulate_btn}`; btn.disabled=false;
  },30);
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  let _avansUpdating = false;

  // Currency toggle
  el('currencyToggle')?.querySelectorAll('.toggle-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if (btn.dataset.value===state.currency) return;
      el('currencyToggle').querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const rate=parseFloat(el('eurRate')?.value)||5, toEUR=btn.dataset.value==='EUR', f=toEUR?1/rate:rate;
      _avansUpdating=true;
      const loan=parseFloat(el('loanAmount')?.value)||0;
      if(el('loanAmount')) el('loanAmount').value=Math.round(loan*f);
      const pv=parseFloat(el('propertyValue')?.value)||0;
      if(pv>0){const np=Math.round(pv*f); if(el('propertyValue'))el('propertyValue').value=np; const pct=parseFloat(el('downPaymentPct')?.value)||0; if(el('downPaymentAmt'))el('downPaymentAmt').value=(np*pct/100).toFixed(2);}
      const ec=parseFloat(el('evaluationCost')?.value)||0;
      if(ec>0&&el('evaluationCost')) el('evaluationCost').value=(ec*f).toFixed(2);
      _avansUpdating=false; state.currency=btn.dataset.value; updateCurrencyUnits();
    });
  });

  // Rate type + prepay option toggles
  function setupToggle(id,key){
    el(id)?.querySelectorAll('.toggle-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        el(id).querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); state[key]=btn.dataset.value;
      });
    });
  }
  setupToggle('rateTypeToggle','rateType'); setupToggle('prepayOptionToggle','prepayOption');

  // IRCC freq
  el('irccFreqToggle')?.querySelectorAll('.toggle-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      el('irccFreqToggle').querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); state.irccFreq=parseInt(btn.dataset.value);
    });
  });

  // IRCC model tabs
  document.querySelectorAll('.model-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.model-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); state.irccModel=btn.dataset.model; renderIRCCParams();
    });
  });

  // Sync totalVariableRate ↔ bankMargin ↔ initialIRCC
  function syncIRCC(){const t=parseFloat(el('totalVariableRate')?.value)||0,m=parseFloat(el('bankMargin')?.value)||0;if(el('initialIRCC'))el('initialIRCC').value=Math.max(0,t-m).toFixed(2);}
  function syncTotal(){const i=parseFloat(el('initialIRCC')?.value)||0,m=parseFloat(el('bankMargin')?.value)||0;if(el('totalVariableRate'))el('totalVariableRate').value=(i+m).toFixed(2);}
  syncIRCC();
  el('totalVariableRate')?.addEventListener('input',syncIRCC);
  el('bankMargin')?.addEventListener('input',syncIRCC);
  el('initialIRCC')?.addEventListener('input',syncTotal);

  // Avans calculator
  function updateLoanFromAvans(){
    if(_avansUpdating) return;
    const pv=parseFloat(el('propertyValue')?.value)||0, pct=parseFloat(el('downPaymentPct')?.value)||0;
    if(pv<=0){if(el('downPaymentAmt'))el('downPaymentAmt').value=''; return;}
    const avans=+(pv*pct/100).toFixed(2);
    _avansUpdating=true;
    if(el('downPaymentAmt'))el('downPaymentAmt').value=avans.toFixed(2);
    if(el('loanAmount'))el('loanAmount').value=Math.round(pv-avans);
    _avansUpdating=false;
  }
  function updatePropertyFromLoan(){
    if(_avansUpdating) return;
    const cr=parseFloat(el('loanAmount')?.value)||0, pct=parseFloat(el('downPaymentPct')?.value)||0;
    if(cr<=0||pct>=100) return;
    const pv=cr/(1-pct/100);
    _avansUpdating=true;
    if(el('propertyValue'))el('propertyValue').value=Math.round(pv);
    if(el('downPaymentAmt'))el('downPaymentAmt').value=(pv-cr).toFixed(2);
    _avansUpdating=false;
  }
  el('propertyValue')?.addEventListener('input',updateLoanFromAvans);
  el('downPaymentPct')?.addEventListener('input',updateLoanFromAvans);
  el('loanAmount')?.addEventListener('input',updatePropertyFromLoan);
  if(el('evaluationCost')) el('evaluationCost').value=509.57;
  updatePropertyFromLoan();

  // Buttons
  el('btnAddRecurring')?.addEventListener('click',addRecurring);
  el('btnAddOnetime')?.addEventListener('click',addOnetime);
  el('btnSimulate')?.addEventListener('click',simulate);
  el('btnStress')?.addEventListener('click',renderStressTest);
  el('btnExportCSV')?.addEventListener('click',exportCSV);
  el('tableSearch')?.addEventListener('input',e=>{state.tablePage=1;renderTable(e.target.value);});
  document.querySelectorAll('.lang-btn').forEach(btn=>btn.addEventListener('click',()=>applyLanguage(btn.dataset.lang)));
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey)simulate();});

  applyLanguage('ro');
});