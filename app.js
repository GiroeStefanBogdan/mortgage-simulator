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
 *  - Toggle RO / EN
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
  lang:            'ro',         // 'ro' | 'en'

  // Recurring extra payments by year interval: [{fromYear, toYear, amount}]
  recurringPrepays: [],

  // Lump-sum one-time payments: [{year, month, amount}]
  onetimePayments:  [],

  // Simulation results
  simulationResult: null,
  baseResult:       null,
  _params:          null,
  _baseResult:      null,
  _stressRan:       false,
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
    const y  = Math.floor((v - 1) / 12) + 1;
    const m  = ((v - 1) % 12) + 1;
    const ms = String(m).padStart(2, '0');
    return state.lang === 'en'
      ? `Yr ${y}, M${ms}`
      : `An ${y}, L${ms}`;
  },
};

// ═══════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════
const LANG = {
  ro: {
    // Header
    header_subtitle:     'Simulator IRCC · România',
    header_status:       'Calculator activ',
    // Sections
    sec_params:          'Parametri Credit',
    sec_rates:           'Structura Dobânzii',
    sec_ircc:            'Evoluție IRCC',
    sec_prepay:          'Rambursare Anticipată',
    sec_results:         'Rezultate',
    sec_decision:        'Analiză Decizională',
    sec_stress:          'Stress Test',
    sec_charts:          'Grafice',
    sec_table:           'Tabel Amortizare',
    // Section 01
    currency_lbl:        'Monedă',
    loan_amount:         'Sumă Credit',
    loan_duration:       'Durată Credit',
    rate_type:           'Tip Rată',
    annuity:             'Anuitate',
    decreasing:          'Descrescătoare',
    insurance_rate:      'Asigurare Viață',
    pct_sold:            '% lunar din sold',
    avans_title:         'Calcul Avans',
    avans_desc:          'Completează valoarea imobilului pentru a calcula automat avansul și creditul',
    property_value:      'Valoare Imobil',
    down_pct:            'Procent Avans',
    down_amt:            'Sumă Avans',
    calculated_auto:     'calculat automat',
    hint_avans:          'Avansul se plătește direct vânzătorului și <strong>nu face parte din credit</strong>. Credit = Valoare imobil − Avans. Câmpul <em>Sumă Credit</em> de mai sus se actualizează automat.',
    hint_insurance:      'Asigurarea de viață se calculează lunar ca <strong>% din soldul rămas</strong> și se adaugă la rată. Setează la 0 pentru a o exclude.',
    // Section 02
    period1_title:       'Perioadă Fixă',
    optional_tag:        'opțional',
    period1_desc:        'Dobândă fixă — de obicei primii 3–5 ani',
    period1_dur:         'Durată perioadă fixă',
    period1_rate:        'Dobândă anuală fixă',
    hint_p1:             'Setează durata la <strong>0 ani</strong> dacă creditul nu are perioadă fixă.',
    period_then:         'apoi',
    period2_title:       'Perioadă Variabilă',
    period2_desc:        'IRCC + Marjă bancă — restul duratei creditului',
    total_var_rate:      'Dobândă totală variabilă',
    ircc_margin_note:    'IRCC + marjă',
    bank_margin:         'Marjă bancă',
    ircc_label:          'IRCC',
    ircc_update:         'Actualizare IRCC',
    quarterly:           'Trimestrial',
    semiannual:          'Semestrial',
    // Section 03
    applicable_p2:       'Aplicabil perioadei variabile (P2)',
    model_constant:      'Constant',
    model_increase:      'Crește',
    model_decrease:      'Scade',
    model_custom:        'Custom',
    hint_ircc_constant:  'IRCC rămâne constant la valoarea inițială pe toată durata variabilă.',
    ircc_increase_label: 'Rată anuală de creștere IRCC',
    ircc_decrease_label: 'Rată anuală de scădere IRCC',
    ircc_custom_label:   'Valori IRCC (separate prin virgulă, una per perioadă de actualizare)',
    ircc_custom_ph:      '5.99, 6.25, 6.50, 6.75, 7.00, 6.80 …',
    hint_ircc_custom:    'Fiecare valoare = o perioadă de actualizare (trimestru/semestru). Ultima valoare se repetă dacă lista e mai scurtă.',
    // Section 04
    prepay_option:       'La rambursare anticipată',
    reduce_period:       'Reduc Perioada',
    reduce_rate:         'Reduc Rata',
    recurring_title:     'Plăți Lunare Suplimentare',
    recurring_desc:      'Specifică intervale de ani în care plătești o sumă fixă extra în fiecare lună.',
    onetime_title:       'Rambursări Ocazionale',
    onetime_desc:        'Sume specifice plătite o singură dată (injectare de capital).',
    btn_add_recurring:   '+ Adaugă interval',
    btn_add_onetime:     '+ Adaugă rambursare',
    no_recurring:        'Nicio plată suplimentară adăugată.',
    no_onetime:          'Nicio rambursare ocazională adăugată.',
    rp_from:             'De la an',
    rp_to:               'Până la an',
    rp_extra:            'Extra / lună',
    ot_year:             'An',
    ot_month_lbl:        'Luna',
    ot_amount:           'Suma',
    // Simulate / alerts
    simulate_btn:        'Simulează Credit',
    simulating:          '⌛ Calculez…',
    alert_invalid:       'Introdu o sumă și o durată validă!',
    alert_error:         'Eroare la calcul: ',
    stress_btn:          '⚡ Simulează +2% IRCC',
    // Table
    search_placeholder:  'Caută luna…',
    th_month:            'Luna',
    th_ircc:             'IRCC %',
    th_dae:              'DAE %',
    th_rate:             'Rată',
    th_insurance:        'Asigurare',
    th_rate_ins:         'Rată + Asig.',
    th_interest:         'Dobândă',
    th_principal:        'Principal',
    th_prepay:           'Ramb. Sup.',
    th_total:            'Total',
    th_savings:          'Economie Lunară',
    th_balance:          'Sold Rămas',
    fixed_tag:           'FIXAT',
    pagination_months:   'luni',
    // Charts
    chart_ircc_title:    'Evoluție IRCC',
    chart_rate_title:    'Rată Lunară',
    chart_balance_title: 'Sold Rămas',
    chart_cmp_title:     'Cu vs. Fără Rambursare',
    chart_dae_series:    'DAE %',
    chart_monthly_rate:  sym => `Rată lunară (${sym})`,
    chart_balance_lbl:   sym => `Sold rămas (${sym})`,
    chart_no_prepay:     'Fără rambursare',
    chart_with_prepay:   'Cu rambursare',
    // KPI labels
    kpi_p1_total:        'Total Lunar P1 (cu asig.)',
    kpi_p2_initial:      'Total Lunar P2 Inițial (cu asig.)',
    kpi_monthly_initial: 'Total Lunar Inițial (cu asig.)',
    kpi_max_monthly:     'Total Lunar Maxim',
    kpi_total_paid:      'Total Plătit',
    kpi_total_interest:  'Total Dobândă',
    kpi_total_insurance: 'Total Asigurare',
    kpi_interest_saved:  'Dobândă Economisită',
    kpi_period_reduced:  'Perioadă Redusă',
    kpi_loan_finished:   'Credit Finalizat',
    kpi_effective_rate:  'Dobândă Efectivă Medie',
    kpi_add_prepay:      'Adaugă rambursare anticipată',
    kpi_total_saved:     'economisit total',
    kpi_from_total:      'din total plătit',
    kpi_months_earlier:  'luni mai devreme',
    kpi_months_total:    'luni totale',
    kpi_calculated:      'Calculat pe durata reală',
    kpi_per_year:        '/an',
    years_short:         'a',
    months_short:        'l',
    ins_abbr:            'asig.',
    // Decision analysis
    decision_body:       rate => `Fiecare leu rambursat anticipat îți oferă un randament garantat de <strong>${rate} anual</strong>, echivalent cu un instrument fără risc garantat de stat — superior oricărui depozit bancar în condiții normale de piață.`,
    decision_implicit:   'Randament implicit',
    decision_int_saved:  'Dobândă economisită',
    decision_mon_saved:  'Luni economiste',
    decision_cost:       'Cost total / creditat',
    // Stress test
    stress_p2_rate:      'Rată Variabilă Nouă',
    stress_monthly:      'Impact Lunar',
    stress_annual:       'Impact Anual',
    stress_extra_int:    'Dobândă Extra',
    stress_extra_yr:     'extra pe an',
    stress_extra_tot:    'cost suplimentar total',
    // CSV
    csv_header:          'An,Luna,Luna Nr.,Tip,IRCC%,DAE%,Rata Baza,Asigurare,Rata+Asig.,Dobanda,Principal,Ramb.Sup.,Total,Economie Lunara,Sold Ramas\n',
    csv_fixed:           'FIXA',
    csv_ircc:            'IRCC',
    // Footer
    footer_text:         'Simulator Credit Ipotecar · Calcule orientative · Nu constituie consultanță financiară',
  },

  en: {
    // Header
    header_subtitle:     'IRCC Simulator · Romania',
    header_status:       'Calculator active',
    // Sections
    sec_params:          'Loan Parameters',
    sec_rates:           'Interest Structure',
    sec_ircc:            'IRCC Evolution',
    sec_prepay:          'Early Repayment',
    sec_results:         'Results',
    sec_decision:        'Decision Analysis',
    sec_stress:          'Stress Test',
    sec_charts:          'Charts',
    sec_table:           'Amortization Table',
    // Section 01
    currency_lbl:        'Currency',
    loan_amount:         'Loan Amount',
    loan_duration:       'Loan Duration',
    rate_type:           'Payment Type',
    annuity:             'Annuity',
    decreasing:          'Decreasing',
    insurance_rate:      'Life Insurance',
    pct_sold:            '% monthly on balance',
    avans_title:         'Down Payment',
    avans_desc:          'Fill in property value to auto-calculate down payment and loan amount',
    property_value:      'Property Value',
    down_pct:            'Down Payment %',
    down_amt:            'Down Payment Amount',
    calculated_auto:     'auto-calculated',
    hint_avans:          'Down payment is paid directly to the seller and <strong>is not part of the loan</strong>. Loan = Property value − Down payment. The <em>Loan Amount</em> field above updates automatically.',
    hint_insurance:      'Life insurance is calculated monthly as <strong>% of remaining balance</strong> and added to the payment. Set to 0 to exclude.',
    // Section 02
    period1_title:       'Fixed Period',
    optional_tag:        'optional',
    period1_desc:        'Fixed interest — usually first 3–5 years',
    period1_dur:         'Fixed period duration',
    period1_rate:        'Fixed annual interest rate',
    hint_p1:             'Set duration to <strong>0 years</strong> if the loan has no fixed period.',
    period_then:         'then',
    period2_title:       'Variable Period',
    period2_desc:        'IRCC + Bank margin — rest of loan duration',
    total_var_rate:      'Total variable interest',
    ircc_margin_note:    'IRCC + margin',
    bank_margin:         'Bank margin',
    ircc_label:          'IRCC',
    ircc_update:         'IRCC Update',
    quarterly:           'Quarterly',
    semiannual:          'Semi-annual',
    // Section 03
    applicable_p2:       'Applicable to variable period (P2)',
    model_constant:      'Constant',
    model_increase:      'Increases',
    model_decrease:      'Decreases',
    model_custom:        'Custom',
    hint_ircc_constant:  'IRCC remains constant at the initial value for the entire variable period.',
    ircc_increase_label: 'IRCC annual increase rate',
    ircc_decrease_label: 'IRCC annual decrease rate',
    ircc_custom_label:   'IRCC values (comma-separated, one per update period)',
    ircc_custom_ph:      '5.99, 6.25, 6.50, 6.75, 7.00, 6.80 …',
    hint_ircc_custom:    'Each value = one update period (quarter/semester). The last value repeats if the list is shorter.',
    // Section 04
    prepay_option:       'On early repayment',
    reduce_period:       'Reduce Period',
    reduce_rate:         'Reduce Payment',
    recurring_title:     'Additional Monthly Payments',
    recurring_desc:      'Specify year intervals where you pay a fixed extra amount each month.',
    onetime_title:       'One-time Repayments',
    onetime_desc:        'Specific amounts paid once (capital injection).',
    btn_add_recurring:   '+ Add interval',
    btn_add_onetime:     '+ Add repayment',
    no_recurring:        'No additional payments added.',
    no_onetime:          'No one-time repayments added.',
    rp_from:             'From year',
    rp_to:               'To year',
    rp_extra:            'Extra / month',
    ot_year:             'Year',
    ot_month_lbl:        'Month',
    ot_amount:           'Amount',
    // Simulate / alerts
    simulate_btn:        'Simulate Loan',
    simulating:          '⌛ Calculating…',
    alert_invalid:       'Enter a valid amount and duration!',
    alert_error:         'Calculation error: ',
    stress_btn:          '⚡ Simulate +2% IRCC',
    // Table
    search_placeholder:  'Search month…',
    th_month:            'Month',
    th_ircc:             'IRCC %',
    th_dae:              'APR %',
    th_rate:             'Payment',
    th_insurance:        'Insurance',
    th_rate_ins:         'Payment + Ins.',
    th_interest:         'Interest',
    th_principal:        'Principal',
    th_prepay:           'Extra Prepay',
    th_total:            'Total',
    th_savings:          'Monthly Savings',
    th_balance:          'Balance',
    fixed_tag:           'FIXED',
    pagination_months:   'months',
    // Charts
    chart_ircc_title:    'IRCC Evolution',
    chart_rate_title:    'Monthly Payment',
    chart_balance_title: 'Remaining Balance',
    chart_cmp_title:     'With vs. Without Repayment',
    chart_dae_series:    'APR %',
    chart_monthly_rate:  sym => `Monthly rate (${sym})`,
    chart_balance_lbl:   sym => `Remaining balance (${sym})`,
    chart_no_prepay:     'Without repayment',
    chart_with_prepay:   'With repayment',
    // KPI labels
    kpi_p1_total:        'Monthly Total P1 (with ins.)',
    kpi_p2_initial:      'Initial Monthly P2 (with ins.)',
    kpi_monthly_initial: 'Initial Monthly Total (with ins.)',
    kpi_max_monthly:     'Max Monthly Total',
    kpi_total_paid:      'Total Paid',
    kpi_total_interest:  'Total Interest',
    kpi_total_insurance: 'Total Insurance',
    kpi_interest_saved:  'Interest Saved',
    kpi_period_reduced:  'Period Reduced',
    kpi_loan_finished:   'Loan Finished',
    kpi_effective_rate:  'Average Effective Rate',
    kpi_add_prepay:      'Add early repayment',
    kpi_total_saved:     'total saved',
    kpi_from_total:      'of total paid',
    kpi_months_earlier:  'months earlier',
    kpi_months_total:    'total months',
    kpi_calculated:      'Calculated over actual duration',
    kpi_per_year:        '/yr',
    years_short:         'y',
    months_short:        'm',
    ins_abbr:            'ins.',
    // Decision analysis
    decision_body:       rate => `Every unit of currency repaid early gives you a guaranteed return of <strong>${rate} per year</strong>, equivalent to a risk-free state-guaranteed instrument — superior to any bank deposit in normal market conditions.`,
    decision_implicit:   'Implicit return',
    decision_int_saved:  'Interest saved',
    decision_mon_saved:  'Months saved',
    decision_cost:       'Total cost / loaned',
    // Stress test
    stress_p2_rate:      'New Variable Rate',
    stress_monthly:      'Monthly Impact',
    stress_annual:       'Annual Impact',
    stress_extra_int:    'Extra Interest',
    stress_extra_yr:     'extra per year',
    stress_extra_tot:    'total extra cost',
    // CSV
    csv_header:          'Year,Month,Month No.,Type,IRCC%,APR%,Base Rate,Insurance,Rate+Ins.,Interest,Principal,Extra.Prepay,Total,Monthly Savings,Balance\n',
    csv_fixed:           'FIXED',
    csv_ircc:            'IRCC',
    // Footer
    footer_text:         'Mortgage Simulator · Indicative calculations · Not financial advice',
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
  const insuranceRate  = numEl('insuranceRate');
  const durationMonths = Math.round(durationYears * 12);
  const period1Months  = Math.min(Math.round(period1Years * 12), durationMonths);

  const irccMonthly = generateIRCCFull(
    period1Months, period1Rate, margin,
    initialIRCC, durationMonths,
    state.irccModel, state.irccFreq
  );

  const monthlyExtra = new Array(durationMonths + 1).fill(0);
  for (const rp of state.recurringPrepays) {
    if (!rp.amount || rp.amount <= 0) continue;
    const fromM = Math.max(1, (rp.fromYear - 1) * 12 + 1);
    const toM   = (rp.toYear <= 0 ? durationYears : rp.toYear) * 12;
    for (let m = fromM; m <= Math.min(durationMonths, toM); m++) {
      monthlyExtra[m] += rp.amount;
    }
  }

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
function renderResults(result, baseResult, params, skipScroll = false) {
  const L    = LANG[state.lang];
  const comp = runComparativeAnalysis(baseResult, result);
  const hasPrepay = state.recurringPrepays.some(r => r.amount > 0)
                 || state.onetimePayments.some(r => r.amount > 0);

  el('resultsSection').className = 'results-visible';

  // Reset stress content on fresh simulation
  if (!skipScroll) {
    state._stressRan = false;
    el('stressContent').innerHTML = '';
  }

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
    kpiHTML += kpiCard(L.kpi_p1_total,
      fmt.money(initTotal), 'amber',
      `${L.th_rate} ${fmt.money(initialPayment)} + ${L.ins_abbr} ${fmt.money(initInsurance)}`);
    kpiHTML += kpiCard(L.kpi_p2_initial,
      fmt.money(p2InitPayment), 'sky',
      `IRCC ${fmt.pct(params.initialIRCC)} + ${L.bank_margin.toLowerCase()} ${fmt.pct(params.margin)}`);
  } else {
    kpiHTML += kpiCard(L.kpi_monthly_initial,
      fmt.money(initTotal), 'sky',
      `${L.th_rate} ${fmt.money(initialPayment)} + ${L.ins_abbr} ${fmt.money(initInsurance)}`);
  }
  kpiHTML += kpiCard(L.kpi_max_monthly, fmt.money(maxTotal), 'red',
    `DAE ${fmt.pct(result.maxRate)}`);
  kpiHTML += kpiCard(L.kpi_total_paid, fmt.money(result.totalPaid), '', '');
  kpiHTML += kpiCard(L.kpi_total_interest, fmt.money(result.totalInterest), 'red',
    `${fmt.pct((result.totalInterest / result.totalPaid) * 100)} ${L.kpi_from_total}`);
  if (hasInsurance) {
    kpiHTML += kpiCard(L.kpi_total_insurance, fmt.money(result.totalInsurance), 'amber',
      `${fmt.pct((result.totalInsurance / result.totalPaid) * 100)} ${L.kpi_from_total}`);
  }
  kpiHTML += kpiCard(L.kpi_interest_saved, fmt.money(comp.interestSaved), 'green',
    hasPrepay ? `${fmt.money(comp.totalSaved)} ${L.kpi_total_saved}` : L.kpi_add_prepay);
  kpiHTML += kpiCard(L.kpi_period_reduced,
    comp.monthsSaved > 0
      ? `${Math.floor(comp.monthsSaved / 12)}${L.years_short} ${comp.monthsSaved % 12}${L.months_short}`
      : '—',
    'green',
    comp.monthsSaved > 0 ? `${comp.monthsSaved} ${L.kpi_months_earlier}` : '');
  kpiHTML += kpiCard(L.kpi_loan_finished, fmt.month(result.finalMonth), 'amber',
    `${result.finalMonth} ${L.kpi_months_total}`);
  kpiHTML += kpiCard(L.kpi_effective_rate, fmt.pct(result.effectiveRate) + L.kpi_per_year, 'teal',
    L.kpi_calculated);

  el('kpiGrid').innerHTML = kpiHTML;

  // ── DECISION ──────────────────────────────────────────────
  el('decisionContent').innerHTML = `
    <div class="decision-box">
      <div class="decision-icon">💡</div>
      <div class="decision-text">
        ${L.decision_body(fmt.pct(result.effectiveRate))}
      </div>
    </div>
    <div class="decision-stats">
      ${decStat(L.decision_implicit,  fmt.pct(result.effectiveRate))}
      ${decStat(L.decision_int_saved, fmt.money(comp.interestSaved))}
      ${decStat(L.decision_mon_saved, comp.monthsSaved + ' ' + L.pagination_months)}
      ${decStat(L.decision_cost,      fmt.pct((result.totalInterest / params.loanAmount) * 100))}
    </div>
  `;

  // ── CHARTS ────────────────────────────────────────────────
  renderCharts(result, baseResult, params);

  // ── TABLE ─────────────────────────────────────────────────
  state.tableData = result.schedule;
  state.tablePage = 1;

  state.baseScheduleMap = {};
  (baseResult.schedule || []).forEach(r => { state.baseScheduleMap[r.month] = r; });

  renderTable();

  state.simulationResult = result;
  state._params          = params;
  state._baseResult      = baseResult;

  if (!skipScroll) {
    el('section-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
  const L      = LANG[state.lang];
  const sched  = result.schedule;
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
          label: L.chart_dae_series,
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
        label: L.chart_monthly_rate(fmt.sym()),
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
        label: L.chart_balance_lbl(fmt.sym()),
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
          label: L.chart_no_prepay,
          data: bFilt.map(r => +r.balance.toFixed(2)),
          borderColor: '#f87171',
          backgroundColor: 'rgba(248,113,113,0.05)',
          borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true,
        },
        {
          label: L.chart_with_prepay,
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
  const L       = LANG[state.lang];
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

    const baseRow      = state.baseScheduleMap?.[r.month];
    const savedMonthly = baseRow ? Math.max(0, baseRow.interestPart - r.interestPart) : 0;

    return `<tr class="${cls}">
      <td>${fmt.month(r.month)}</td>
      <td>${r.isFixed ? `<span style="color:var(--amber)">${L.fixed_tag}</span>` : fmt.pct(r.ircc)}</td>
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
    <span class="page-info">${filtered.length} ${L.pagination_months}</span>
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
  const L     = LANG[state.lang];
  const sched = state.tableData || [];
  const rows = sched.map(r => {
    const yr = Math.floor((r.month - 1) / 12) + 1;
    const mn = ((r.month - 1) % 12) + 1;
    const tip = r.isFixed ? L.csv_fixed : L.csv_ircc;
    const baseRow = state.baseScheduleMap?.[r.month];
    const savedMonthly = baseRow ? Math.max(0, baseRow.interestPart - r.interestPart) : 0;
    return [yr, mn, r.month, tip,
      r.ircc.toFixed(4), r.annualRate.toFixed(4),
      r.payment.toFixed(2), r.insurancePart.toFixed(2), r.totalPayment.toFixed(2),
      r.interestPart.toFixed(2), r.principalPart.toFixed(2),
      r.extraPrepay.toFixed(2), (r.totalPayment + r.extraPrepay).toFixed(2),
      savedMonthly.toFixed(2), r.balance.toFixed(2)].join(',');
  });
  const blob = new Blob([L.csv_header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
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
  const L          = LANG[state.lang];
  state._stressRan = true;
  const stressResult = runStressTest(state._params, 2);
  const orig = state.simulationResult;

  const origRate   = orig.schedule[0]?.payment || 0;
  const stressRate = stressResult.schedule[0]?.payment || 0;

  const p1m = state._params.period1Months || 0;
  const origP2Rate   = orig.schedule[p1m]?.payment || origRate;
  const stressP2Rate = stressResult.schedule[p1m]?.payment || stressRate;
  const deltaP2 = stressP2Rate - origP2Rate;

  el('stressContent').innerHTML = `
    <div class="stress-grid">
      ${stressItem(L.stress_p2_rate,    fmt.money(stressP2Rate), '')}
      ${stressItem(L.stress_monthly,    '+' + fmt.money(deltaP2),       `vs ${fmt.money(origP2Rate)}`)}
      ${stressItem(L.stress_annual,     '+' + fmt.money(deltaP2 * 12),  L.stress_extra_yr)}
      ${stressItem(L.stress_extra_int,  '+' + fmt.money(stressResult.totalInterest - orig.totalInterest), L.stress_extra_tot)}
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
  const L         = LANG[state.lang];
  const container = el('irccModelParams');
  const model     = state.irccModel;

  if (model === 'constant') {
    container.innerHTML = `<p class="hint">${L.hint_ircc_constant}</p>`;
  } else if (model === 'increase') {
    container.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="field">
          <label>${L.ircc_increase_label}</label>
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
          <label>${L.ircc_decrease_label}</label>
          <div class="input-wrap">
            <input type="number" id="irccLinearRate" value="0.25" min="0" max="5" step="0.05">
            <span class="unit">%/AN</span>
          </div>
        </div>
      </div>`;
  } else if (model === 'custom') {
    container.innerHTML = `
      <div class="field">
        <label>${L.ircc_custom_label}</label>
        <textarea id="irccCustomValues" placeholder="${L.ircc_custom_ph}"></textarea>
        <p class="hint">${L.hint_ircc_custom}</p>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// UI: PLĂȚI LUNARE RECURENTE
// ═══════════════════════════════════════════════════════════════
function renderRecurringList() {
  const L         = LANG[state.lang];
  const container = el('recurringList');
  const maxYears  = numEl('loanDuration') || 30;
  const currUnit  = fmt.unit();

  if (state.recurringPrepays.length === 0) {
    container.innerHTML = `<p class="hint" style="margin-top:0">${L.no_recurring}</p>`;
    return;
  }

  container.innerHTML = state.recurringPrepays.map((rp, i) => `
    <div class="pay-row">
      <div class="field">
        <label>${L.rp_from}</label>
        <div class="input-wrap">
          <input type="number" class="rp-fromYear" data-idx="${i}"
            value="${rp.fromYear}" min="1" max="${maxYears}">
          <span class="unit">AN</span>
        </div>
      </div>
      <div class="field">
        <label>${L.rp_to}</label>
        <div class="input-wrap">
          <input type="number" class="rp-toYear" data-idx="${i}"
            value="${rp.toYear || maxYears}" min="1" max="${maxYears}">
          <span class="unit">AN</span>
        </div>
      </div>
      <div class="field">
        <label>${L.rp_extra}</label>
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
  const L         = LANG[state.lang];
  const container = el('onetimeList');
  const currUnit  = fmt.unit();

  if (state.onetimePayments.length === 0) {
    container.innerHTML = `<p class="hint" style="margin-top:0">${L.no_onetime}</p>`;
    return;
  }

  container.innerHTML = state.onetimePayments.map((p, i) => `
    <div class="onetime-row">
      <div class="field">
        <label>${L.ot_year}</label>
        <div class="input-wrap">
          <input type="number" class="ot-year" data-idx="${i}"
            value="${p.year}" min="1" max="30">
          <span class="unit" style="font-size:0.55rem">AN</span>
        </div>
      </div>
      <div class="field">
        <label>${L.ot_month_lbl}</label>
        <div class="input-wrap">
          <input type="number" class="ot-month" data-idx="${i}"
            value="${p.month}" min="1" max="12">
          <span class="unit" style="font-size:0.55rem">L</span>
        </div>
      </div>
      <div class="field">
        <label>${L.ot_amount}</label>
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
// APPLY LANGUAGE
// ═══════════════════════════════════════════════════════════════
function applyLanguage(lang) {
  state.lang = lang;
  const L = LANG[lang];

  // Static text content
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.dataset.i18n;
    if (L[key] !== undefined) node.textContent = L[key];
  });

  // Static innerHTML (hints with <strong>/<em>)
  document.querySelectorAll('[data-i18n-html]').forEach(node => {
    const key = node.dataset.i18nHtml;
    if (L[key] !== undefined) node.innerHTML = L[key];
  });

  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
    const key = node.dataset.i18nPlaceholder;
    if (L[key] !== undefined) node.placeholder = L[key];
  });

  // Lang button active states
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // html lang attribute
  document.documentElement.lang = lang;

  // Re-render dynamic sections
  renderIRCCParams();
  renderRecurringList();
  renderOnetimeList();

  if (state.simulationResult && state._params && state._baseResult) {
    renderResults(state.simulationResult, state._baseResult, state._params, true);
  }
  if (state._stressRan) {
    renderStressTest();
  }
}

// ═══════════════════════════════════════════════════════════════
// SIMULARE PRINCIPALĂ
// ═══════════════════════════════════════════════════════════════
function simulate() {
  const L      = LANG[state.lang];
  const amount = numEl('loanAmount');
  const years  = numEl('loanDuration');
  if (amount <= 0 || years <= 0) {
    alert(L.alert_invalid);
    return;
  }

  const svgPlay = '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5L13 8L3 13.5V2.5Z"/></svg>';
  const btn = el('btnSimulate');
  btn.innerHTML = L.simulating;
  btn.disabled  = true;

  setTimeout(() => {
    try {
      const params = collectParams();

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
      alert(LANG[state.lang].alert_error + e.message);
    }

    btn.innerHTML = `${svgPlay} ${LANG[state.lang].simulate_btn}`;
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

  syncIRCC();

  el('totalVariableRate')?.addEventListener('input', syncIRCC);
  el('bankMargin')?.addEventListener('input', syncIRCC);
  el('initialIRCC')?.addEventListener('input', syncTotal);

  // ── AVANS (Down Payment) Calculator ─────────────────────────────
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
  updateLoanFromAvans();

  // Language toggle
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
  });

  // Ctrl+Enter simulează
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) simulate();
  });

  // Init language (renders dynamic sections + applies all data-i18n)
  applyLanguage('ro');
});
