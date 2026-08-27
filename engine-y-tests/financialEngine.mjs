// ============================================================
// financialEngine.mjs — Motor financiero puro (sin UI)
// Interés simple, compuesto y continuo + ecuaciones de valor
// ============================================================

// ---------- INTERÉS SIMPLE ----------
export const futureValueSimple = (VP, i, n) => VP * (1 + i * n);
export const presentValueSimple = (VF, i, n) => VF / (1 + i * n);
export const solveRateSimple = (VP, VF, n) => (VF / VP - 1) / n;
export const solveTimeSimple = (VP, VF, i) => (VF / VP - 1) / i;

// ---------- INTERÉS COMPUESTO ----------
export const futureValueCompound = (VP, i, n) => VP * Math.pow(1 + i, n);
export const presentValueCompound = (VF, i, n) => VF / Math.pow(1 + i, n);
export const solveRateCompound = (VP, VF, n) => Math.pow(VF / VP, 1 / n) - 1;
export const solveTimeCompound = (VP, VF, i) => Math.log(VF / VP) / Math.log(1 + i);

// ---------- INTERÉS CONTINUO ----------
export const futureValueContinuous = (VP, r, t) => VP * Math.exp(r * t);
export const presentValueContinuous = (VF, r, t) => VF * Math.exp(-r * t);
export const solveRateContinuous = (VP, VF, t) => Math.log(VF / VP) / t;
export const solveTimeContinuous = (VP, VF, r) => Math.log(VF / VP) / r;

// ---------- TIEMPO ----------
export function convertTimeToPeriods(anios, meses, mesesPorPeriodo) {
  const totalMeses = anios * 12 + meses;
  return totalMeses / mesesPorPeriodo;
}
export function periodsToYearsMonths(n, mesesPorPeriodo) {
  const totalMeses = n * mesesPorPeriodo;
  const anios = Math.floor(totalMeses / 12 + 1e-9);
  const meses = totalMeses - anios * 12;
  return { anios, meses };
}
export function yearsMonthsToDecimalYears(anios, meses) {
  return anios + meses / 12;
}

// ---------- TRASLADO DE UN FLUJO A UN MOMENTO FOCAL ----------
export function trasladoFlujo(monto, momento, momentoFocal, regimen, tasa) {
  const delta = momentoFocal - momento;
  if (regimen === "simple") {
    if (delta >= 0) return monto * (1 + tasa * delta); // capitalización
    return monto / (1 + tasa * Math.abs(delta)); // descuento racional simple
  }
  if (regimen === "compuesto") return monto * Math.pow(1 + tasa, delta);
  if (regimen === "continuo") return monto * Math.exp(tasa * delta);
  throw new Error("Régimen no reconocido");
}

// ---------- SOLVER GENÉRICO: BISECCIÓN ----------
export function bisection(f, lo, hi, opts = {}) {
  const { tol = 1e-9, maxIter = 200 } = opts;
  let flo = f(lo);
  let fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) {
    return { ok: false, reason: "dominio_invalido" };
  }
  if (flo * fhi > 0) {
    return { ok: false, reason: "sin_cambio_de_signo" };
  }
  let mid = lo,
    fmid = flo;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    mid = (lo + hi) / 2;
    fmid = f(mid);
    if (!Number.isFinite(fmid)) return { ok: false, reason: "dominio_invalido" };
    if (Math.abs(fmid) < tol || (hi - lo) / 2 < tol) {
      return { ok: true, value: mid, iterations: iter, residual: fmid };
    }
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return { ok: false, reason: "no_convergencia", value: mid, residual: fmid };
}

// ---------- ECUACIÓN DE VALOR: FLUJO/MONTO DESCONOCIDO (lineal en X) ----------
// flows: [{ monto, momento, signo: 1|-1, esIncognita, coeficiente }]
// target: valor neto deseado en el momento focal (0 = equilibrio puro)
export function solveUnknownCashFlow(flows, momentoFocal, regimen, tasa, target = 0) {
  let knownSum = 0;
  let unknownCoefSum = 0;
  for (const f of flows) {
    const factor = trasladoFlujo(1, f.momento, momentoFocal, regimen, tasa);
    if (f.esIncognita) {
      unknownCoefSum += f.signo * f.coeficiente * factor;
    } else {
      knownSum += f.signo * f.monto * factor;
    }
  }
  if (unknownCoefSum === 0) return { ok: false, reason: "coeficiente_nulo" };
  const X = (target - knownSum) / unknownCoefSum;
  return { ok: true, value: X, knownSum, unknownCoefSum };
}

// ---------- ECUACIÓN DE VALOR: MOMENTO DESCONOCIDO (vía bisección) ----------
export function solveUnknownCashFlowTime(flows, momentoFocal, regimen, tasa, target, idxIncognita, rango = [0, 600]) {
  const f = (momento) => {
    let total = 0;
    for (let k = 0; k < flows.length; k++) {
      const fl = flows[k];
      const m = k === idxIncognita ? momento : fl.momento;
      total += fl.signo * fl.monto * trasladoFlujo(1, m, momentoFocal, regimen, tasa);
    }
    return total - target;
  };
  return bisection(f, rango[0], rango[1]);
}

// ---------- TASA DESCONOCIDA CON MÚLTIPLES FLUJOS (vía bisección) ----------
export function solveUnknownRateMultiFlow(flows, momentoFocal, regimen, target, rango) {
  const defaultRango = regimen === "compuesto" ? [-0.9999, 10] : [1e-9, 10];
  const [lo, hi] = rango || defaultRango;
  const f = (tasa) => {
    let total = 0;
    for (const fl of flows) {
      total += fl.signo * fl.monto * trasladoFlujo(1, fl.momento, momentoFocal, regimen, tasa);
    }
    return total - target;
  };
  return bisection(f, lo, hi);
}

// ---------- GANANCIA NETA ----------
export function calculateNetInterest(entradas, salidas) {
  const totalEntradas = entradas.reduce((a, b) => a + b, 0);
  const totalSalidas = salidas.reduce((a, b) => a + b, 0);
  return totalEntradas - totalSalidas;
}

// ---------- VALIDACIÓN ----------
export function validateSolution(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  return true;
}

// ---------- FORMATO COLOMBIANO ----------
export function formatNumberCO(value, minDec = 2, maxDec = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  }).format(value);
}
export function formatCurrencyCO(value, currency = "COP", decimals = 2) {
  const symbols = { COP: "$", EUR: "€", USD: "US$" };
  return `${symbols[currency] || "$"} ${formatNumberCO(value, decimals, decimals)}`;
}
export function formatPercentCO(value, decimals = 2) {
  return `${formatNumberCO(value * 100, decimals, decimals)} %`;
}
