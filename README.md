# Simulator Credit Ipotecar 🏠

Un simulator complet pentru credite ipotecare cu dobândă variabilă IRCC, destinat pieței din România. Rulează direct în browser, fără dependențe externe, fără backend.

**[Live demo →](index.html)**

---

## Funcționalități

### Parametri credit
- Monedă: RON sau EUR
- Sumă credit cu calculator de avans integrat (valoare imobil + procent avans → credit auto-calculat)
- Durată credit până la 30 ani
- Tip rată: **Anuitate** (rată fixă lunară) sau **Descrescătoare** (principal fix)
- Asigurare de viață configurabilă (% lunar din soldul rămas)

### Structura dobânzii în două perioade
- **P1 — Perioadă fixă** (opțional): dobândă fixă pentru primii N ani (ex. 4.79% pentru primii 3 ani)
- **P2 — Perioadă variabilă**: IRCC + marjă bancă; câmpurile sunt sincronizate bidirecțional — modifici oricare din cele trei (`Dobândă totală`, `Marjă`, `IRCC`) și celelalte se actualizează automat
- Frecvență actualizare IRCC: trimestrial sau semestrial

### Modele evoluție IRCC
- **Constant** — IRCC rămâne la valoarea inițială
- **Crește** — creștere liniară configurabilă
- **Scade** — scădere liniară configurabilă
- **Custom** — valori definite manual pe intervale de ani

### Rambursare anticipată
- **Plăți lunare suplimentare** pe intervale de ani (ex. +500 RON/lună între anii 2–5)
- **Rambursări ocazionale** (lump sum) la o anumită lună și an
- Opțiune la rambursare: **reduce perioada** sau **reduce rata lunară**

### Rezultate și analiză
- **KPI-uri**: total plătit, total dobândă, economie totală față de scenariul fără rambursare anticipată, dată estimată de lichidare
- **Analiză decizională**: interpretare automată a rezultatelor
- **Stress test**: simulare +2% IRCC aplicat exclusiv perioadei variabile
- **4 grafice**: evoluție IRCC, rată lunară, sold rămas, comparație cu/fără rambursare
- **Tabel de amortizare** complet cu paginare și căutare, cu coloanele: Rată, Asigurare, Rată+Asig., Dobândă, Principal, Rambursare Suplimentară, Total, Economie Lunară, Sold Rămas
- **Export CSV**

---

## Utilizare

Nu necesită instalare sau server. Deschide `index.html` direct în browser.

```
git clone https://github.com/<username>/simulator-credit-ipotecar.git
cd simulator-credit-ipotecar
# Deschide index.html în browser
```

---

## Valori default (configurabile)

| Parametru | Valoare |
|---|---|
| Valoare imobil | 408,000 RON |
| Avans | 15% (61,200 RON) |
| Sumă credit | 346,800 RON |
| Durată | 30 ani |
| P1 — Dobândă fixă | 4.79% / 3 ani |
| P2 — Dobândă totală variabilă | 7.78% (IRCC 5.68% + marjă 2.1%) |
| Asigurare viață | 0.026% / lună din sold |
| Actualizare IRCC | Trimestrial |

---

## Tehnologii

- HTML + CSS + Vanilla JS — zero framework-uri
- [Chart.js](https://www.chartjs.org/) — grafice
- Google Fonts: Inter + JetBrains Mono

---

## Note

Calculele sunt orientative. Simulatorul nu constituie consultanță financiară. Valorile reale pot diferi în funcție de condițiile specifice ale băncii și de evoluția IRCC publicată de BNR.

IRCC (Indicele de Referință pentru Creditele Consumatorilor) este publicat trimestrial de Banca Națională a României și se aplică creditelor ipotecare cu dobândă variabilă acordate după mai 2019.
