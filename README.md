# Romanian Mortgage Simulator 🏠

A full-featured mortgage simulator with variable IRCC interest rate, built for the Romanian market. Runs entirely in the browser — no backend, no dependencies to install.

**[Live demo → giroestefanbogdan.github.io/mortgage-simulator](https://giroestefanbogdan.github.io/mortgage-simulator/)**

---

## Features

### Loan Parameters
- Currency: RON or EUR
- Loan amount with built-in down payment calculator (property value + down payment % → loan auto-calculated)
- Loan duration up to 30 years
- Payment type: **Annuity** (fixed monthly payment) or **Decreasing** (fixed principal)
- Configurable life insurance (% per month of remaining balance)

### Two-Period Interest Structure
- **P1 — Fixed period** (optional): fixed interest rate for the first N years (e.g. 4.79% for the first 3 years)
- **P2 — Variable period**: IRCC + bank margin; the three fields (`Total rate`, `Margin`, `IRCC`) are bidirectionally synced — edit any one and the others update automatically
- IRCC update frequency: quarterly or semi-annually

### IRCC Evolution Models
- **Constant** — IRCC stays at the initial value throughout
- **Increase** — configurable linear increase
- **Decrease** — configurable linear decrease
- **Custom** — manually defined values per year range

### Early Repayment
- **Recurring extra monthly payments** over year ranges (e.g. +500 RON/month between years 2–5)
- **Lump-sum payments** at a specific month and year
- Repayment strategy: **reduce loan period** or **reduce monthly payment**

### Results & Analysis
- **KPIs**: total paid, total interest, total savings vs. no-prepayment scenario, estimated payoff date
- **Decision analysis**: automatic interpretation of the simulation results
- **Stress test**: simulates +2% IRCC applied only to the variable period
- **4 charts**: IRCC evolution, monthly payment, remaining balance, comparison with/without prepayment
- **Full amortization table** with pagination and search, columns: Payment, Insurance, Payment+Ins., Interest, Principal, Extra Repayment, Total, Monthly Savings, Remaining Balance
- **CSV export**

---

## Usage

No installation or server required. Just open `index.html` in a browser.

```bash
git clone https://github.com/giroestefanbogdan/mortgage-simulator.git
cd mortgage-simulator
# Open index.html in your browser
```

---

## Default Values

| Parameter | Value |
|---|---|
| Property value | 408,000 RON |
| Down payment | 15% (61,200 RON) |
| Loan amount | 346,800 RON |
| Duration | 30 years |
| P1 — Fixed rate | 4.79% / 3 years |
| P2 — Total variable rate | 7.78% (IRCC 5.68% + margin 2.1%) |
| Life insurance | 0.026% / month of balance |
| IRCC update frequency | Quarterly |

---

## Tech Stack

- HTML + CSS + Vanilla JS — zero frameworks
- [Chart.js](https://www.chartjs.org/) — charts
- Google Fonts: Inter + JetBrains Mono

---

## Disclaimer

All calculations are for illustrative purposes only and do not constitute financial advice. Actual values may differ based on specific bank conditions and the IRCC rate published by the National Bank of Romania (BNR).

IRCC (Indicele de Referință pentru Creditele Consumatorilor) is published quarterly by the BNR and applies to variable-rate mortgage loans granted after May 2019.
