import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Home, BookOpen, Calculator, BarChart3, MessageSquare, Library, Plus, Trash2,
  ChevronDown, ChevronUp, Info, ArrowUp, ArrowDown, Check, AlertTriangle, RotateCcw,
} from "lucide-react";

/* ============================================================
   TOKENS DE DISEÑO
   ============================================================ */
const C = {
  navy: "#132A4C", navyDeep: "#0C1E38", navyLight: "#24456F",
  gold: "#B8863B", goldLight: "#D9AE63", goldDeep: "#8C6420",
  paper: "#F3F1EC", paperDark: "#EAE6DA", ink: "#1B1B1B",
  slate: "#5B6472", line: "#DDD7C8", success: "#2F6D4F",
  successBg: "#E8F1EC", danger: "#A23B3B", dangerBg: "#F7E9E7", white: "#FFFFFF",
};
const F_DISPLAY = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const F_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const F_MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

/* ============================================================
   FORMATEO — FUNCIÓN CENTRALIZADA (formato colombiano)
   ============================================================ */
function formatNumberCO(value, minDec = 2, maxDec = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: minDec, maximumFractionDigits: maxDec }).format(value);
}
const CURRENCY_SYMBOLS = { COP: "$", EUR: "€", USD: "US$" };
function formatCurrencyCO(value, currency = "COP", decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${CURRENCY_SYMBOLS[currency] || "$"} ${formatNumberCO(value, decimals, decimals)}`;
}
function formatPercentCO(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumberCO(value * 100, decimals, decimals)} %`;
}

// Solo para los procedimientos: conserva la precisión disponible del motor
// y cambia el punto decimal por coma, sin redondear valores intermedios.
function procRaw(value) {
  if (!Number.isFinite(value)) return "—";
  return String(value).replace(".", ",");
}

/* ============================================================
   MOTOR FINANCIERO — funciones puras (verificadas con 25/25 pruebas)
   ============================================================ */
const futureValueSimple = (VP, i, n) => VP * (1 + i * n);
const presentValueSimple = (VF, i, n) => VF / (1 + i * n);
const solveRateSimple = (VP, VF, n) => (VF / VP - 1) / n;
const solveTimeSimple = (VP, VF, i) => (VF / VP - 1) / i;

const futureValueCompound = (VP, i, n) => VP * Math.pow(1 + i, n);
const presentValueCompound = (VF, i, n) => VF / Math.pow(1 + i, n);
const solveRateCompound = (VP, VF, n) => Math.pow(VF / VP, 1 / n) - 1;
const solveTimeCompound = (VP, VF, i) => Math.log(VF / VP) / Math.log(1 + i);

const futureValueContinuous = (VP, r, t) => VP * Math.exp(r * t);
const presentValueContinuous = (VF, r, t) => VF * Math.exp(-r * t);
const solveRateContinuous = (VP, VF, t) => Math.log(VF / VP) / t;
const solveTimeContinuous = (VP, VF, r) => Math.log(VF / VP) / r;

function convertTimeToPeriods(anios, meses, mesesPorPeriodo) {
  const totalMeses = (Number(anios) || 0) * 12 + (Number(meses) || 0);
  return totalMeses / mesesPorPeriodo;
}
function periodsToYearsMonths(n, mesesPorPeriodo) {
  const totalMeses = n * mesesPorPeriodo;
  const anios = Math.floor(totalMeses / 12 + 1e-9);
  const meses = totalMeses - anios * 12;
  return { anios, meses };
}
function yearsMonthsToDecimalYears(anios, meses) {
  return (Number(anios) || 0) + (Number(meses) || 0) / 12;
}

function trasladoFlujo(monto, momento, momentoFocal, regimen, tasa) {
  const delta = momentoFocal - momento;
  if (regimen === "simple") {
    if (delta >= 0) return monto * (1 + tasa * delta);
    return monto / (1 + tasa * Math.abs(delta));
  }
  if (regimen === "compuesto") return monto * Math.pow(1 + tasa, delta);
  if (regimen === "continuo") return monto * Math.exp(tasa * delta);
  return NaN;
}

function bisection(f, lo, hi, opts = {}) {
  const { tol = 1e-9, maxIter = 200 } = opts;
  let flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return { ok: false, reason: "dominio_invalido" };
  if (flo * fhi > 0) return { ok: false, reason: "sin_cambio_de_signo" };
  let mid = lo, fmid = flo, iter = 0;
  for (; iter < maxIter; iter++) {
    mid = (lo + hi) / 2;
    fmid = f(mid);
    if (!Number.isFinite(fmid)) return { ok: false, reason: "dominio_invalido" };
    if (Math.abs(fmid) < tol || (hi - lo) / 2 < tol) return { ok: true, value: mid, iterations: iter, residual: fmid };
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return { ok: false, reason: "no_convergencia", value: mid, residual: fmid };
}

function solveUnknownCashFlow(flows, momentoFocal, regimen, tasa, target = 0) {
  let knownSum = 0, unknownCoefSum = 0;
  for (const f of flows) {
    const factor = trasladoFlujo(1, f.momento, momentoFocal, regimen, tasa);
    if (f.esIncognita) unknownCoefSum += f.signo * f.coeficiente * factor;
    else knownSum += f.signo * f.monto * factor;
  }
  if (unknownCoefSum === 0 || !Number.isFinite(unknownCoefSum)) return { ok: false, reason: "coeficiente_nulo" };
  const X = (target - knownSum) / unknownCoefSum;
  if (!Number.isFinite(X)) return { ok: false, reason: "resultado_invalido" };
  return { ok: true, value: X, knownSum, unknownCoefSum };
}

function solveUnknownCashFlowTime(flows, momentoFocal, regimen, tasa, target, idxIncognita, rango = [0, 600]) {
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

function solveUnknownRateMultiFlow(flows, momentoFocal, regimen, target, rango) {
  const defaultRango = regimen === "compuesto" ? [-0.9999, 10] : [1e-9, 10];
  const [lo, hi] = rango || defaultRango;
  const f = (tasa) => {
    let total = 0;
    for (const fl of flows) total += fl.signo * fl.monto * trasladoFlujo(1, fl.momento, momentoFocal, regimen, tasa);
    return total - target;
  };
  return bisection(f, lo, hi);
}

function validateSolution(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/* ============================================================
   CONVERSIÓN DE TASAS — MOTOR CENTRALIZADO
   Se reutiliza en: interés compuesto, calculadora de tasas y anualidades.
   Funciones puras (no dependen de React). NO se usa en interés simple
   ni en interés continuo.
   Convención del curso: año = 365 días = 52 semanas = 12 meses.
   ============================================================ */
// Convención ajustable: si el profesor usa otra para "quincenal", cambiar solo esta constante.
const QUINCENAS_ANIO = 24;

const PERIODOS_TASA = [
  { value: "diario", label: "Diario", frecuencia: 365 },
  { value: "semanal", label: "Semanal", frecuencia: 52 },
  { value: "quincenal", label: "Quincenal", frecuencia: QUINCENAS_ANIO },
  { value: "mensual", label: "Mensual", frecuencia: 12 },
  { value: "bimestral", label: "Bimestral", frecuencia: 6 },
  { value: "trimestral", label: "Trimestral", frecuencia: 4 },
  { value: "cuatrimestral", label: "Cuatrimestral", frecuencia: 3 },
  { value: "quintumestral", label: "Quintumestral", frecuencia: 12 / 5 },
  { value: "semestral", label: "Semestral", frecuencia: 2 },
  { value: "anual", label: "Anual", frecuencia: 1 },
  { value: "personalizado_meses", label: "Personalizado en meses", frecuencia: null },
];
const OPC_PERIODOS_TASA = PERIODOS_TASA.map((p) => ({ value: p.value, label: p.label }));
const OPC_PERIODOS_CUOTAS = PERIODOS_TASA
  .filter((p) => !["diario", "semanal", "quincenal"].includes(p.value))
  .map((p) => ({ value: p.value, label: p.label }));
const OPC_TIPO_TASA = [{ value: "nominal", label: "Nominal" }, { value: "efectiva", label: "Efectiva / periódica" }];
const OPC_MODALIDAD = [{ value: "vencida", label: "Vencida" }, { value: "anticipada", label: "Anticipada" }];

function parseNumCO(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  let txt = String(v).trim();
  if (txt.includes(",")) txt = txt.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(txt)) txt = txt.replace(/\./g, "");
  return parseFloat(txt);
}

function obtenerFrecuenciaAnual(periodo, mesesPersonalizados) {
  const p = PERIODOS_TASA.find((x) => x.value === periodo);
  if (!p) throw new Error("Periodo no reconocido.");
  if (p.value === "personalizado_meses") {
    const m = Number(mesesPersonalizados);
    if (!Number.isFinite(m) || m <= 0) throw new Error("El periodo personalizado en meses debe ser un número mayor que 0.");
    return 12 / m;
  }
  return p.frecuencia;
}

function nombrePeriodoTasa(periodo, meses) {
  const p = PERIODOS_TASA.find((x) => x.value === periodo);
  if (!p) return "";
  return periodo === "personalizado_meses" ? `cada ${formatNumberCO(Number(meses), 0, 4)} meses` : p.label.toLowerCase();
}

function descripcionTasa({ tasaPct, tipo, modalidad, periodo, meses }) {
  const per = nombrePeriodoTasa(periodo, meses);
  const val = `${formatNumberCO(tasaPct, 0, 6)} %`;
  return tipo === "nominal"
    ? `${val} nominal anual, capitalización ${per}, ${modalidad}`
    : `${val} efectiva/periódica ${per}, ${modalidad}`;
}

function normalizarTasaEntradaAEffectiveAnnual({ tasaPct, tipo, modalidad, periodo, mesesPersonalizados }) {
  const t = Number(tasaPct);
  if (!Number.isFinite(t)) throw new Error("La tasa ingresada debe ser numérica.");
  const f = obtenerFrecuenciaAnual(periodo, mesesPersonalizados);
  if (!(f > 0)) throw new Error("La frecuencia anual debe ser positiva.");
  const pct = (x) => formatPercentCO(x, 4);
  const fTxt = formatNumberCO(f, 0, 4);
  const r = t / 100;
  const pasos = [{ label: "Tasa ingresada", content: descripcionTasa({ tasaPct: t, tipo, modalidad, periodo, meses: mesesPersonalizados }) }];
  let ip = r;
  if (tipo === "nominal") {
    ip = r / f;
    pasos.push({ label: "Nominal → periódica (repartir)", content: `ip = NA / nc = ${pct(r)} / ${fTxt} = ${pct(ip)}` });
  } else {
    pasos.push({ label: "Efectiva / periódica", content: `ip = ${pct(ip)} (ya es la tasa del periodo)` });
  }
  let iv = ip;
  if (modalidad === "anticipada") {
    if (ip >= 1) throw new Error("La tasa anticipada no puede ser igual o mayor a 100 %.");
    iv = ip / (1 - ip);
    pasos.push({ label: "Anticipada → vencida", content: `iv = ia / (1 − ia) = ${pct(ip)} / (1 − ${pct(ip)}) = ${pct(iv)}` });
  } else {
    pasos.push({ label: "Vencida", content: `Se conserva la tasa periódica vencida: iv = ${pct(iv)}` });
  }
  if (!(1 + iv > 0)) throw new Error("La tasa ingresada no es válida (1 + i debe ser positivo).");
  const EA = Math.pow(1 + iv, f) - 1;
  pasos.push({ label: "Periódica vencida → efectiva anual", content: `EA = (1 + iv)^${fTxt} − 1 = ${pct(EA)}` });
  return { ipPeriodica: ip, ivPeriodica: iv, EA, frecuencia: f, pasos };
}

function convertirTasa(p) {
  const mesesEnt = p.mesesEntradaPersonalizados ?? p.periodoEntradaPersonalizadoMeses;
  const mesesSal = p.mesesSalidaPersonalizados ?? p.periodoSalidaPersonalizadoMeses;
  const pct = (x) => formatPercentCO(x, 4);
  const ent = normalizarTasaEntradaAEffectiveAnnual({
    tasaPct: p.tasaPct, tipo: p.tipoEntrada, modalidad: p.modalidadEntrada, periodo: p.periodoEntrada, mesesPersonalizados: mesesEnt,
  });
  const fS = obtenerFrecuenciaAnual(p.periodoSalida, mesesSal);
  if (!(fS > 0)) throw new Error("La frecuencia anual debe ser positiva.");
  const fSTxt = formatNumberCO(fS, 0, 4);
  const pasos = [...ent.pasos];
  const ivS = Math.pow(1 + ent.EA, 1 / fS) - 1;
  pasos.push({ label: "Efectiva anual → periódica vencida de salida", content: `iv salida = (1 + EA)^(1/${fSTxt}) − 1 = ${pct(ivS)}` });
  let periodicaS = ivS;
  if (p.modalidadSalida === "anticipada") {
    periodicaS = ivS / (1 + ivS);
    pasos.push({ label: "Vencida → anticipada", content: `ia = iv / (1 + iv) = ${pct(ivS)} / (1 + ${pct(ivS)}) = ${pct(periodicaS)}` });
  }
  let resultado = periodicaS;
  if (p.tipoSalida === "nominal") {
    resultado = periodicaS * fS;
    pasos.push({ label: "Periódica → nominal (juntar)", content: `NA = ip × nc = ${pct(periodicaS)} × ${fSTxt} = ${pct(resultado)}` });
  } else {
    pasos.push({ label: "Tasa efectiva / periódica de salida", content: `Resultado = ${pct(resultado)}` });
  }
  pasos.push({ label: "Resultado", content: descripcionTasa({ tasaPct: resultado * 100, tipo: p.tipoSalida, modalidad: p.modalidadSalida, periodo: p.periodoSalida, meses: mesesSal }) });
  return {
    resultadoDecimal: resultado, resultadoPorcentaje: resultado * 100, pasosProcedimiento: pasos, pasos,
    tasaEfectivaAnualIntermedia: ent.EA, tasaPeriodicaVencidaEntrada: ent.ivPeriodica, tasaPeriodicaVencidaSalida: ivS,
    frecuenciaEntrada: ent.frecuencia, frecuenciaSalida: fS,
  };
}

// Devuelve SIEMPRE la tasa efectiva vencida del periodo de la operación.
function convertirTasaAPeriodoOperacion(p) {
  const conv = convertirTasa({
    tasaPct: p.tasaPct, tipoEntrada: p.tipoEntrada, modalidadEntrada: p.modalidadEntrada,
    periodoEntrada: p.periodoEntrada, mesesEntradaPersonalizados: p.mesesEntradaPersonalizados,
    tipoSalida: "efectiva", modalidadSalida: "vencida",
    periodoSalida: p.periodoOperacion, mesesSalidaPersonalizados: p.mesesOperacionPersonalizados,
  });
  const atajo = Math.pow(1 + conv.tasaPeriodicaVencidaEntrada, conv.frecuenciaEntrada / conv.frecuenciaSalida) - 1;
  const pasos = [...conv.pasos];
  pasos.splice(pasos.length - 1, 0, {
    label: "Atajo equivalente (mismo resultado)",
    content: `(1 + iv)^(${formatNumberCO(conv.frecuenciaEntrada, 0, 4)}/${formatNumberCO(conv.frecuenciaSalida, 0, 4)}) − 1 = ${formatPercentCO(atajo, 4)}`,
  });
  return { ...conv, pasos, pasosProcedimiento: pasos, iEfectivaVencida: conv.resultadoDecimal };
}

/* ============================================================
   ANUALIDADES — funciones puras. i = efectiva vencida del periodo de las cuotas.
   ============================================================ */
function factorVPAnualidad({ modalidadAnualidad, i, n }) {
  const base = Math.abs(i) < 1e-12 ? n : (1 - Math.pow(1 + i, -n)) / i;
  return modalidadAnualidad === "anticipada" ? base * (1 + i) : base;
}
function factorVFAnualidad({ modalidadAnualidad, i, n }) {
  const base = Math.abs(i) < 1e-12 ? n : (Math.pow(1 + i, n) - 1) / i;
  return modalidadAnualidad === "anticipada" ? base * (1 + i) : base;
}

// Convención: las cuotas son "salidas". Un pago adicional de salida suma; uno de entrada resta.
function calcularAnualidad({ modalidadAnualidad, tipoCalculo, A, VP, VF, n, i, pagosExtra = [], baseObjetivo = "VP" }) {
  if (!Number.isFinite(n) || n <= 0) throw new Error("El número de cuotas n debe ser mayor que 0.");
  if (!Number.isFinite(i) || i <= -1) throw new Error("La tasa efectiva vencida del periodo no es válida.");
  const need = (v, nombre) => { if (!Number.isFinite(v)) throw new Error(`Ingresa un valor numérico para ${nombre}.`); };
  const fVPa = factorVPAnualidad({ modalidadAnualidad, i, n });
  const fVFa = factorVFAnualidad({ modalidadAnualidad, i, n });
  const conExtras = ["VP_extras", "VF_extras", "extra_desconocido", "A_extras_VP", "A_extras_VF"].includes(tipoCalculo);
  const extras = conExtras ? pagosExtra : [];
  const base = ["VP", "A_desde_VP", "VP_extras", "A_extras_VP"].includes(tipoCalculo) ? "VP"
    : tipoCalculo === "extra_desconocido" ? baseObjetivo : "VF";
  const fa = base === "VP" ? fVPa : fVFa;
  const signo = (e) => (e.direccion === "entrada" ? -1 : 1);
  const factorK = (k) => (base === "VP" ? Math.pow(1 + i, -k) : Math.pow(1 + i, n - k));
  extras.forEach((e, idx) => {
    if (!Number.isFinite(e.momento) || e.momento < 0 || e.momento > n) throw new Error(`El momento del pago adicional ${idx + 1} debe estar entre 0 y ${n}.`);
    if (!e.desconocido) need(e.monto, `el monto del pago adicional ${idx + 1}`);
  });
  const nDesc = extras.filter((e) => e.desconocido).length;
  if (tipoCalculo === "extra_desconocido" && nDesc !== 1) throw new Error("Marca exactamente un pago adicional como desconocido.");
  if (tipoCalculo !== "extra_desconocido" && nDesc > 0) throw new Error("Hay un pago marcado como desconocido: elige 'Pago adicional desconocido' en qué deseas calcular, o desmarca el pago.");
  if (conExtras && extras.length === 0) throw new Error("Agrega al menos un pago adicional.");
  const trasl = extras.filter((e) => !e.desconocido).map((e) => ({
    monto: e.monto, momento: e.momento, direccion: e.direccion, signo: signo(e), factor: factorK(e.momento), valor: signo(e) * e.monto * factorK(e.momento),
  }));
  const sumaExtras = trasl.reduce((s, e) => s + e.valor, 0);
  let valor, etiqueta, Ausada = A, residual = 0, coef = null, objetivo = null;
  switch (tipoCalculo) {
    case "VP": need(A, "la cuota A"); valor = A * fVPa; etiqueta = "Valor presente (VP)"; break;
    case "VF": need(A, "la cuota A"); valor = A * fVFa; etiqueta = "Valor futuro (VF)"; break;
    case "A_desde_VP": need(VP, "VP"); valor = VP / fVPa; Ausada = valor; etiqueta = "Cuota (A) desde VP"; break;
    case "A_desde_VF": need(VF, "VF"); valor = VF / fVFa; Ausada = valor; etiqueta = "Cuota (A) desde VF"; break;
    case "VP_extras": need(A, "la cuota A"); valor = A * fVPa + sumaExtras; etiqueta = "VP total con pagos adicionales"; break;
    case "VF_extras": need(A, "la cuota A"); valor = A * fVFa + sumaExtras; etiqueta = "VF total con pagos adicionales"; break;
    case "extra_desconocido": {
      need(A, "la cuota A");
      objetivo = base === "VP" ? VP : VF; need(objetivo, base === "VP" ? "VP objetivo" : "VF objetivo");
      const u = extras.find((e) => e.desconocido);
      coef = signo(u) * factorK(u.momento);
      if (coef === 0 || !Number.isFinite(coef)) throw new Error("No se puede despejar el pago desconocido con ese momento.");
      valor = (objetivo - A * fa - sumaExtras) / coef; etiqueta = "Pago adicional desconocido (X)";
      residual = A * fa + sumaExtras + coef * valor - objetivo; break;
    }
    case "A_extras_VP": need(VP, "VP"); objetivo = VP; valor = (VP - sumaExtras) / fVPa; Ausada = valor; etiqueta = "Cuota (A) con pagos adicionales desde VP"; residual = valor * fVPa + sumaExtras - VP; break;
    case "A_extras_VF": need(VF, "VF"); objetivo = VF; valor = (VF - sumaExtras) / fVFa; Ausada = valor; etiqueta = "Cuota (A) con pagos adicionales desde VF"; residual = valor * fVFa + sumaExtras - VF; break;
    default: throw new Error("Tipo de cálculo no reconocido.");
  }
  if (!Number.isFinite(valor)) throw new Error("Con estos datos no hay una solución válida.");
  return { valor, etiqueta, base, fa, fVPa, fVFa, trasl, sumaExtras, coef, objetivo, residual, A: Ausada };
}

/* ============================================================
   DATOS ESTÁTICOS
   ============================================================ */
const PERIODICIDADES = [
  { value: "mensual", label: "Mensual", meses: 1 },
  { value: "bimestral", label: "Bimestral", meses: 2 },
  { value: "trimestral", label: "Trimestral", meses: 3 },
  { value: "cuatrimestral", label: "Cuatrimestral", meses: 4 },
  { value: "semestral", label: "Semestral", meses: 6 },
  { value: "anual", label: "Anual", meses: 12 },
  { value: "personalizada", label: "Cada N meses", meses: null },
];

const GLOSARIO = [
  { t: "VP", d: "Valor presente. Es el valor de una plata mirada en el momento de hoy o en un momento de referencia." },
  { t: "VF", d: "Valor futuro. Es el valor de una plata mirada al final, después de que pasa el tiempo." },
  { t: "i", d: "Tasa periódica de interés. Es el porcentaje que se aplica en cada periodo, por ejemplo cada mes." },
  { t: "n", d: "Número de periodos. En anualidades casi siempre coincide con el número de cuotas." },
  { t: "r", d: "Tasa continua. Se usa cuando el dinero se modela como si creciera todo el tiempo, sin pausas." },
  { t: "t", d: "Tiempo en años. Por ejemplo, 2 años y medio." },
  { t: "Capital", d: "La plata inicial con la que empieza la operación." },
  { t: "Interés", d: "La plata adicional que pagas o ganas por usar dinero durante un tiempo." },
  { t: "Periodo", d: "Intervalo de tiempo entre dos momentos de la operación: un mes, un trimestre, un semestre, etc." },
  { t: "Periodicidad", d: "Cada cuánto pasa algo. Por ejemplo: cada mes." },
  { t: "Flujo", d: "Una plata que entra o sale." },
  { t: "Momento", d: "El lugar donde cae un pago en la línea de tiempo. El 0 es hoy." },
  { t: "Línea de tiempo", d: "Un dibujito para ver cuándo pasa cada pago." },
  { t: "Momento focal", d: "Momento donde comparamos todos los pagos. Es como tomar una foto: todos los pagos deben llevarse a esa misma fecha." },
  { t: "Fecha focal", d: "Es el mismo momento focal: la fecha donde ubicamos todos los pagos para poder compararlos." },
  { t: "Ecuación de valor", d: "Una cuenta donde todos los pagos están en el mismo día. Sirve para encontrar el número que falta." },
  { t: "Coeficiente", d: "Un número que acompaña a otro. Por ejemplo, 2X quiere decir dos veces X." },
  { t: "Capitalización", d: "Momento en que los intereses se suman al capital y desde ahí también generan nuevos intereses." },
  { t: "Descuento", d: "Traer una plata del futuro hacia hoy." },
  { t: "Tasa nominal", d: "Tasa anual expresada con una frecuencia de capitalización. Por ejemplo, nominal anual capitalizable mensual." },
  { t: "Tasa efectiva", d: "Tasa que muestra el crecimiento o costo de un periodo específico, teniendo en cuenta la capitalización." },
  { t: "Anualidad", d: "Una fila de pagos iguales. Como muchas galletas del mismo tamaño." },
  { t: "Anualidad vencida", d: "Pagos iguales que se hacen al final. Primero pasa el tiempo y después pagas." },
  { t: "Cuota (A)", d: "La plata igual que pagas cada vez." },
  { t: "Pago periódico", d: "Un pago que se repite. Por ejemplo, todos los meses." },
  { t: "Valor presente de una anualidad", d: "La foto de HOY de todas las cuotas juntas." },
  { t: "Valor futuro de una anualidad", d: "La foto del FINAL de todas las cuotas juntas." },
  { t: "Pago extra", d: "Un pago diferente a las cuotas. Es una galleta aparte." },
  { t: "Pago extraordinario", d: "Otro nombre para pago extra." },
  { t: "Anualidad anticipada", d: "Pagos iguales que se hacen al inicio. Primero pagas y después pasa el tiempo." },
  { t: "Tasa anticipada", d: "Tasa donde el interés del periodo se descuenta o se paga al inicio del periodo." },
  { t: "Cuota anticipada", d: "Una cuota que pagas al comienzo." },
  { t: "Valor presente de una anualidad anticipada", d: "La foto de HOY de cuotas que se pagan al inicio." },
  { t: "Valor futuro de una anualidad anticipada", d: "La foto del FINAL de cuotas que se pagan al inicio." },
  { t: "NAMA", d: "Tasa anual que se parte por meses y se cobra al inicio." },
  { t: "NACA", d: "Tasa anual que se parte cada cuatro meses y se cobra al inicio." },
  { t: "NATA", d: "Tasa anual que se parte cada tres meses y se cobra al inicio." },
  { t: "Tasa efectiva vencida", d: "Tasa periódica efectiva que se paga al final del periodo. Es la tasa que entra en las fórmulas de anualidades." },
  { t: "Conversión automática de tasas", d: "La app expresa la tasa en el periodo correcto antes de calcular." },
  { t: "Periodo de la operación", d: "El tamaño del tiempo que usa la cuenta: mes, trimestre, semestre, etc." },
  { t: "Periodo de las cuotas", d: "Cada cuánto pagas una cuota." },
  { t: "Pago adicional desconocido", d: "Un pago extra que no sabemos cuánto vale y queremos encontrar." },
];

const EJEMPLOS = {
  simple: { VP: "1000000", tasa: "3.8", periodicidad: "trimestral", nPersonalizado: "", anios: "7", meses: "6", incognita: "VP", VF: "3622937", operacion: "credito" },
  compuesto: { VP: "1000000", tasa: "3", periodicidad: "trimestral", nPersonalizado: "", anios: "3", meses: "0", incognita: "VF", VF: "", operacion: "inversion" },
  continuo: { VP: "850000", tasa: "8.95", anios: "2", meses: "6", incognita: "VF", VF: "", operacion: "inversion" },
};
/* ============================================================
   PERSISTENCIA — historial local compatible con navegador/Vercel
   ============================================================ */

const HISTORIAL_KEY = "numeris:historial:v1";
const HISTORIAL_MAX = 30;

function leerHistorialStorage() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(HISTORIAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function guardarHistorial(entry) {
  if (typeof window === "undefined" || !window.localStorage) return false;

  try {
    const actual = leerHistorialStorage();

    const nuevo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      fecha: entry.fecha || new Date().toISOString(),
    };

    const actualizado = [nuevo, ...actual].slice(0, HISTORIAL_MAX);

    window.localStorage.setItem(
      HISTORIAL_KEY,
      JSON.stringify(actualizado)
    );

    return true;
  } catch {
    return false;
  }
}

async function cargarHistorial() {
  return leerHistorialStorage();
}

async function borrarHistorial() {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    window.localStorage.removeItem(HISTORIAL_KEY);
  } catch {
    // No hacer nada si falla
  }
}

function formatearResultadoHistorial(h) {
  if (!Number.isFinite(h.resultado)) return "";

  if (h.resultadoTipo === "tasa") {
    return formatPercentCO(h.resultado, 4);
  }

  if (h.resultadoTipo === "tiempo") {
    const unidad = h.regimen === "continuo" ? "años" : "periodos";
    return `${formatNumberCO(h.resultado, 2, 6)} ${unidad}`;
  }

  return formatCurrencyCO(
    h.resultado,
    h.moneda || "COP"
  );
}


/* ============================================================
   COMPONENTES DE UTILIDAD
   ============================================================ */
function Section({ children, style }) {
  return <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 20px", ...style }}>{children}</div>;
}

function Etiqueta({ children }) {
  return (
    <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold, fontWeight: 700, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Tarjeta({ children, style }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 10, padding: 22, ...style }}>
      {children}
    </div>
  );
}

function Boton({ children, onClick, variant = "primary", type = "button", small, style, disabled }) {
  const base = {
    fontFamily: F_BODY, fontWeight: 600, fontSize: small ? 13 : 14.5, cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 7, padding: small ? "7px 13px" : "11px 20px", border: "1px solid transparent",
    display: "inline-flex", alignItems: "center", gap: 7, transition: "opacity .15s", opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: C.navy, color: C.white },
    gold: { background: C.gold, color: C.navyDeep },
    outline: { background: "transparent", color: C.navy, border: `1px solid ${C.navy}` },
    ghost: { background: "transparent", color: C.slate },
    danger: { background: "transparent", color: C.danger, border: `1px solid ${C.danger}55` },
  };
  return (
    <button type={type} disabled={disabled} onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}
      onFocus={(e) => (e.target.style.outline = `2px solid ${C.gold}`)}
      onBlur={(e) => (e.target.style.outline = "none")}>
      {children}
    </button>
  );
}

function Campo({ label, children, help }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 5 }}>{label}</span>
      {children}
      {help && <span style={{ display: "block", fontSize: 11.5, color: C.slate, marginTop: 4 }}>{help}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: F_MONO, fontSize: 14.5, padding: "10px 12px",
  border: `1px solid ${C.line}`, borderRadius: 6, background: C.paper, color: C.ink,
};
const selectStyle = { ...inputStyle, fontFamily: F_BODY };

function Entrada(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function Selector({ value, onChange, options, ...rest }) {
  return (
    <select value={value} onChange={onChange} style={selectStyle} {...rest}>
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

function Acordeon({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: C.white }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px",
        background: "transparent", border: "none", cursor: "pointer", fontFamily: F_BODY, fontSize: 15, fontWeight: 600, color: C.navy,
      }}>
        {title}{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}

/* Ficha de procedimiento — elemento distintivo tipo "recibo" con pasos numerados */
function FichaProcedimiento({ pasos }) {
  return (
    <div style={{ background: C.navyDeep, borderRadius: 10, padding: "20px 22px", marginTop: 14 }}>
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.goldLight, marginBottom: 14 }}>
        Procedimiento completo
      </div>
      {pasos.map((p, idx) => (
        <div key={idx} style={{ display: "flex", gap: 14, padding: "9px 0", borderTop: idx === 0 ? "none" : `1px dashed #ffffff22` }}>
          <div style={{ fontFamily: F_MONO, fontSize: 12, color: C.goldLight, minWidth: 20, fontWeight: 700 }}>{String(idx + 1).padStart(2, "0")}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: "#C9D2DF", marginBottom: 2 }}>{p.label}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 14, color: C.white }}>{p.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Verificacion({ ok, residual, mensaje }) {
  return (
    <div style={{
      marginTop: 14, padding: "12px 16px", borderRadius: 8,
      background: ok ? C.successBg : C.dangerBg, display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      {ok ? <Check size={17} color={C.success} style={{ marginTop: 2, flexShrink: 0 }} /> : <AlertTriangle size={17} color={C.danger} style={{ marginTop: 2, flexShrink: 0 }} />}
      <div style={{ fontSize: 13.5, color: ok ? C.success : C.danger }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{ok ? "Verificación matemática: ecuación satisfecha" : "No fue posible verificar"}</div>
        {mensaje || (Number.isFinite(residual) && <span>Resultado sustituido nuevamente en la ecuación. Error residual: <span style={{ fontFamily: F_MONO }}>{residual.toExponential(2)}</span></span>)}
      </div>
    </div>
  );
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
const SECCIONES = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "aprender", label: "Educación Financiera", icon: BookOpen },
  { id: "simular", label: "Simulación", icon: Calculator },
  { id: "comparar", label: "Comparar", icon: BarChart3 },
  { id: "glosario", label: "Glosario", icon: Library },
  { id: "interacciones", label: "Interacciones", icon: MessageSquare },
];

function Nav({ activa, setActiva, moneda, setMoneda }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.navy, borderBottom: `3px solid ${C.gold}` }}>
      <Section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: F_DISPLAY, fontSize: 24, color: C.white, letterSpacing: "0.01em" }}>Numeris</div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: C.goldLight, letterSpacing: "0.08em", textTransform: "uppercase" }}>Educación y simulación financiera</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SECCIONES.map((s) => {
            const Icon = s.icon; const activeSec = activa === s.id;
            return (
              <button key={s.id} onClick={() => setActiva(s.id)} aria-current={activeSec ? "page" : undefined} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: activeSec ? C.gold : "transparent", color: activeSec ? C.navyDeep : "#D8DEE9",
                fontFamily: F_BODY, fontSize: 13, fontWeight: 600,
              }}>
                <Icon size={14} />{s.label}
              </button>
            );
          })}
        </div>
        <Selector value={moneda} onChange={(e) => setMoneda(e.target.value)}
          options={[{ value: "COP", label: "COP · $" }, { value: "EUR", label: "EUR · €" }, { value: "USD", label: "USD · US$" }]}
          style={{ ...selectStyle, width: 130, background: C.navyLight, color: C.white, border: `1px solid ${C.navyLight}` }} />
      </Section>
    </div>
  );
}

/* ============================================================
   INICIO
   ============================================================ */
function Inicio({ ir }) {
  return (
    <Section style={{ paddingTop: 56, paddingBottom: 60 }}>
      <div style={{ maxWidth: 660 }}>
        <Etiqueta>Caso aplicado · Matemáticas Financieras · Segundo corte 2026-2</Etiqueta>
        <h1 style={{ fontFamily: F_DISPLAY, fontSize: 44, lineHeight: 1.1, color: C.navy, margin: "0 0 18px" }}>
          Entiende tu dinero antes de decidir.
        </h1>
        <p style={{ fontSize: 16.5, color: C.slate, lineHeight: 1.6, marginBottom: 30 }}>
          Aprende cómo funcionan los intereses y simula créditos e inversiones de forma clara, verificable y fácil de entender.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Boton variant="gold" onClick={() => ir("aprender")}>Aprender</Boton>
          <Boton variant="primary" onClick={() => ir("simular")}>Simular</Boton>
          <Boton variant="outline" onClick={() => ir("comparar")}>Comparar</Boton>
        </div>
      </div>

      <div style={{ marginTop: 60, borderTop: `1px solid ${C.line}`, paddingTop: 40 }}>
        <h2 style={{ fontFamily: F_DISPLAY, fontSize: 24, color: C.navy, marginBottom: 22 }}>¿Qué puedes hacer aquí?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px,1fr))", gap: 16 }}>
          {[
            { t: "Aprender", d: "Entiende los conceptos de matemáticas financieras con explicaciones sencillas y ejemplos prácticos. Aprende sobre interés simple, compuesto y continuo, conversión de tasas, tasas nominales y efectivas, tasas anticipadas y vencidas, y anualidades vencidas y anticipadas.", i: BookOpen },
            { t: "Simular", d: "Explora créditos, ahorros e inversiones mediante simulaciones interactivas. Convierte tasas, calcula cuotas y valores, y analiza pagos periódicos y extraordinarios en diferentes situaciones financieras", i: Calculator },
            { t: "Comparar", d: "Compara tasas, formas de pago y diferentes escenarios financieros para entender cómo cambian los resultados y reconocer qué opciones pueden ser equivalentes.", i: BarChart3 },
          ].map((it) => (
            <Tarjeta key={it.t}>
              <it.i size={20} color={C.gold} />
              <div style={{ fontWeight: 700, color: C.navy, margin: "10px 0 6px", fontSize: 16 }}>{it.t}</div>
              <div style={{ fontSize: 13.5, color: C.slate, lineHeight: 1.5 }}>{it.d}</div>
            </Tarjeta>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 40, padding: 16, background: C.paperDark, borderRadius: 8, fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>
        Esta herramienta tiene fines educativos y de simulación. Es solo para estudiar y practicar. No es consejo de banco.
      </div>

      <div style={{ marginTop: 30, fontSize: 11.5, color: C.slate, lineHeight: 1.7 }}>
        Proyecto académico · Matemáticas Financieras · Segundo Corte 2026-2<br />
        Desarrollado con asistencia de Replit Agent y herramientas de inteligencia artificial.
      </div>
    </Section>
  );
}

/* ============================================================
   APRENDER
   ============================================================ */
/* ============================================================
   APRENDER
   ============================================================ */
function ExplicacionSencilla({ children }) {
  return (
    <div style={{
      background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10,
      padding: "16px 18px", margin: "14px 0",
    }}>
      <div style={{
        fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
        color: C.goldDeep, fontWeight: 700, marginBottom: 8,
      }}>
        💡 Explicación sencilla
      </div>
      <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65, whiteSpace: "pre-line" }}>{children}</div>
    </div>
  );
}

function BloqueInteres({
  queEs, analogia, comoFunciona, usoLabel, usoRespuesta,
  formula, despejes, ejemploTexto, pasosEjemplo, notaEspecial,
}) {
  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>
      <p><strong>¿Qué es?</strong> {queEs}</p>

      <ExplicacionSencilla>{analogia}</ExplicacionSencilla>

      <p><strong>¿Cómo funciona?</strong> {comoFunciona}</p>
      <p style={{ color: C.slate }}><strong>{usoLabel}</strong> {usoRespuesta}</p>

      {notaEspecial && (
        <div style={{ marginTop: 10, marginBottom: 10, padding: 12, background: `${C.gold}1a`, borderRadius: 6, fontSize: 13, color: C.goldDeep, fontWeight: 600 }}>
          {notaEspecial}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Fórmula</div>
        <div style={{ fontFamily: F_MONO, fontSize: 20, background: C.paper, padding: "14px 18px", borderRadius: 8, marginBottom: 10, color: C.navy }}>{formula}</div>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Despejes (para hallar cada variable)</div>
        <ul style={{ fontFamily: F_MONO, fontSize: 14, paddingLeft: 18, margin: 0 }}>
          {despejes.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d}</li>)}
        </ul>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico resuelto</div>
        <p style={{ fontSize: 14, color: C.ink }}>{ejemploTexto}</p>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={pasosEjemplo} />
        </Acordeon>
      </div>
    </div>
  );
}

/* ============================================================
   CONVERSIÓN DE TASAS — módulo educativo (construido desde cero)
   Sigue el orden de la presentación de clase "Tipos de tasas y
   conversión": nombre/apellidos, nominal↔periódica, efectiva,
   equivalencia entre efectivas, capitalización, vencida↔anticipada,
   ejemplo completo NAC→NAS y errores comunes.
   ============================================================ */

function TarjetaMini({ titulo, children, tono = "neutral" }) {
  const fondos = {
    neutral: C.paperDark,
    azul: "#EAF2FF",
    alerta: C.dangerBg,
  };
  const bordes = {
    neutral: C.line,
    azul: "#B8D0F5",
    alerta: `${C.danger}55`,
  };
  return (
    <div style={{
      background: fondos[tono], border: `1px solid ${bordes[tono]}`, borderRadius: 8,
      padding: "14px 16px", flex: "1 1 180px", minWidth: 180,
    }}>
      <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function BloqueFormula({ children }) {
  return (
    <div style={{
      fontFamily: F_MONO, fontSize: 18, background: C.paper, padding: "14px 18px",
      borderRadius: 8, margin: "10px 0", color: C.navy, overflowX: "auto",
    }}>
      {children}
    </div>
  );
}

function NivelCinco({ children, titulo = "🧸 Nivel 5 años" }) {
  return (
    <div style={{
      background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10,
      padding: "16px 18px", marginBottom: 20,
    }}>
      <div style={{
        fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
        color: C.goldDeep, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
      }}>
        {titulo}
      </div>
      <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65, whiteSpace: "pre-line" }}>{children}</div>
    </div>
  );
}

function ConversionTasas() {
  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco>
        {`Imagina que tienes una plantica y le echas agua todos los días.
La planta va creciendo poquito a poquito, cada día.

Un amigo te pregunta: "¿cuánto creció tu planta?"
Tú le puedes contestar de dos formas:
— "Creció mucho en todo el año."
— "Creció un poquitico cada mes."

Es la MISMA planta y el MISMO crecimiento. Solo que lo estás contando distinto: a veces por año, a veces por mes.

Con el dinero pasa igual: una tasa te dice cómo crece o cómo cuesta el dinero, pero la podemos contar por año, por mes, por lo que sea.

Por ejemplo, si tienes dinero guardado en una inversión, ese dinero puede ganar un poquito de interés cada mes. Pero también puedes mirar cuánto ganó en todo el año.

Es el mismo dinero y el mismo crecimiento. Solo cambia la forma de contarlo: por mes o por año.

Convertir una tasa significa expresar el mismo costo o rendimiento en otra forma equivalente. El dinero no cambia; cambiamos la forma correcta de escribir la tasa según su periodo, capitalización y modalidad.`}


      </NivelCinco>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · Las tasas tienen nombre y apellido" defaultOpen>
        <p>Piensa en una tasa como si fuera una persona: tiene un <strong>nombre</strong> y dos <strong>apellidos</strong>. Si conoces los tres, ya sabes todo lo que necesitas saber de esa tasa.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Nombre">
            Te dice si es <strong>Nominal</strong> o <strong>Efectiva</strong>. La nominal no es falsa: solo viene escrita como tasa anual con una frecuencia. La efectiva ya muestra el crecimiento o costo de un periodo.
          </TarjetaMini>
          <TarjetaMini titulo="Primer apellido">
            Indica cada cuánto se capitalizan o aplican los intereses. Por ejemplo: cada mes, cada tres meses, cada seis meses.
          </TarjetaMini>
          <TarjetaMini titulo="Segundo apellido">
            Te dice CUÁNDO se paga el interés: al final (<strong>vencida</strong>) o al principio (<strong>anticipada</strong>).
          </TarjetaMini>
        </div>
        <div style={{ marginTop: 16, padding: 16, background: C.navyDeep, borderRadius: 10 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 22, color: C.white, fontWeight: 700, marginBottom: 10 }}>24% NAM</div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#C9D2DF" }}>
            <span><strong style={{ color: C.goldLight }}>24%</strong> → el número de la tasa</span>
            <span><strong style={{ color: C.goldLight }}>N</strong> → Nominal (el "nombre")</span>
            <span><strong style={{ color: C.goldLight }}>A</strong> → Anual (habla de todo el año)</span>
            <span><strong style={{ color: C.goldLight }}>M</strong> → capitalización Mensual (primer apellido)</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#C9D2DF" }}>
            Dicho fácil: "En todo el año son 24 monedas por cada 100, pero las cobran poquito a poquito, una vez cada mes."
          </div>
        </div>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · ¿Qué es una tasa nominal?">
        <p><strong>¿Qué es?</strong> La tasa nominal es una tasa anual escrita junto con la frecuencia con la que se capitalizan o aplican los intereses. No es falsa: solo necesita convertirse antes de usarla o compararla.</p>
        <p style={{ color: C.slate }}><strong>¿Cuándo se usa?</strong> Se usa mucho para presentar tasas anuales. Para saber qué tasa entra realmente en una fórmula, primero revisamos su capitalización y la convertimos al periodo correcto.</p>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · Pasar de nominal a periódica (repartir la tasa)">
        <p>Si tienes la tasa de todo el año y quieres saber cuánto le toca a cada mes, la <strong>repartes</strong>. Es como cortar una torta en pedacitos iguales para que a cada mes le toque uno.</p>
        <BloqueFormula>ip = NA / nc</BloqueFormula>
        <p><strong>NA:</strong> la torta entera (todo el año). <strong>nc:</strong> en cuántos pedacitos la cortas (12 si es por mes, 4 si es cada tres meses). <strong>ip:</strong> lo que le toca a cada pedacito.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>María pide un crédito y el banco le dice: "24% NAM". Eso quiere decir 24% en todo el año, pero cobrado cada mes. Como el crédito se cobra mes a mes, necesitamos saber cuánto es "el pedacito" de cada mes.</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "NA = 24 % (todo el año) · nc = 12 (se reparte en 12 meses)" },
              { label: "Fórmula", content: "ip = NA / nc" },
              { label: "Sustitución", content: "ip = 24 % / 12" },
              { label: "Resultado", content: "ip = 2 %" },
              { label: "Interpretación", content: "Cada mes le toca un pedacito de 2 % del crédito de María." },
            ]} />
          </Acordeon>
        </div>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Pasar de periódica a nominal (juntar los pedacitos)">
        <p>Ahora es al revés: ya tienes el pedacito de un mes y quieres armar la torta entera del año. Entonces <strong>multiplicas</strong>: juntas todos los pedacitos.</p>
        <BloqueFormula>NA = ip × nc</BloqueFormula>
        <p><strong>ip:</strong> el pedacito (por ejemplo, de un mes). <strong>nc:</strong> cuántos pedacitos hay en el año. <strong>NA:</strong> la torta completa del año.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Una cuenta de ahorros te da un pedacito de 1% cada mes.</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "ip = 1 % cada mes · nc = 12 meses en el año" },
              { label: "Fórmula", content: "NA = ip × nc" },
              { label: "Sustitución", content: "NA = 1 % × 12" },
              { label: "Resultado", content: "NA = 12 % NAM" },
              { label: "Interpretación", content: "El mismo 1% de cada mes, contado por año, se convierte en 12%." },
            ]} />
          </Acordeon>
        </div>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · ¿Qué es una tasa efectiva?">
        <p><strong>¿Qué es?</strong> La tasa efectiva muestra cuánto crece o cuesta el dinero en un periodo determinado, teniendo en cuenta la capitalización de los intereses.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <TarjetaMini titulo="Nominal">Es una tasa anual expresada con una frecuencia de capitalización.</TarjetaMini>
          <TarjetaMini titulo="Efectiva">Muestra el crecimiento o costo para un periodo específico.</TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Cambiar una tasa efectiva de tamaño (mes → año, etc.)">
        <p>A veces tienes la tasa de un tamaño (la de cada mes) y la necesitas de otro tamaño (la de todo el año). Es como pasar de contar en pasitos a contar en kilómetros: el camino es el mismo, solo cambia cómo lo cuentas. Esta fórmula hace ese cambio.</p>
        <BloqueFormula>(1 + iy)^(ny/nx) − 1 = ix</BloqueFormula>
        <p><strong>iy:</strong> la tasa que ya tienes. <strong>ny:</strong> cuántas veces cabe esa tasa en un año. <strong>ix:</strong> la tasa nueva que buscas. <strong>nx:</strong> cuántas veces cabe la tasa nueva en un año.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Tienes 2% mensual y quieres saber cuánto es eso en un año completo (efectiva anual).</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "iy = 2 % · ny = 12 (se cobra 12 veces al año) · nx = 1 (queremos el tamaño 'año')" },
              { label: "Fórmula", content: "EA = (1 + iy)^(ny/nx) − 1" },
              { label: "Sustitución", content: "EA = (1 + 0,02)^12 − 1" },
              { label: "Resultado", content: `EA = ${formatPercentCO(Math.pow(1.02, 12) - 1, 2)}` },
              { label: "Interpretación", content: "El 2 % de cada mes se capitaliza durante el año. Por eso la efectiva anual equivalente queda por encima de 24 %, porque cada periodo se acumula sobre el anterior." },
            ]} />
          </Acordeon>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Capitalización (cuando el interés hace más interés)">
        <p>Capitalizar significa que los intereses se incorporan al capital. Dicho fácil: es como una alcancía donde las moneditas nuevas también empiezan a producir más moneditas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Mensual">Los intereses se incorporan al capital 12 veces al año (una vez por mes).</TarjetaMini>
          <TarjetaMini titulo="Trimestral">Los intereses se incorporan al capital 4 veces al año (cada tres meses).</TarjetaMini>
          <TarjetaMini titulo="Semestral">Los intereses se incorporan al capital 2 veces al año (cada seis meses).</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>Una mayor frecuencia de capitalización puede cambiar el valor acumulado si la tasa nominal y las demás condiciones son comparables. Por eso es importante convertir tasas antes de compararlas.</p>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Tasa vencida y tasa anticipada (¿cuándo se paga?)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Vencida">
            Pagas el interés AL FINAL. Como en el restaurante: primero comes y después pagas.
          </TarjetaMini>
          <TarjetaMini titulo="Anticipada">
            El interés se descuenta o se paga AL PRINCIPIO del periodo. Como idea fácil: se cobra antes de que termine el periodo.
          </TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Pasar de vencida a anticipada (y al revés)">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 4 }}>De vencida a anticipada</div>
            <BloqueFormula>ia = iv / (1 + iv)</BloqueFormula>
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 4 }}>De anticipada a vencida</div>
            <BloqueFormula>iv = ia / (1 − ia)</BloqueFormula>
          </div>
        </div>
        <p><strong>iv:</strong> la tasa vencida (se paga al final). <strong>ia:</strong> la tasa anticipada (se paga al principio).</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Te prestan $10.000.000 con una tasa del 5%. Mira cómo cambia todo según CUÁNDO se cobre el interés:</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
            <TarjetaMini titulo="Vencida">
              Te dan $10.000.000 completos. Al final devuelves $10.500.000. El interés real fue 5 %.
            </TarjetaMini>
            <TarjetaMini titulo="Anticipada">
              Te descuentan el interés al inicio: de $10.000.000 descuentan $500.000, así que recibes $9.500.000. Como recibiste menos y devuelves $10.000.000, esa tasa anticipada no equivale a una vencida del 5 %.
            </TarjetaMini>
          </div>
          <p style={{ color: C.slate }}>La tasa equivalente cambia porque cambia el momento en que se descuenta o se paga el interés: al inicio o al final.</p>
        </div>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Un ejemplo completo, paso a pasito (23,54 % NAC → NAS)">
        <p>Aquí vamos a cambiar una tasa de un tamaño a otro, pasito a pasito, sin saltarnos nada. <strong>NAC:</strong> nominal anual, se cobra cada 4 meses (cuatrimestral). <strong>NAS:</strong> nominal anual, se cobra cada 6 meses (semestral).</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Repartir la tasa nominal en su pedacito", content: "23,54 % / 3 = 7,85 % (el pedacito de cada cuatrimestre)" },
          { label: "Paso 2 — Cambiar el pedacito de tamaño", content: "(1 + 7,85 %)^(3/2) − 1 = 12 % (ahora el pedacito es de cada semestre)" },
          { label: "Paso 3 — Volver a armar la tasa nominal", content: "12 % × 2 = 24 % NAS" },
        ]} />
        <p style={{ marginTop: 12, color: C.slate }}>Ojo: el dinero NO cambió. Solo cambiamos la forma de contar la tasa, para poder compararla o usarla en otra cuenta.</p>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Errores comunes (para no caer en la trampa)">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TarjetaMini titulo="1. Dividir una tasa trimestral entre 3" tono="alerta">
            "Trimestral" no se divide entre 3: se divide entre 4, porque en un año caben 4 trimestres (4 × 3 meses = 12 meses).
          </TarjetaMini>
          <TarjetaMini titulo="2. Pensar que si el número es igual, la tasa es igual" tono="alerta">
            24% NAM y 24% NAT NO son lo mismo, aunque el número "24%" se vea igual. Todo depende de cada cuánto se cobra.
          </TarjetaMini>
          <TarjetaMini titulo="3. Saltarse pasos al convertir anticipada a vencida" tono="alerta">
            No puedes saltar de un solo brinco de anticipada a vencida. Hay que ir paso a pasito, pasando por el pedacito de cada periodo.
          </TarjetaMini>
        </div>
      </Acordeon>

    </div>
  );
}

/* ============================================================
   ANUALIDADES VENCIDAS — módulo educativo
   Clase interactiva: de la idea sencilla a la fórmula, el ejemplo
   paso a paso y la interpretación. Se conecta con Conversión de
   tasas (la tasa debe coincidir con la periodicidad de las cuotas).
   ============================================================ */

function Interpretacion({ children }) {
  return (
    <div style={{
      marginTop: 12, padding: "12px 16px", borderRadius: 8, background: C.successBg,
      fontSize: 13.5, color: C.navy, lineHeight: 1.6,
    }}>
      <strong>Interpretación: qué nos dice el resultado.</strong> {children}
    </div>
  );
}

function PasoLinea({ momento, pago, etiqueta }) {
  return (
    <div style={{
      flex: "1 1 70px", minWidth: 70, textAlign: "center", padding: "10px 6px",
      borderRight: `1px dashed ${C.line}`,
    }}>
      <div style={{ fontFamily: F_MONO, fontSize: 11, color: C.slate, marginBottom: 4 }}>{etiqueta}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 16, fontWeight: 700, color: C.navy }}>{momento}</div>
      <div style={{ fontFamily: F_MONO, fontSize: 15, fontWeight: 700, color: pago ? C.gold : C.slate, marginTop: 6 }}>{pago || "·"}</div>
    </div>
  );
}

function AnualidadesVencidas() {
  const factor20 = Math.pow(1.0095, -20);
  const factor40 = Math.pow(1.0095, -40);
  // Ejemplo de la moto (sección 9): todo calculado con las fórmulas, sin números escritos a mano
  const mA = 400000, mi = 0.02, mn = 12, mP1 = 1000000, mm1 = 6, mP2 = 1500000, mm2 = 12;
  const mFactorVP = (Math.pow(1 + mi, mn) - 1) / (mi * Math.pow(1 + mi, mn));
  const mFactorVF = (Math.pow(1 + mi, mn) - 1) / mi;
  const mVPcuotas = mA * mFactorVP;
  const mVPe1 = mP1 / Math.pow(1 + mi, mm1);
  const mVPe2 = mP2 / Math.pow(1 + mi, mm2);
  const mVPtotal = mVPcuotas + mVPe1 + mVPe2;
  const mVFcuotas = mA * mFactorVF;
  const mVFe1 = mP1 * Math.pow(1 + mi, mn - mm1);
  const mVFe2 = mP2 * Math.pow(1 + mi, mn - mm2);
  const mVFtotal = mVFcuotas + mVFe1 + mVFe2;

  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco titulo="🧸 Nivel 5 años">
        {`Imagina que compras una bicicleta, pero no la pagas toda hoy.
La pagas en pedacitos iguales: todos los meses das la misma plata.

Esa fila de pagos iguales se llama ANUALIDAD.

Aunque se llame anualidad, no tiene que ser cada año. Puede ser cada mes, cada dos meses, cada trimestre o el tiempo que diga el ejercicio.

Si es VENCIDA, pagas al final del pedacito de tiempo. Es como el restaurante: primero comes y después pagas.

Con esa fila de pagos podemos mirar dos cosas:
— VP: cuánto valen hoy todas las cuotas juntas.
— VF: cuánto valen al final todas las cuotas juntas.

Y si aparece un pago diferente, como un abono grande, ese no entra en la fila. Ese pago se calcula aparte y luego se suma.`}
      </NivelCinco>

      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 13.5, color: C.slate, marginBottom: 14 }}>
        <strong style={{ color: C.navy }}>Dos ideas clave:</strong> (1) las anualidades usan interés <strong>compuesto</strong>, porque cada cuota cae en un día diferente. (2) La tasa debe hablar el mismo idioma que las cuotas: si las cuotas son mensuales, la tasa también debe ser mensual.
      </div>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · De un solo pago a muchas cuotas" defaultOpen>
        <p>Antes mirábamos <strong>un solo pago</strong>: una plata hoy y una plata después.</p>
        <p>Con las anualidades miramos <strong>muchos pagos iguales</strong>. Es como una fila de galletas del mismo tamaño.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Antes: un solo pago" tono="azul">
            Te prestan una plata hoy y después haces un solo pago. Es una sola ida y una sola vuelta.
          </TarjetaMini>
          <TarjetaMini titulo="Ahora: una fila de pagos" tono="azul">
            Te prestan plata hoy y la devuelves en 36 cuotas iguales. Son muchos pagos del mismo tamaño.
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate }}><strong>¿Por qué importa?</strong> Porque muchas cosas se pagan por pedacitos: una bici, una moto, una casa o una clase.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "10px 0 6px" }}>Ejemplos reales en Colombia</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Carro en cuotas">Pagas el mismo pedacito cada mes.</TarjetaMini>
          <TarjetaMini titulo="Casa en cuotas">Pagas la casa por pedacitos durante mucho tiempo.</TarjetaMini>
          <TarjetaMini titulo="Alcancía de ahorro">Guardas la misma platica cada mes.</TarjetaMini>
          <TarjetaMini titulo="Arriendo mensual">Pagas la misma plata cada mes por vivir ahí.</TarjetaMini>
          <TarjetaMini titulo="App mensual">Pagas la misma plata cada mes por una app o un juego.</TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · ¿Qué es una anualidad? Las 4 condiciones">
        <p><strong>¿Qué es?</strong> Una anualidad es una fila de pagos iguales que se repiten cada cierto tiempo.</p>
        <p>Para que sea anualidad, debe cumplir estas <strong>4 reglas</strong>:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="1. Todos los pagos iguales">Como tu mesada: siempre te dan las mismas monedas, nunca más ni menos.</TarjetaMini>
          <TarjetaMini titulo="2. Pagos periódicos">Llegan cada cierto tiempo fijo, como una alarma que suena cada mes.</TarjetaMini>
          <TarjetaMini titulo="3. Un pago por cada pedacito de tiempo">Si hay 24 meses, hay 24 cuotas. Ni una más, ni una menos.</TarjetaMini>
          <TarjetaMini titulo="4. La misma tasa">El mismo interés vale para todos los pagos de la fila.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Regla de anualidad" tono="azul">Para que sea anualidad, los pagos deben ser iguales, periódicos, uno por pedacito de tiempo y con la misma tasa.</TarjetaMini>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <TarjetaMini titulo="Si una cuota cambia de valor" tono="alerta">
            Esa cuota se sale de la fila. La fórmula de anualidades solo sirve cuando todas valen lo mismo.
          </TarjetaMini>
          <TarjetaMini titulo="Si aparece un pago extra" tono="alerta">
            Es como una galleta grande que cae en la mesa fuera de la fila. No hace parte de la anualidad: se calcula aparte (lo veremos en la sección 9).
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Diferencia fácil:</strong> un pago único es una sola galleta. Una anualidad es una fila de galletas iguales.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>¿Cuáles sí y cuáles no?</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <TarjetaMini titulo="SÍ es anualidad" tono="azul">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Arriendo mensual fijo.</li>
                <li>Pago mensual fijo de algo comprado en cuotas.</li>
                <li>Aporte mensual fijo a un fondo.</li>
                <li>Suscripción mensual fija.</li>
              </ul>
            </TarjetaMini>
          </div>
          <div style={{ flex: "1 1 260px" }}>
            <TarjetaMini titulo="NO es anualidad" tono="alerta">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Una plata que cambia cada vez.</li>
                <li>Un pago extra diferente a las cuotas.</li>
                <li>Una plata aparte, distinta a las demás.</li>
                <li>Pagos que un mes valen una cosa y otro mes valen otra.</li>
              </ul>
            </TarjetaMini>
          </div>
        </div>
        <Interpretacion>
          Para decidir, hazte una sola pregunta: ¿los pagos son iguales, regulares y con la misma tasa? Si sí, es anualidad. Si hay uno distinto, ese se saca de la fila.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · ¿Qué significa vencida?">
        <p><strong>¿Qué es?</strong> En una anualidad vencida pagas <strong>al final</strong>. Primero pasa el mes, el bimestre o el pedacito de tiempo, y después pagas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Como el restaurante" tono="azul">Primero comes el almuerzo y al final pagas. Primero pasa el mes y al final pagas la cuota.</TarjetaMini>
          <TarjetaMini titulo="Plata prestada" tono="azul">Te dan la plata hoy y pagas el primer pedacito cuando termina el mes.</TarjetaMini>
          <TarjetaMini titulo="Arriendo pagado al final del mes" tono="azul">Vives el mes y al final pagas la casa.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Ojo: vencida NO es atrasada" tono="alerta">
          "Vencida" no quiere decir que te atrasaste. Solo quiere decir que pagas al final.
        </TarjetaMini>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Más adelante:</strong> la anualidad anticipada es lo contrario. Es como el cine: primero pagas la boleta y después ves la película.</p>
        <Interpretacion>
          En una anualidad vencida nunca hay una cuota en el momento 0 (hoy). La primera cuota aparece cuando termina el primer pedacito de tiempo.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · La línea de tiempo de una anualidad vencida">
        <p>La línea de tiempo es como un calendario en dibujos. El <strong>0</strong> es hoy. Los números <strong>1, 2, 3... n</strong> muestran cuándo cae cada cuota.</p>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.paper, display: "flex", flexWrap: "wrap", margin: "12px 0", overflow: "hidden" }}>
          <PasoLinea etiqueta="Momento" momento="0" pago="" />
          <PasoLinea etiqueta="Momento" momento="1" pago="A" />
          <PasoLinea etiqueta="Momento" momento="2" pago="A" />
          <PasoLinea etiqueta="Momento" momento="3" pago="A" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="n" pago="A" />
        </div>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Las letras que vamos a usar</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="A">La cuota: lo que pagas cada vez. Siempre es el mismo valor.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa del pedacito de tiempo: el "pedacito" de interés de cada mes (o de cada pedacito de tiempo).</TarjetaMini>
          <TarjetaMini titulo="n">Cuántos pedacitos de tiempo hay, que es lo mismo que cuántas cuotas hay.</TarjetaMini>
          <TarjetaMini titulo="VP">Valor de hoy: cuánto valen todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="VF">Valor del final: cuánto valen todas las cuotas al final.</TarjetaMini>
        </div>
        <Interpretacion>
          Todas las A son iguales porque todas las cuotas valen lo mismo. Lo único que cambia de una cuota a otra es el momento en que cae.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · Valor de hoy: cuánto valen hoy varias cuotas futuras">
        <p><strong>¿Qué es?</strong> El valor de hoy responde: <strong>¿cuánto valen hoy todas esas cuotas?</strong></p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Una cuota del final no vale igual que una cuota de hoy. Para traerla a hoy, la hacemos más pequeña. Luego juntamos todas esas cuotas traídas a hoy.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Para qué sirve?</strong></p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>Para saber cuánto valen hoy muchas cuotas, por ejemplo las de un carro.</li>
          <li>Para saber cuánto vale hoy un ahorro con pagos constantes.</li>
          <li>Para juntar pagos de después y ver cuánto serían hoy.</li>
        </ul>
        <p style={{ color: C.slate }}><strong>Diferencia fácil:</strong> antes traías un solo pago. Aquí traes una fila de pagos iguales.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula</div>
        <BloqueFormula>VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VP">El valor de todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa del pedacito de tiempo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>Esta fórmula hace el trabajo de sumar muchas cuotas de una sola vez.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 cuotas de COP 1.000 con una tasa del 5 % efectivo por pedacito de tiempo. ¿Cuánto valen hoy esas cuotas?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Sustitución", content: "VP = 1.000 × [((1 + 0,05)^3 − 1) / (0,05 × (1 + 0,05)^3)]" },
              { label: "Fórmula usada", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Resultado", content: "VP = COP 2.723,25" },
              { label: "Interpretación", content: "Esas tres cuotas futuras de COP 1.000 son como hoy a COP 2.723,25." },
            ]} />
          </Acordeon>
          <Interpretacion>
            En total pagas COP 3.000, pero mirado desde hoy vale menos, porque esa plata se paga después.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Valor del final: cuánto tendré al final si pago o ahorro lo mismo cada vez">
        <p><strong>¿Qué es?</strong> El valor del final responde: <strong>¿cuánto valen todas las cuotas al final?</strong></p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como una alcancía: metes la misma plata varias veces y cada pago va creciendo con intereses hasta el final.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Ejemplo de la vida real:</strong> si guardas COP 100.000 cada mes, esta cuenta dice cuánto hay al final.</p>
        <p style={{ color: C.slate }}><strong>Diferencia fácil:</strong> VP mira la fila desde hoy. VF mira la misma fila desde el final.</p>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 4 }}>Fórmula</div>
        <BloqueFormula>VF = A × [ ((1 + i)^n − 1) / i ]</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VF">El valor de todas las cuotas al final.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa del pedacito de tiempo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 cuotas de COP 1.000 con una tasa del 5 % efectivo por pedacito de tiempo. ¿Cuánto valen al final esas cuotas?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VF = A × [((1 + i)^n − 1) / i]" },
              { label: "Sustitución", content: "VF = 1.000 × [((1 + 0,05)^3 − 1) / 0,05]" },
              { label: "Resultado", content: "VF = COP 3.152,50" },
              { label: "Interpretación", content: "Al final, esas tres cuotas de COP 1.000 acumulan COP 3.152,50." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Metiste COP 3.000, pero al final hay COP 3.152,50. La diferencia son las moneditas extra del interés.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · ¿De cuánto es la cuota? Hallar A desde VP o VF">
        <p>A veces ya sabemos el valor total, pero no sabemos la cuota.</p>
        <p style={{ color: C.slate }}>Ahí buscamos <strong>A</strong>, que es la cuota que se paga cada vez.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "14px 0 4px" }}>Caso 1 · Hallar A desde VP (pagar una deuda)</div>
        <BloqueFormula>A = VP / [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando sé el valor de hoy y quiero encontrar la cuota.</p>
        <p>Te prestan COP 30.000.000 y los devuelves en 24 cuotas iguales. ¿Cuánto vale cada cuota?</p>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={[
            { label: "Primero, la tasa", content: "30 % NAM = nominal anual, se cobra cada mes. Las cuotas son mensuales, así que necesitamos la tasa de cada mes." },
            { label: "Tasa mensual (repartir la torta)", content: "i = 30 % / 12 = 2,5 % mensual" },
            { label: "Datos", content: "VP = 30.000.000 · i = 2,5 % = 0,025 · n = 24" },
            { label: "Fórmula", content: "A = VP / [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
            { label: "Sustitución", content: "A = 30.000.000 / [((1 + 0,025)^24 − 1) / (0,025 × (1 + 0,025)^24)]" },
            { label: "Resultado", content: "A = COP 1.677.384,61" },
            { label: "Interpretación", content: "Para pagar COP 30.000.000 en 24 cuotas mensuales con esa tasa, cada cuota debe ser de aproximadamente COP 1.677.384,61." },
          ]} />
        </Acordeon>
        <Interpretacion>
          En total pagarías más de COP 30 millones. Esa diferencia son las moneditas extra del interés.
        </Interpretacion>

        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Caso 2 · Hallar A desde VF (juntar una meta)</div>
        <BloqueFormula>A = VF × [ i / ((1 + i)^n − 1) ]</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando sé cuánto quiero tener al final y quiero encontrar cuánto ahorrar o pagar cada vez.</p>
        <p>Quieres llegar a COP 150.000.000 al final, guardando 36 cuotas iguales. ¿Cuánto debes guardar cada vez?</p>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Tasa mensual", content: "30 % NAM: se cobra cada mes. 30 % / 12 = 2,5 % mensual" },
            { label: "Paso 2 — Tasa trimestral", content: "Las cuotas son cada 3 meses, así que cambiamos el tamaño de la tasa: i trimestral = (1 + 0,025)^3 − 1" },
            { label: "Resultado de la conversión", content: "i ≈ 7,69 % efectiva trimestral" },
            { label: "Datos", content: "VF = 150.000.000 · i ≈ 7,69 % · n = 36" },
            { label: "Fórmula", content: "A = VF × [i / ((1 + i)^n − 1)]" },
            { label: "Sustitución", content: "A = 150.000.000 × [0,0769 / ((1 + 0,0769)^36 − 1)]" },
            { label: "Resultado", content: "A = COP 861.110,12" },
            { label: "Interpretación", content: "Para llegar a COP 150.000.000 al final de 36 trimestres, cada cuota debe ser de aproximadamente COP 861.110,12." },
          ]} />
        </Acordeon>
        <Interpretacion>
          Con el 7,69 % redondeado el resultado se mueve un poco. Para obtener COP 861.110,12 se usa la tasa sin redondear (7,6890625 %). Conviene guardar todos los decimales de la tasa mientras haces las cuentas.
        </Interpretacion>
        <p style={{ color: C.slate, marginTop: 10 }}><strong>Diferencia entre los dos casos:</strong> desde VP la cuota paga una deuda que existe hoy; desde VF la cuota construye un ahorro que existirá en el final.</p>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · El error más común: la tasa y las cuotas no hablan el mismo idioma">
        <div style={{ padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            La tasa y las cuotas deben hablar el mismo idioma. Si las cuotas son mensuales, la tasa debe ser mensual.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Cuotas mensuales">Tasa mensual.</TarjetaMini>
          <TarjetaMini titulo="Cuotas bimestrales">Tasa bimestral.</TarjetaMini>
          <TarjetaMini titulo="Cuotas trimestrales">Tasa trimestral.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Convertir tasas es como traducir. Si las cuotas hablan en meses, la tasa también debe hablar en meses.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Conexión con tasas:</strong> primero conviertes la tasa. Después usas la fórmula. La tasa final debe quedar del mismo tamaño que las cuotas.</p>
        <TarjetaMini titulo="Error común" tono="alerta">
          Usar directamente una tasa nominal anual en la fórmula de anualidades. Por ejemplo, usar 25 % NAT como si fuera una tasa mensual.
        </TarjetaMini>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo del procedimiento correcto</div>
          <p>Hay una cuota mensual de $100 y la tasa viene escrita como 25 % NAT. Primero toca traducir la tasa.</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Paso 1 — Repartir la nominal", content: "ET = 25 % / 4 = 6,25 % efectiva trimestral" },
              { label: "Paso 2 — Cambiar de tamaño (trimestre a mes)", content: "EM = (1 + 0,0625)^(4/12) − 1" },
              { label: "Resultado", content: `EM ≈ ${formatPercentCO(Math.pow(1.0625, 4 / 12) - 1, 2)} mensual` },
              { label: "Uso en la fórmula", content: "VP = 100 × [((1 + 0,0204)^1 − 1) / (0,0204 × (1 + 0,0204)^1)]" },
              { label: "Interpretación", content: "Si la cuota es mensual, uso la tasa mensual, no la tasa de todo el año." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Con la tasa bien traducida el resultado sale bien. Si usas la tasa grande sin traducir, la cuenta queda muy mal.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Anualidades + pagos extra: la galleta grande fuera de la fila">

        <NivelCinco titulo="🧸 Nivel 5 años">
          {`Imagina una fila de galletas iguales. Esa fila son las cuotas.

Ahora llega una galleta más grande. Esa es el pago extra.

No puedes meterla dentro de la fila, porque no es igual a las demás. Entonces la calculas aparte.

Antes de sumar, todos los pagos deben estar en la misma fecha:
— Si quieres VP, todos van a hoy.
— Si quieres VF, todos van al final.

La regla es fácil:
1. La fila de cuotas usa la fórmula de anualidades.
2. El pago extra se mueve aparte.
3. Al final se suma todo.`}
        </NivelCinco>

        <div style={{ fontWeight: 700, color: C.navy, margin: "4px 0 6px" }}>La definición, con las palabras de la clase</div>
        <TarjetaMini titulo="Anualidades + pagos extra" tono="azul">
          A veces aparece un pago diferente a las cuotas. Ese pago no entra en la fila. Se calcula aparte y luego se suma en el mismo momento focal.
        </TarjetaMini>

        <p style={{ marginTop: 14 }}><strong>¿Qué es un pago extra?</strong> Es cualquier pago que NO es una de las cuotas iguales. Por ejemplo: un abono grande que haces un mes para pagar más rápido.</p>
        <TarjetaMini titulo="Regla para pagos extra" tono="azul">Las cuotas iguales usan la fórmula de anualidades. Los pagos distintos se calculan aparte y luego se suman.</TarjetaMini>

        {/* PASO 0 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 0 · Elegir el momento focal</div>
        <p>El momento focal es la fecha donde vamos a comparar todos los pagos. Para entenderlo fácil, es como tomar una foto de la operación. Solo hay dos casos:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Quiero un valor de hoy (VP)" tono="azul">El momento focal es hoy (momento 0). Todo se trae a hoy.</TarjetaMini>
          <TarjetaMini titulo="Quiero un valor del final (VF)" tono="azul">El momento focal es el final (momento n). Todo se lleva al final.</TarjetaMini>
        </div>

        {/* PASO 1 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 1 · La fórmula completa</div>
        <p>La idea es simple: <strong>cuotas iguales por un lado + pago extra por otro lado.</strong></p>

        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Valor de hoy + pagos extra (momento focal: hoy)</div>
        <BloqueFormula>VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1</BloqueFormula>

        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Valor del final + pagos extra (momento focal: final)</div>
        <BloqueFormula>VF = A × [ ((1 + i)^n − 1) / i ] + Vp1 × (1 + i)^(n − n1)</BloqueFormula>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <TarjetaMini titulo="A">El valor de la cuota igual.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa periódica efectiva del mismo periodo de las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">El número total de cuotas (de pedacitos de tiempo).</TarjetaMini>
          <TarjetaMini titulo="Vf1 / Vp1">El valor del pago extra que se mueve a VP o a VF.</TarjetaMini>
          <TarjetaMini titulo="n1">El momento en que ocurre el pago extra.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>En los apuntes de clase el pago extra aparece como <strong>Vf1</strong> cuando se trae al hoy y como <strong>Vp1</strong> cuando se lleva al final. <strong>n1</strong> es el momento donde ocurre ese pago extra.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Cómo se mueve cada pago extra (la regla para no enredarse)</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="El pago está DESPUÉS del momento focal" tono="azul">
            Hay que traerlo hacia atrás, así que se <strong>divide</strong> entre (1 + i) elevado al número de periodos que lo separan. Pasa en el VP: el pago extra está en el final y se trae a hoy.
          </TarjetaMini>
          <TarjetaMini titulo="El pago está ANTES del momento focal" tono="azul">
            Hay que llevarlo hacia adelante, así que se <strong>multiplica</strong> por (1 + i) elevado al número de periodos que lo separan. Pasa en el VF: el pago extra se lleva hasta el final.
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 10 }}>Un pago extra es un solo pago, no una fila. Por eso se mueve con las fórmulas de interés compuesto, no con la fórmula de anualidades.</p>

        {/* PASO 2 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 2 · Receta en 4 pasos</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="1. Elige el momento focal">¿Quiero VP o VF? Hoy o el final.</TarjetaMini>
          <TarjetaMini titulo="2. Calcula la anualidad">Usa la fórmula de VP o de VF solo con las cuotas iguales.</TarjetaMini>
          <TarjetaMini titulo="3. Mueve cada pago extra">Divide o multiplica según esté después o antes del momento focal.</TarjetaMini>
          <TarjetaMini titulo="4. Suma todo">Anualidad + todos los pagos extra ya movidos.</TarjetaMini>
        </div>

        {/* EJEMPLO */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Ejemplo: Camila compra una moto por cuotas</div>
        <p>Camila compra una moto hoy y la paga así:</p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li><strong>12 cuotas mensuales iguales de COP 400.000</strong>, pagadas al final de cada mes (anualidad vencida).</li>
          <li><strong>Un pago extra de COP 1.000.000 en el mes 6</strong>, con la prima de mitad de año.</li>
          <li><strong>Un pago extra de COP 1.500.000 en el mes 12</strong>, con la prima de diciembre.</li>
          <li>La tasa es <strong>2 % efectiva mensual</strong> (ya está del mismo tamaño que las cuotas).</li>
        </ul>
        <p>Queremos saber dos cosas: (a) ¿cuánto vale todo hoy? y (b) ¿cuánto vale todo al final del año?</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "10px 0 6px" }}>Así se ve en la línea de tiempo</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.paper, display: "flex", flexWrap: "wrap", margin: "0 0 12px", overflow: "hidden" }}>
          <PasoLinea etiqueta="Momento" momento="0" pago="" />
          <PasoLinea etiqueta="Momento" momento="1" pago="A" />
          <PasoLinea etiqueta="Momento" momento="2" pago="A" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="6" pago="A + Vf1" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="12" pago="A + Vf1" />
        </div>
        <TarjetaMini titulo="Ojo con el mes 12" tono="alerta">
          En el mes 12 caen dos pagos el mismo día: la cuota número 12 y el pago extra. Aun así no se mezclan. La cuota va dentro de la fórmula de la anualidad; el pago extra se calcula aparte.
        </TarjetaMini>

        <Acordeon title="(a) Ver procedimiento: valor de hoy total (momento focal: hoy)">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Día de la foto", content: "Hoy (momento 0), porque queremos saber cuánto vale todo hoy." },
            { label: "Datos", content: "A = 400.000 · i = 2 % = 0,02 · n = 12 · Vf1 = 1.000.000 en n1 = 6 · otro pago extra de 1.500.000 en n1 = 12" },
            { label: "Fórmula", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)] + Vf1/(1 + i)^n1" },
            { label: "Paso 2 — Las 12 cuotas (anualidad)", content: `VP cuotas = 400.000 × [((1,02)^12 − 1) / (0,02 × (1,02)^12)] = 400.000 × ${formatNumberCO(mFactorVP, 6, 6)} = COP ${formatNumberCO(mVPcuotas, 2, 2)}` },
            { label: "Paso 3a — Pago extra del mes 6", content: `Vf1 / (1+i)^n1 = 1.000.000 / (1,02)^6 = COP ${formatNumberCO(mVPe1, 2, 2)}` },
            { label: "Paso 3b — Se repite la misma fórmula para el otro pago extra", content: `Vf1 / (1+i)^n1 = 1.500.000 / (1,02)^12 = COP ${formatNumberCO(mVPe2, 2, 2)}` },
            { label: "Paso 4 — Sumar todo", content: `VP total = ${formatNumberCO(mVPcuotas, 2, 2)} + ${formatNumberCO(mVPe1, 2, 2)} + ${formatNumberCO(mVPe2, 2, 2)}` },
            { label: "Resultado", content: `VP total ≈ COP ${formatNumberCO(mVPtotal, 2, 2)}` },
            { label: "Interpretación", content: "Las 12 cuotas y los dos pagos extra, juntos, valen hoy ese valor. Es lo que costó la moto el día de la compra." },
          ]} />
        </Acordeon>

        <Acordeon title="(b) Ver procedimiento: valor del final total (momento focal: final)">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Día de la foto", content: "El último día, porque queremos mirar la plata al final." },
            { label: "Datos", content: "A = 400.000 · i = 0,02 · n = 12 · Vp1 = 1.000.000 en n1 = 6 · otro pago extra de 1.500.000 en n1 = 12" },
            { label: "Fórmula", content: "VF = A × [((1 + i)^n − 1) / i] + Vp1 × (1 + i)^(n − n1)" },
            { label: "Paso 2 — Las 12 cuotas (anualidad)", content: `VF cuotas = 400.000 × [((1,02)^12 − 1) / 0,02] = 400.000 × ${formatNumberCO(mFactorVF, 6, 6)} = COP ${formatNumberCO(mVFcuotas, 2, 2)}` },
            { label: "Paso 3a — Pago extra del mes 6", content: `Vp1 × (1+i)^(n − n1) = 1.000.000 × (1,02)^(12 − 6) = COP ${formatNumberCO(mVFe1, 2, 2)}` },
            { label: "Paso 3b — Se repite la misma fórmula para el otro pago extra", content: `Vp1 × (1+i)^(n − n1) = 1.500.000 × (1,02)^(12 − 12) = 1.500.000 × 1 = COP ${formatNumberCO(mVFe2, 2, 2)}` },
            { label: "Paso 4 — Sumar todo", content: `VF total = ${formatNumberCO(mVFcuotas, 2, 2)} + ${formatNumberCO(mVFe1, 2, 2)} + ${formatNumberCO(mVFe2, 2, 2)}` },
            { label: "Resultado", content: `VF total ≈ COP ${formatNumberCO(mVFtotal, 2, 2)}` },
            { label: "Revisión", content: `Revisión: si llevamos la plata de hoy al final, debe parecerse: ${formatNumberCO(mVPtotal, 2, 2)} × (1,02)^12 = ${formatNumberCO(mVPtotal * Math.pow(1 + mi, mn), 2, 2)}` },
          ]} />
        </Acordeon>

        <Interpretacion>
          Camila paga en total COP {formatNumberCO(mA * mn + mP1 + mP2, 0, 0)} (12 × 400.000 + 1.000.000 + 1.500.000). Pero ese dinero se paga en momentos distintos: hoy todo vale COP {formatNumberCO(mVPtotal, 2, 2)}, y al final del año todo vale COP {formatNumberCO(mVFtotal, 2, 2)}. Es la misma plata, pero vista en días diferentes. Por eso siempre decimos si miramos hoy o al final.
        </Interpretacion>

        {/* INCÓGNITAS */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Cuando falta encontrar un pago o una cuota</div>
        <p>Cuando falta un dato, lo dejamos como una letra. Luego usamos la fórmula que corresponda y despejamos.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Si busco VP" tono="azul">Uso la fórmula oficial de valor de hoy con pago extra.</TarjetaMini>
          <TarjetaMini titulo="Si busco VF" tono="azul">Uso la fórmula oficial de valor del final con pago extra.</TarjetaMini>
          <TarjetaMini titulo="Si busco A" tono="azul">Uso el despeje oficial de cuota desde VP o desde VF.</TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 10 }}>En la sección 10 hay un ejemplo completo donde la incógnita es el pago extra.</p>

        {/* ERRORES */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 8px" }}>Errores comunes con los pagos extra</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TarjetaMini titulo="1. Meter el pago extra dentro de la fórmula de anualidades" tono="alerta">
            La fórmula solo sirve para cuotas iguales. El pago extra siempre va aparte, sumado al final.
          </TarjetaMini>
          <TarjetaMini titulo="2. Dividir cuando había que multiplicar (o al revés)" tono="alerta">
            Pregúntate: ¿el pago está antes o después del momento focal? Después → se divide. Antes → se multiplica.
          </TarjetaMini>
          <TarjetaMini titulo="3. Usar mal el numerito de arriba" tono="alerta">
            Mira bien el numerito de arriba: en VP usamos cuándo cae el pago. En VF usamos cuánto falta para llegar al final.
          </TarjetaMini>
          <TarjetaMini titulo="4. Mezclar fechas focales" tono="alerta">
            Todos los valores tienen que llegar a la misma fecha. No se puede sumar la anualidad llevada a hoy con un pago extra llevado al final.
          </TarjetaMini>
        </div>

        <div style={{ marginTop: 16 }}>
          <TarjetaMini titulo="Otro ejemplo de la vida real: el carro" tono="azul">
            Pagas 36 cuotas iguales de un carro y además haces un abono extra junto con la cuota 17. Las 36 cuotas forman la anualidad. El abono extra se calcula aparte, como pago suelto en el pedacito de tiempo 17, y se suma al total.
          </TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Ejemplo completo: la casa con dos pagos extra">
        <p>Una pareja compró una casa hoy por COP 720.000.000. Pagaron cuotas bimestrales de COP 8.927.479,48 durante 15 años. La tasa es 5,73 % NAC (nominal anual, se cobra cada cuatrimestre). Además hicieron 2 pagos extra, en los bimestres 20 y 40, ambos por el mismo valor. ¿De cuánto fue cada pago extra?</p>
        <TarjetaMini titulo="Qué es qué" tono="azul">
          Las 90 cuotas son la fila de pagos iguales. Los dos X son pagos aparte. La foto es hoy, porque la casa se compró hoy.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — ¿De qué tamaño son las cuotas?", content: "Son bimestrales (cada 2 meses). Necesitamos una tasa efectiva bimestral." },
          { label: "Paso 2a — Repartir la nominal", content: "Un año tiene 3 cuatrimestres: 5,73 % / 3 = 1,91 % efectiva cuatrimestral" },
          { label: "Paso 2b — Cambiar de tamaño", content: "EB = (1 + 0,0191)^(3/6) − 1 ≈ 0,95 % efectiva bimestral" },
          { label: "Paso 3a — ¿Cuántas cuotas hay?", content: "15 años = 180 meses. Como cada cuota es cada 2 meses: n = 180 / 2 = 90 cuotas" },
          { label: "Paso 3b — Traer las 90 cuotas a hoy", content: "VP = 8.927.479,48 × [((1 + 0,0095)^90 − 1) / (0,0095 × (1 + 0,0095)^90)]" },
          { label: "Resultado del paso 3", content: "VP de la anualidad ≈ COP 538.465.173,45" },
          { label: "Paso 4 — Poner todo en la misma foto", content: "720.000.000 = 538.465.173,45 + X/(1 + 0,0095)^20 + X/(1 + 0,0095)^40" },
          { label: "Paso 5 — Calcular los factores de cada pago extra", content: `1/(1,0095)^20 ≈ ${formatNumberCO(factor20, 4, 4)} · 1/(1,0095)^40 ≈ ${formatNumberCO(factor40, 4, 4)}` },
          { label: "Paso 6 — Agrupar los dos pagos extra", content: `720.000.000 = 538.465.173,45 + X × (${formatNumberCO(factor20, 4, 4)} + ${formatNumberCO(factor40, 4, 4)}) = 538.465.173,45 + X × ${formatNumberCO(factor20 + factor40, 4, 4)}` },
          { label: "Paso 7 — Pasar lo conocido al otro lado", content: "720.000.000 − 538.465.173,45 = 181.534.826,55" },
          { label: "Paso 8 — Despejar X", content: `X = 181.534.826,55 / ${formatNumberCO(factor20 + factor40, 4, 4)}` },
          { label: "Resultado", content: "X ≈ COP 120.000.000 (cada pago extra)" },
          { label: "Revisión", content: `120.000.000 × ${formatNumberCO(factor20, 4, 4)} ≈ ${formatNumberCO(120000000 * factor20 / 1e6, 1, 1)} millones · 120.000.000 × ${formatNumberCO(factor40, 4, 4)} ≈ ${formatNumberCO(120000000 * factor40 / 1e6, 1, 1)} millones · cuotas 538,5 millones → total ≈ 720 millones` },
        ]} />
        <Interpretacion>
          Las 90 cuotas aportan COP 538,5 millones al valor de la casa de hoy. Los COP 181,5 millones que faltan los cubren los dos pagos extra: cada uno es de COP 120.000.000 cuando se paga, pero traídos a hoy valen menos (unos 99,3 millones y 82,2 millones), porque llegan más adelante. En clase los factores se redondean a 0,83 y 0,69 (suman 1,51); aquí usamos más decimales y el resultado sigue dando 120 millones.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Ejemplo del carro">
        <p>Hace 5 años compraste un carro. Debes pagar cuotas mensuales de COP 3.078.925,79 con una tasa del 0,71 % periódica mensual. ¿Cuánto costó el carro el día que lo compraron?</p>
        <TarjetaMini titulo="Pista" tono="azul">
          Queremos saber cuánto valía el carro cuando lo compraron. Esa es la foto de hoy.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Datos", content: "A = 3.078.925,79 · i = 0,71 % = 0,0071 · n = 5 años × 12 meses = 60 cuotas" },
          { label: "Fórmula", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
          { label: "Sustitución", content: "VP = 3.078.925,79 × [((1 + 0,0071)^60 − 1) / (0,0071 × (1 + 0,0071)^60)]" },
          { label: "Resultado", content: "VP ≈ COP 150.000.000,06" },
          { label: "Interpretación", content: "El carro costó aproximadamente COP 150.000.000 cuando lo compraron." },
        ]} />
        <Interpretacion>
          Pagaste 60 cuotas de unos COP 3,08 millones (cerca de COP 184,7 millones en total) por un carro que valía COP 150 millones el día de la compra. La diferencia son las moneditas extra del interés.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Cierre y preguntas de repaso">
        <div style={{ padding: 16, background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: C.navy, marginBottom: 8 }}>Antes de seguir, intenta responder sin mirar los apuntes:</div>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>¿Qué se requiere para que un pago sea considerado una anualidad?</li>
            <li>¿Un pago extra se puede considerar una cuota?</li>
            <li>¿Las cuotas y la tasa de interés tienen que tener el mismo ritmo de tiempo?</li>
            <li>¿Qué diferencia hay entre valor de hoy y valor del final?</li>
            <li>¿Qué significa que una anualidad sea vencida?</li>
            <li>¿Cómo se suma un pago extra a una anualidad y qué papel tiene el momento focal?</li>
          </ol>
        </div>
        <Acordeon title="Ver respuestas esperadas">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>Debe tener pagos iguales, que se repiten, y siempre con la misma tasa.</li>
            <li style={{ marginBottom: 6 }}>No. El pago extra se calcula aparte.</li>
            <li style={{ marginBottom: 6 }}>Sí. La tasa debe coincidir con el tiempo de las cuotas.</li>
            <li style={{ marginBottom: 6 }}>El valor de hoy trae las cuotas a hoy; el valor del final las lleva al final.</li>
            <li style={{ marginBottom: 6 }}>Que la cuota se paga al final de cada pedacito de tiempo.</li>
            <li>El pago extra se calcula aparte de la fórmula de anualidades: se mueve hasta el momento focal (se divide si va para atrás, se multiplica si va para adelante) y se suma al valor de la anualidad. El momento focal es hoy si quiero VP y es el final si quiero VF.</li>
          </ol>
        </Acordeon>
        <p style={{ color: C.slate }}>Próximamente: ¿y si pagas todo al inicio del pedacito de tiempo? Eso será la anualidad anticipada.</p>
      </Acordeon>

    </div>
  );
}

/* ============================================================
   ANUALIDADES ANTICIPADAS — módulo educativo
   Clase interactiva: se conecta con interés compuesto,
   Conversión de tasas (sección de conversión de tasas) y Anualidades vencidas (sección de anualidades vencidas).
   Todas las cifras de los ejemplos se calculan con las fórmulas.
   ============================================================ */

// Formato con puntos de miles y coma decimal (siempre, incluso en números de 4 cifras)
function formatMilesCO(valor, decimales = 2) {
  if (!Number.isFinite(valor)) return "—";
  const negativo = valor < 0;
  const partes = Math.abs(valor).toFixed(decimales).split(".");
  const miles = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${miles}${partes[1] ? "," + partes[1] : ""}`;
}
function formatPctMilesCO(valor, decimales = 2) {
  if (!Number.isFinite(valor)) return "—";
  return `${formatMilesCO(valor * 100, decimales)} %`;
}

function AnualidadesAnticipadas() {
  // Factores de anualidad vencida (se usan en todo la parte)
  const fVP = (i, n) => (Math.pow(1 + i, n) - 1) / (i * Math.pow(1 + i, n));
  const fVF = (i, n) => (Math.pow(1 + i, n) - 1) / i;

  // Ejemplo de clase: 3 cuotas de 1.000 al 5 % (secciones 5, 6 y 7)
  const eA = 1000, ei = 0.05, en = 3;
  const eVPv = eA * fVP(ei, en);
  const eVPa = eA * (1 + ei) * fVP(ei, en);
  const eVFv = eA * fVF(ei, en);
  const eVFa = eA * ((Math.pow(1 + ei, en + 1) - (1 + ei)) / ei);
  const eVFaAlt = eVFa;
  const eVPsuma = eA + eA / (1 + ei) + eA / Math.pow(1 + ei, 2);
  const eVFsuma = eA * Math.pow(1 + ei, 3) + eA * Math.pow(1 + ei, 2) + eA * (1 + ei);

  // Sección 8 — caso 1: A desde VP (30 % NAMA, 24 cuotas mensuales, VP = 30.000.000)
  const c1VP = 30000000, c1n = 24;
  const c1ia = 0.30 / 12;
  const c1i = c1ia / (1 - c1ia);
  const c1A = c1VP / ((1 + c1i) * fVP(c1i, c1n));
  const c1Total = c1A * c1n;

  // Sección 8 — caso 2: A desde VF (30 % NAMA, 36 cuotas trimestrales, VF = 150.000.000)
  const c2VF = 150000000, c2n = 36;
  const c2ET = Math.pow(1 + c1i, 3) - 1;
  const c2A = c2VF * (c2ET / (Math.pow(1 + c2ET, c2n) - 1)) / (1 + c2ET);
  const c2Total = c2A * c2n;

  // Sección 9 — error común: 25 % NATA
  const x1ETA = 0.25 / 4;
  const x2ET = x1ETA / (1 - x1ETA);
  const x3EM = Math.pow(1 + x2ET, 4 / 12) - 1;
  const xN = 12;
  const xVPcorrecto = 100 * (1 + x3EM) * fVP(x3EM, xN);
  const xVPerror = 100 * (1 + 0.25) * fVP(0.25, xN);

  // Sección 11 — la casa (5,73 % NACA, cuotas bimestrales anticipadas de 8.906.829,51)
  const hA = 8906829.51, hVPcasa = 720000000, hN = 90;
  const h1ia = 0.0573 / 3;                      // 1,91 % efectiva cuatrimestral anticipada
  const h2iv = 0.0195;                          // 1,95 % (valor redondeado, como en clase)
  const h3EB = Math.pow(1 + h2iv, 3 / 6) - 1;   // efectiva bimestral vencida
  const hVPanual = hA * (1 + h3EB) * fVP(h3EB, hN);
  const hF20 = Math.pow(1 + h3EB, -20);
  const hF40 = Math.pow(1 + h3EB, -40);
  const hFsuma = hF20 + hF40;
  const hResto = hVPcasa - hVPanual;
  const hX = hResto / hFsuma;
  // Alternativa sin redondear la tasa cuatrimestral vencida (para la nota de decimales)
  const h2ivExacta = h1ia / (1 - h1ia);
  const h3EBexacta = Math.pow(1 + h2ivExacta, 3 / 6) - 1;
  const hVPexacto = hA * (1 + h3EBexacta) * fVP(h3EBexacta, hN);
  const hXexacto = (hVPcasa - hVPexacto) / (Math.pow(1 + h3EBexacta, -20) + Math.pow(1 + h3EBexacta, -40));

  // Sección 12 — el carro
  const kA = 3078925.79, ki = 0.0071, kn = 60;
  const kVPv = kA * fVP(ki, kn);
  const kVPa = kA * (1 + ki) * fVP(ki, kn);
  const kDif = kVPa - kVPv;

  const diagramaStyle = {
    fontFamily: F_MONO, fontSize: 13, background: C.paper, padding: "12px 16px", borderRadius: 8,
    margin: "8px 0", color: C.navy, whiteSpace: "pre", overflowX: "auto", lineHeight: 1.7,
  };

  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco titulo="🧸 Nivel 5 años">
        {`Imagina que vas al cine.
Primero pagas la boleta y después ves la película.

Así funciona una anualidad anticipada: primero pagas la cuota y después pasa el pedacito de tiempo.

En la anualidad vencida era al revés: primero pasaba el tiempo y después pagabas.

Lo demás sigue igual: son pagos iguales, repetidos cada cierto tiempo y con la misma tasa.

Ejemplos fáciles:
— arriendo que pagas al iniciar el mes,
— matrícula antes de empezar clases,
— seguro antes de que empiece,
— gimnasio antes de usarlo.

Idea clave: como pagas antes, cada cuota queda un pedacito de tiempo más cerca de hoy o con más tiempo para crecer.`}
      </NivelCinco>

      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 13.5, color: C.slate, marginBottom: 14 }}>
        <strong style={{ color: C.navy }}>Para entender esto necesitas tres ideas:</strong> interés compuesto, conversión de tasas y anualidades vencidas. Aquí las usamos juntas, pero con lenguaje sencillo.
      </div>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · ¿Qué cambia frente a una anualidad vencida?" defaultOpen>
        <p><strong>¿Qué no cambia?</strong> Sigue siendo anualidad, así que conserva las mismas 4 reglas:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="1. Pagos iguales">Todas las cuotas valen lo mismo.</TarjetaMini>
          <TarjetaMini titulo="2. Pagos periódicos">Se pagan cada cierto tiempo fijo.</TarjetaMini>
          <TarjetaMini titulo="3. Un pago por pedacito de tiempo">Si hay 12 meses, hay 12 cuotas.</TarjetaMini>
          <TarjetaMini titulo="4. La misma tasa">El mismo interés para todos los pagos.</TarjetaMini>
        </div>
        <p><strong>¿Qué cambia?</strong> Solo cambia el momento en que pagas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Anualidad vencida" tono="azul">Pagas al FINAL. Primero pasa el tiempo y después pagas (como el restaurante).</TarjetaMini>
          <TarjetaMini titulo="Anualidad anticipada" tono="azul">Pagas al INICIO. Primero pagas y después pasa el tiempo (como el cine).</TarjetaMini>
        </div>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 4px" }}>Las dos líneas de tiempo, una encima de la otra</div>
        <div style={{ fontSize: 12.5, color: C.slate, margin: "6px 0 2px" }}>Anualidad vencida: la primera cuota cae en el momento 1</div>
        <div style={diagramaStyle}>{"0 ---- 1 ---- 2 ---- 3 ---- n\n      A      A      A      A"}</div>
        <div style={{ fontSize: 12.5, color: C.slate, margin: "6px 0 2px" }}>Anualidad anticipada: la primera cuota cae en el momento 0 (hoy)</div>
        <div style={diagramaStyle}>{"0 ---- 1 ---- 2 ---- 3 ---- n\nA      A      A      A"}</div>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 4px" }}>Lo mismo, pero con n cuotas</div>
        <div style={{ fontSize: 12.5, color: C.slate, margin: "6px 0 2px" }}>Vencida: cuotas en los momentos 1, 2, 3, ... , n</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.paper, display: "flex", flexWrap: "wrap", margin: "4px 0 12px", overflow: "hidden" }}>
          <PasoLinea etiqueta="Momento" momento="0" pago="" />
          <PasoLinea etiqueta="Momento" momento="1" pago="A" />
          <PasoLinea etiqueta="Momento" momento="2" pago="A" />
          <PasoLinea etiqueta="Momento" momento="3" pago="A" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="n" pago="A" />
        </div>
        <div style={{ fontSize: 12.5, color: C.slate, margin: "6px 0 2px" }}>Anticipada: cuotas en los momentos 0, 1, 2, ... , n − 1</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.paper, display: "flex", flexWrap: "wrap", margin: "4px 0 12px", overflow: "hidden" }}>
          <PasoLinea etiqueta="Momento" momento="0" pago="A" />
          <PasoLinea etiqueta="Momento" momento="1" pago="A" />
          <PasoLinea etiqueta="Momento" momento="2" pago="A" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="n − 1" pago="A" />
          <PasoLinea etiqueta="Momento" momento="n" pago="" />
        </div>
        <TarjetaMini titulo="Ojo con la última cuota" tono="alerta">
          Si hay n cuotas y la primera cae en el momento 0, la última cae en el momento n − 1. En el momento n ya no hay cuota: ahí termina el último pedacito de tiempo.
        </TarjetaMini>

        <TarjetaMini titulo="La frase para recordar" tono="azul">
          Vencida: primero pasa el tiempo y después pagas. Anticipada: primero pagas y después pasa el tiempo.
        </TarjetaMini>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>Ejemplos reales de pagos anticipados en Colombia</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Arriendo">Lo pagas el día 1 del mes y después vives en la casa todo el mes.</TarjetaMini>
          <TarjetaMini titulo="Seguro">Pagas el seguro antes de que empiece.</TarjetaMini>
          <TarjetaMini titulo="Colegio">Pagas antes de empezar clases.</TarjetaMini>
          <TarjetaMini titulo="Pago antes de usar">A veces pagas primero y después usas algo.</TarjetaMini>
          <TarjetaMini titulo="Gimnasio">Pagas la mensualidad y después vas todo el mes.</TarjetaMini>
        </div>
        <Interpretacion>
          Es la misma fila de cuotas, solo que se corrió un puesto hacia el inicio. Ese cambio pequeño cambia el resultado.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title={"2 · ¿Qué significa \"anticipada\"?"}>
        <p><strong>¿Qué es?</strong> Una anualidad anticipada es una fila de pagos iguales que haces <strong>al inicio</strong> de cada pedacito de tiempo.</p>
        <p><strong>¿Cómo funciona?</strong> Pagas primero y después usas el pedacito de tiempo. Por ejemplo: pagas el arriendo y luego vives el mes.</p>
        <TarjetaMini titulo={"\"Anticipada\" NO significa error"} tono="alerta">
          No quiere decir que pagaste antes por equivocación. Quiere decir que así se acordó desde el principio, como una regla del juego.
        </TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>Cuatro situaciones del día a día</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Arriendo" tono="azul">Pagas el arriendo el día 1 y luego vives el mes.</TarjetaMini>
          <TarjetaMini titulo="Colegio" tono="azul">Pagas antes de empezar clases.</TarjetaMini>
          <TarjetaMini titulo="Seguro" tono="azul">Pagas el seguro antes de estar cubierto.</TarjetaMini>
          <TarjetaMini titulo="Gimnasio" tono="azul">Pagas el gimnasio antes de usarlo durante el mes.</TarjetaMini>
        </div>
        <p style={{ marginTop: 12 }}><strong>¿Por qué importa?</strong> Porque no es lo mismo pagar hoy que pagar después. El momento del pago cambia el resultado.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 8px" }}>Diferencia con la anualidad vencida</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Anualidad vencida">Primero uso o pasa el pedacito de tiempo, luego pago.</TarjetaMini>
          <TarjetaMini titulo="Anualidad anticipada">Primero pago, luego uso o pasa el pedacito de tiempo.</TarjetaMini>
        </div>
        <Interpretacion>
          Para saber cuál es, pregúntate: ¿pago cuando termina el mes o cuando empieza? Si es cuando empieza, es anticipada.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · No es lo mismo tasa anticipada que anualidad anticipada">
        <p>Estas dos palabras se parecen, pero no significan lo mismo.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Tarjeta 1 · Tasa anticipada" tono="azul">
            Habla del <strong>interés</strong>. Dice cuándo te cobran el interés: al comienzo.
          </TarjetaMini>
          <TarjetaMini titulo="Tarjeta 2 · Anualidad anticipada" tono="azul">
            Habla de la <strong>cuota</strong>. Dice cuándo pagas la cuota: al comienzo.
          </TarjetaMini>
        </div>
        <TarjetaMini titulo="Para entenderlo fácil" tono="neutral">
          Una cosa es cuándo cobran el interés. Otra cosa es cuándo pagas la cuota. Parecen iguales, pero son temas distintos.
        </TarjetaMini>
        <div style={{ marginTop: 12, padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            No confundas tasa anticipada con anualidad anticipada. La tasa habla del interés. La anualidad habla de la cuota. Primero se arregla la tasa y después se usa la fórmula correcta.
          </div>
        </div>
        <p style={{ marginTop: 14 }}><strong>¿Entonces qué tasa se usa?</strong> Siempre usamos una <strong>tasa periódica efectiva</strong>, es decir, una tasa lista para usar porque ya está en el mismo periodo de las cuotas. Si la tasa llega anticipada, primero se convierte.</p>
        <TarjetaMini titulo="Primero se traduce la tasa" tono="azul">Si la tasa viene anticipada, primero se convierte con la sección de conversión de tasas y luego entra a la fórmula de anualidades.</TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 8px" }}>Las cuatro combinaciones que pueden aparecer</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Tasa vencida + cuota vencida">Ya la conoces: es la sección 5.</TarjetaMini>
          <TarjetaMini titulo="Tasa vencida + cuota anticipada">Es la fórmula de esta sección.</TarjetaMini>
          <TarjetaMini titulo="Tasa anticipada + cuota vencida">Primero la tasa pasa a vencida; luego se usa la fórmula de vencidas.</TarjetaMini>
          <TarjetaMini titulo="Tasa anticipada + cuota anticipada">Primero la tasa pasa a vencida; luego se usa la fórmula de esta sección.</TarjetaMini>
        </div>
        <Interpretacion>
          Cada pregunta se resuelve por separado. Primero miras la tasa y la dejas como lista para usar del tamaño de las cuotas. Después miras la cuota y decides si usas la fórmula de vencida o la de anticipada.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Conexión con interés compuesto y conversión de tasas">
        <TarjetaMini titulo="Dicho claramente" tono="azul">
          Las anualidades usan <strong>interés compuesto</strong> (interés sobre interés). No se calculan con interés simple.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué?</strong> Porque cada cuota cae en una fecha diferente. Para compararlas, hay que moverlas a una misma fecha usando interés compuesto.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Lo que aprendiste en la sección 2</div>
        <TarjetaMini titulo="Idea clave" tono="azul">Las anualidades usan interés compuesto para mover pagos en el tiempo, pero las fórmulas visibles de esta sección son las fórmulas de anualidades.</TarjetaMini>
        <p style={{ color: C.slate }}>Con anualidades hacemos eso con muchas cuotas iguales. La fórmula ya resume todo ese trabajo.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>Conexión con la sección de conversión de tasas</div>
        <p>Antes de usar la fórmula, la tasa debe quedar en el mismo tamaño que las cuotas:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Cuotas mensuales">La tasa debe ser mensual.</TarjetaMini>
          <TarjetaMini titulo="Cuotas bimestrales">La tasa debe ser bimestral.</TarjetaMini>
          <TarjetaMini titulo="Cuotas trimestrales">La tasa debe ser trimestral.</TarjetaMini>
        </div>
        <div style={{ marginTop: 12 }}>
          <TarjetaMini titulo="Advertencia" tono="alerta">
            Si la tasa viene nominal o anticipada, primero se debe convertir a una tasa periódica efectiva del tamaño correcto. Solo después entra a la fórmula.
          </TarjetaMini>
        </div>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>El camino completo de la tasa</div>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Repartir la nominal", content: "ip = NA / nc  (nominal a periódica)" },
          { label: "Paso 2 — Si es anticipada, pasarla a vencida", content: "iv = ia / (1 − ia)" },
          { label: "Paso 3 — Cambiar de tamaño hasta el tiempo de las cuotas", content: "(1 + iy)^(ny/nx) − 1 = ix" },
          { label: "Paso 4 — Usar la tasa en la fórmula", content: "Ahora sí: lista para usar del mismo tamaño que las cuotas." },
        ]} />
        <Interpretacion>
          La fórmula de anualidades solo entiende un tipo de tasa: lista para usar, del mismo tamaño que las cuotas. Todo lo demás se traduce primero con la sección 4.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · ¿Por qué el resultado cambia frente a una anualidad vencida?">
        <p><strong>¿Qué pasa?</strong> Con los mismos datos, la anticipada cambia el resultado porque cada cuota se paga antes.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Como pagas antes, cada cuota tiene un pedacito de tiempo más para moverse en el tiempo. Es como correr toda la fila un puesto hacia el inicio.
        </TarjetaMini>
        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>Las fórmulas oficiales que usaremos</div>
        <BloqueFormula>{"VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]"}</BloqueFormula>
        <BloqueFormula>{"VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ]"}</BloqueFormula>
        <p>La anticipada está un pedacito de tiempo adelantada. Por eso la fórmula cambia.</p>
        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>¿En qué dirección cambia?</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Valor de hoy" tono="azul">Si la tasa es positiva, el VP de la anticipada es MAYOR que el VP de la vencida con los mismos datos.</TarjetaMini>
          <TarjetaMini titulo="Valor del final" tono="azul">Si la tasa es positiva, el VF de la anticipada es MAYOR que el VF de la vencida con los mismos datos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Diferencia fácil:</strong> en la vencida pagas al final; en la anticipada pagas al inicio.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico (con los números que usaremos en las secciones 6 y 7)</div>
          <p>3 cuotas de COP 1.000 con una tasa del 5 % efectivo por pedacito de tiempo. Vamos a ver las dos versiones lado a lado.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
            <TarjetaMini titulo="Vencida">VP = COP {formatMilesCO(eVPv)} · VF = COP {formatMilesCO(eVFv)}</TarjetaMini>
            <TarjetaMini titulo="Anticipada">VP = COP {formatMilesCO(eVPa)} · VF = COP {formatMilesCO(eVFa)}</TarjetaMini>
          </div>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula de VP", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Fórmula de VF", content: "VF = A × [((1 + i)^(n+1) − (1 + i)) / i]" },
              { label: "Resultado VP", content: `VP = COP ${formatMilesCO(eVPa)}` },
              { label: "Resultado VF", content: `VF = COP ${formatMilesCO(eVFa)}` },
            ]} />
          </Acordeon>
          <Interpretacion>
            Las cuotas anticipadas valen {formatPctMilesCO(eVPa / eVPv - 1, 0)} más que las vencidas, tanto hoy como al final. Ese 5 % no es casualidad: es la tasa de un pedacito de tiempo, porque cada cuota se adelantó un pedacito de tiempo.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Valor de hoy: cuánto valen hoy cuotas que se pagan al inicio">
        <p><strong>¿Qué es?</strong> El valor de hoy anticipado responde: <strong>¿cuánto valen hoy las cuotas que se pagan al inicio?</strong></p>
        <p><strong>¿Cómo funciona?</strong> Como las cuotas se pagan antes, su valor de hoy cambia.</p>
        <p style={{ color: C.slate }}><strong>¿Por qué importa?</strong> Sirve para saber cuánto valen hoy pagos que haces desde el inicio, como arriendo, colegio o gimnasio.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula</div>
        <BloqueFormula>{"VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]"}</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VP">El valor de todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota o anualidad.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa periódica efectiva del periodo de las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>El (1 + i) aparece porque cada cuota se paga antes.</p>
        <p style={{ color: C.slate }}><strong>Diferencia con la vencida:</strong> en la anticipada los pagos ocurren al inicio del pedacito de tiempo.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 anualidades anticipadas de COP 1.000 a una tasa del 5 % efectivo periódico. ¿Cuál es el valor de hoy de las anualidades?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Sustitución", content: "VP = 1.000 × (1 + 0,05) × [((1 + 0,05)^3 − 1) / (0,05 × (1 + 0,05)^3)]" },
              { label: "Resultado", content: `VP = COP ${formatMilesCO(eVPa)}` },
              { label: "Fórmula usada", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Revisión", content: "Se usó únicamente la fórmula oficial de valor de hoy anticipado." },
              { label: "Interpretación", content: "Las cuotas anticipadas valen más hoy que las vencidas porque se pagan un pedacito de tiempo antes." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Pagarás COP 3.000 en total, pero hoy esas cuotas valen COP {formatMilesCO(eVPa)}. Con cuotas vencidas valían COP {formatMilesCO(eVPv)}. La diferencia de COP {formatMilesCO(eVPa - eVPv)} existe porque la primera cuota se paga hoy mismo y todas las demás se pagan un pedacito de tiempo antes.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Valor del final: cuánto valen al final cuotas pagadas al inicio">
        <p><strong>¿Qué es?</strong> El valor del final anticipado responde: <strong>¿cuánto valen al final las cuotas pagadas al inicio?</strong></p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como meter monedas a una alcancía al comienzo de cada mes. Como entran antes, tienen más tiempo para crecer.
        </TarjetaMini>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>¿Por qué importa?</strong> Sirve para saber cuánto tendrás al final si ahorras o pagas al inicio de cada pedacito de tiempo.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula</div>
        <BloqueFormula>{"VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ]"}</BloqueFormula>
        <p style={{ color: C.slate }}>Esta es la fórmula oficial de valor del final para anualidades anticipadas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VF">El valor de todas las cuotas al final.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota o anualidad.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa periódica efectiva del periodo de las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}><strong>Diferencia con la vencida:</strong> en la anticipada cada pago se hace al inicio del pedacito de tiempo, por eso el valor del final cambia.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 anualidades anticipadas de COP 1.000 a una tasa del 5 % efectivo periódico. ¿Cuál es el valor del final de las anualidades?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VF = A × [((1 + i)^(n+1) − (1 + i)) / i]" },
              { label: "Sustitución", content: "VF = 1.000 × [((1 + 0,05)^4 − (1 + 0,05)) / 0,05]" },
              { label: "Resultado", content: `VF = COP ${formatMilesCO(eVFa)}` },
              { label: "Fórmula usada", content: "VF = A × [((1 + i)^(n+1) − (1 + i)) / i]" },
              { label: "Revisión", content: `VF = 1.000 × [((1,05)^4 − 1,05) / 0,05] = COP ${formatMilesCO(eVFaAlt)}` },
              { label: "Interpretación", content: "El valor del final es mayor porque cada pago tuvo un pedacito de tiempo más para crecer." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Pusiste COP 3.000 en total y al final tienes COP {formatMilesCO(eVFa)}. Con cuotas vencidas habrías tenido COP {formatMilesCO(eVFv)}. Cada cuota tuvo un pedacito de tiempo más para crecer, y por eso ganaste COP {formatMilesCO(eVFa - eVFv)} adicionales.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Cómo hallar la cuota A desde VP o VF">
        <p>A veces sabemos el valor total, pero no sabemos la cuota anticipada.</p>
        <p style={{ color: C.slate }}>Entonces buscamos <strong>A</strong>, que es el valor de cada cuota.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "14px 0 4px" }}>Caso 1 · Hallar A desde VP</div>
        <BloqueFormula>{"A = VP / { (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] }"}</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando ya sabes cuánto debes hoy y quieres saber cuánto vale cada cuota.</p>
        <p>Encuentra la cuota anticipada de una deuda de COP 30.000.000, pagada en 24 cuotas mensuales, con tasa 30 % NAMA.</p>
        <TarjetaMini titulo={"¿Qué significa \"30 % NAMA\"?"} tono="azul">
          NAMA quiere decir: tasa del año, partida por meses, y cobrada al inicio.
        </TarjetaMini>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Nominal anticipada a periódica anticipada", content: `30 % / 12 = ${formatPctMilesCO(c1ia, 1)} EMA (efectiva mensual anticipada)` },
            { label: "Paso 2 — Mensual anticipada a mensual vencida", content: "i = ia / (1 − ia)" },
            { label: "Sustitución", content: `i = 2,5 % / (1 − 2,5 %) = ${formatPctMilesCO(c1i, 4)} EM  (en clase se redondea a 2,56 %)` },
            { label: "Datos", content: `VP = 30.000.000 · i = ${formatPctMilesCO(c1i, 4)} = ${formatMilesCO(c1i, 6)} · n = 24` },
            { label: "Fórmula", content: "A = VP / { (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)] }" },
            { label: "Factor de anualidad vencida", content: `((1 + i)^24 − 1) / (i × (1 + i)^24) = ${formatMilesCO(fVP(c1i, c1n), 6)}` },
            { label: "Denominador completo", content: `(1 + i) × ${formatMilesCO(fVP(c1i, c1n), 6)} = ${formatMilesCO((1 + c1i) * fVP(c1i, c1n), 6)}` },
            { label: "Resultado", content: `A = 30.000.000 / ${formatMilesCO((1 + c1i) * fVP(c1i, c1n), 6)} = COP ${formatMilesCO(c1A)}` },
            { label: "Interpretación", content: `Para pagar esa deuda en 24 cuotas mensuales anticipadas, cada cuota debe ser aproximadamente COP ${formatMilesCO(c1A)}.` },
          ]} />
        </Acordeon>
        <Interpretacion>
          En total pagarías unos COP {formatMilesCO(c1Total / 1e6, 2)} millones. Pagas más que COP 30 millones por el interés. Como la primera cuota se paga hoy, cada cuota sale un poquito menor que si pagaras al final.
        </Interpretacion>

        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Caso 2 · Hallar A desde VF</div>
        <BloqueFormula>{"A = VF × [ i / ((1 + i)^n − 1) ] / (1 + i)"}</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando conozco el valor del final que quiero alcanzar y quiero saber cuánto debe ser cada cuota anticipada.</p>
        <p>Quieres llegar a COP 150.000.000 con 36 pagos iguales. ¿Cuánto debe valer cada pago?</p>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Nominal anticipada a periódica anticipada", content: `30 % / 12 = ${formatPctMilesCO(c1ia, 1)} EMA` },
            { label: "Paso 2 — Mensual anticipada a mensual vencida", content: `2,5 % / (1 − 2,5 %) = ${formatPctMilesCO(c1i, 4)} EM  (en clase 2,56 %)` },
            { label: "Paso 3 — Como las cuotas son trimestrales, cambiar a trimestral", content: "ET = (1 + i mensual)^3 − 1" },
            { label: "Resultado de la conversión", content: `ET = (1 + ${formatMilesCO(c1i, 6)})^3 − 1 = ${formatPctMilesCO(c2ET, 4)} efectiva trimestral vencida  (en clase se redondea a 7,89 %)` },
            { label: "Datos", content: `VF = 150.000.000 · i = ${formatPctMilesCO(c2ET, 4)} = ${formatMilesCO(c2ET, 6)} · n = 36` },
            { label: "Fórmula", content: "A = VF × [i / ((1 + i)^n − 1)] / (1 + i)" },
            { label: "Factor", content: `i / ((1 + i)^36 − 1) = ${formatMilesCO(c2ET / (Math.pow(1 + c2ET, c2n) - 1), 6)}` },
            { label: "Dividir entre (1 + i)", content: `A = 150.000.000 × ${formatMilesCO(c2ET / (Math.pow(1 + c2ET, c2n) - 1), 6)} / ${formatMilesCO(1 + c2ET, 6)}` },
            { label: "Resultado", content: `A = COP ${formatMilesCO(c2A)}` },
            { label: "Interpretación", content: `Para llegar a COP 150.000.000 al final de 36 trimestres con cuotas anticipadas, cada cuota debe ser aproximadamente COP ${formatMilesCO(c2A)}.` },
          ]} />
        </Acordeon>
        <Interpretacion>
          Aportarías en total unos COP {formatMilesCO(c2Total / 1e6, 2)} millones y llegarías a COP 150 millones: el resto lo ponen los intereses. Guarda todos los decimales de la tasa mientras haces las cuentas; si usas la tasa redondeada a 7,89 %, el resultado se mueve un poco.
        </Interpretacion>
        <p style={{ color: C.slate, marginTop: 10 }}><strong>Diferencia entre los dos casos:</strong> desde VP la cuota paga una deuda que existe hoy; desde VF la cuota construye un ahorro que existirá en el final.</p>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Error común: usar una tasa nominal o anticipada directamente">
        <div style={{ padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            En anualidades anticipadas no metas la tasa como venga. Primero debes dejarla como tasa periódica efectiva del mismo periodo de las cuotas.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Si la tasa viene nominal">Se convierte (se reparte y se cambia de tamaño).</TarjetaMini>
          <TarjetaMini titulo="Si viene anticipada">Se pasa a vencida.</TarjetaMini>
          <TarjetaMini titulo="Cuotas mensuales">La tasa final debe ser mensual vencida.</TarjetaMini>
          <TarjetaMini titulo="Cuotas trimestrales">La tasa final debe ser trimestral vencida.</TarjetaMini>
        </div>
        <p style={{ marginTop: 12 }}><strong>¿Cómo se ve el error?</strong></p>
        <TarjetaMini titulo="Ejemplo de error" tono="alerta">
          Hallar el VP de una anualidad de $100 mensual con una tasa del 25 % NATA, y usar el 25 % directamente como si fuera una tasa mensual. Incorrecto.
        </TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>El procedimiento correcto (25 % NATA es nominal anual, con forma de partir el año trimestral anticipada)</div>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Repartir la nominal anticipada", content: `ETA = 25 % / 4 = ${formatPctMilesCO(x1ETA, 2)} efectiva trimestral anticipada` },
            { label: "Paso 2 — Trimestral anticipada a trimestral vencida", content: `ET = ia / (1 − ia) = 6,25 % / (1 − 6,25 %) = ${formatPctMilesCO(x2ET, 2)} efectiva trimestral vencida` },
            { label: "Paso 3 — Trimestral vencida a mensual vencida", content: "EM = (1 + 0,0667)^(4/12) − 1" },
            { label: "Resultado", content: `EM ≈ ${formatPctMilesCO(x3EM, 2)} efectiva mensual vencida` },
            { label: "Interpretación", content: `Si la anualidad es mensual, debo usar ${formatPctMilesCO(x3EM, 2)} mensual vencida, no 25 % nominal anticipada.` },
          ]} />
        </Acordeon>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>¿Y cuánto cambia el resultado? Probemos con 12 cuotas mensuales anticipadas de $100</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="Correcto" tono="azul">Con i = {formatPctMilesCO(x3EM, 2)} mensual: VP = ${formatMilesCO(xVPcorrecto)}</TarjetaMini>
          <TarjetaMini titulo="Incorrecto" tono="alerta">Con i = 25 % usado como mensual: VP = ${formatMilesCO(xVPerror)}</TarjetaMini>
        </div>
        <Interpretacion>
          Si la anualidad es mensual, se usa {formatPctMilesCO(x3EM, 2)} mensual vencida, no 25 % nominal anticipada. Fíjate qué diferencia: con la tasa mal usada el VP sale en ${formatMilesCO(xVPerror, 0)} y con la correcta en ${formatMilesCO(xVPcorrecto, 0)}. Todo el error viene de no traducir la tasa.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Pagos adicionales extraordinarios en anualidades anticipadas">
        <p><strong>¿Qué es?</strong> En las anticipadas también puede haber pagos extra: pagos diferentes a las cuotas iguales.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Pago grande al inicio">Un pago grande al comienzo.</TarjetaMini>
          <TarjetaMini titulo="Pago extra">Plata extra que das aparte de la cuota.</TarjetaMini>
          <TarjetaMini titulo="Pago en un día especial">Por ejemplo la prima de junio o de diciembre.</TarjetaMini>
          <TarjetaMini titulo="Dos pagos iguales aparte">El mismo valor en dos fechas distintas.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Regla sencilla" tono="azul">
          Las cuotas iguales van en la fórmula. Los pagos diferentes van por fuera y se suman aparte.
        </TarjetaMini>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>La estructura</div>
        <BloqueFormula>{"VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1"}</BloqueFormula>
        <BloqueFormula>{"VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ] + Vp1 × (1 + i)^(n − n1)"}</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <TarjetaMini titulo="A">La cuota anticipada igual.</TarjetaMini>
          <TarjetaMini titulo="i">Tasa periódica efectiva del mismo periodo de las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">Número total de cuotas.</TarjetaMini>
          <TarjetaMini titulo="Vf1 / Vp1">El valor del pago extra que se mueve a VP o a VF.</TarjetaMini>
          <TarjetaMini titulo="n1">El momento en que ocurre el pago extra.</TarjetaMini>
        </div>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Momento focal: todos en la misma fecha</div>
        <p>Para sumar pagos de fechas distintas, primero los llevamos a una misma fecha. Esa fecha se llama momento focal. Para entenderlo fácil, es como tomar una foto de toda la operación.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Si quiero valor de hoy" tono="azul">Traigo todo a hoy (momento 0). El pago extra usa Vf1 / (1 + i)^n1.</TarjetaMini>
          <TarjetaMini titulo="Si quiero valor del final" tono="azul">Llevo todo al final (momento n). El pago extra usa Vp1 × (1 + i)^(n − n1).</TarjetaMini>
        </div>
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Receta en 4 pasos</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="1. Elige el momento focal">¿Quiero VP o VF? Hoy o el final.</TarjetaMini>
          <TarjetaMini titulo="2. Calcula la anualidad anticipada">Usa la fórmula de esta sección solo con las cuotas iguales.</TarjetaMini>
          <TarjetaMini titulo="3. Mueve cada pago extra">Divide o multiplica según esté después o antes del momento focal.</TarjetaMini>
          <TarjetaMini titulo="4. Suma todo">Anualidad anticipada + pagos extra ya movidos.</TarjetaMini>
        </div>
        <div style={{ marginTop: 12 }}>
          <TarjetaMini titulo="Error común" tono="alerta">
            Meter el pago extra dentro de la fórmula de anualidades, o sumar la anualidad llevada a hoy con un pago extra llevado al final. Todo debe llegar a la misma fecha.
          </TarjetaMini>
        </div>
        <Interpretacion>
          Una anualidad anticipada con pagos extra tiene dos partes: la fila de cuotas iguales y los pagos sueltos. Se calculan aparte y al final se suman en la misma fecha.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Ejemplo completo con pagos adicionales: la casa">
        <p>Una pareja compró una casa hoy por COP 720.000.000. Pagaron cuotas bimestrales anticipadas de COP 8.906.829,51 durante 15 años. La tasa es 5,73 % NACA, es decir, nominal anual capitalizable cuatrimestral anticipada. Además, hicieron 2 pagos adicionales en los bimestres 20 y 40, ambos por el mismo valor. ¿Cuál fue el valor de esos desembolsos?</p>
        <TarjetaMini titulo="Qué es qué" tono="azul">
          Las 90 cuotas son la fila de pagos iguales. Los dos X son pagos aparte. La foto es hoy, porque la casa se compró hoy.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Identificar el ritmo de las cuotas", content: "Las cuotas son bimestrales anticipadas. Necesitamos una tasa efectiva bimestral vencida para usar en la fórmula." },
          { label: "Paso 2 — Repartir la nominal anticipada", content: `5,73 % NACA: un año tiene 3 cuatrimestres. 5,73 % / 3 = ${formatPctMilesCO(h1ia, 2)} efectiva cuatrimestral anticipada` },
          { label: "Paso 3 — Anticipada a vencida", content: `${formatPctMilesCO(h1ia, 2)} / (1 − ${formatPctMilesCO(h1ia, 2)}) ≈ ${formatPctMilesCO(h2iv, 2)} efectiva cuatrimestral vencida` },
          { label: "Paso 4 — Cuatrimestral a bimestral", content: `EB = (1 + 0,0195)^(3/6) − 1 = ${formatPctMilesCO(h3EB, 4)} ≈ 0,97 % efectiva bimestral vencida` },
          { label: "Paso 5 — ¿Cuántas cuotas hay?", content: "15 años = 180 meses. Como las cuotas son bimestrales: n = 180 / 2 = 90 cuotas" },
          { label: "Paso 6 — Valor de hoy de las cuotas anticipadas", content: `VP anualidad = 8.906.829,51 × (1 + ${formatMilesCO(h3EB, 6)}) × [((1 + ${formatMilesCO(h3EB, 6)})^90 − 1) / (${formatMilesCO(h3EB, 6)} × (1 + ${formatMilesCO(h3EB, 6)})^90)]` },
          { label: "Resultado del paso 6", content: `VP anualidad ≈ COP ${formatMilesCO(hVPanual)}` },
          { label: "Paso 7 — Fórmula con pago extra", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)] + Vf1/(1 + i)^n1" },
          { label: "Paso 7b — Primer pago extra", content: `Vf1/(1+i)^n1 = X/(1 + ${formatMilesCO(h3EB, 6)})^20` },
          { label: "Paso 8 — Se repite la misma fórmula para el segundo pago extra", content: `Vf1/(1+i)^n1 = X/(1 + ${formatMilesCO(h3EB, 6)})^40` },
          { label: "Paso 9 — Ecuación con los dos pagos", content: `720.000.000 = ${formatMilesCO(hVPanual)} + X/(1+i)^20 + X/(1+i)^40` },
          { label: "Paso 9b — Despejar X", content: `X = ${formatMilesCO(hResto)} / ${formatMilesCO(hFsuma, 4)}` },
          { label: "Resultado", content: `X ≈ COP ${formatMilesCO(hX)} (cada pago adicional)` },
        ]} />
        <Interpretacion>
          Cada pago adicional fue de aproximadamente COP {formatMilesCO(hX)}. Las 90 cuotas aportan COP {formatMilesCO(hVPanual / 1e6, 1)} millones al valor de la casa de hoy, y los COP {formatMilesCO(hResto / 1e6, 1)} millones que faltan los cubren los dos pagos extra, que traídos a hoy valen menos que cuando se pagaron. En clase los factores se redondean a 0,82 y 0,68 (suman unos 1,50); aquí usamos más decimales ({formatMilesCO(hFsuma, 4)}). Este ejemplo usa la tasa cuatrimestral redondeada a 1,95 %; si se conservan todos sus decimales, X sale cerca de COP {formatMilesCO(hXexacto, 2)}. Por eso conviene guardar todos los decimales de las tasas.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Ejemplo del carro">
        <p>Hace 5 años compraste un carro. Lo pagas con cuotas mensuales anticipadas de COP 3.078.925,79 y una tasa del 0,71 % mensual. ¿Cuánto costó el carro el día de la compra?</p>
        <TarjetaMini titulo="Pista" tono="azul">
          Queremos saber cuánto costó el día de la compra, o sea hoy en la línea de tiempo. Eso es un valor de hoy.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Datos", content: "A = 3.078.925,79 · i = 0,71 % = 0,0071 · n = 5 años × 12 meses = 60 cuotas" },
          { label: "Fórmula", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
          { label: "Sustitución", content: "VP = 3.078.925,79 × (1 + 0,0071) × [((1 + 0,0071)^60 − 1) / (0,0071 × (1 + 0,0071)^60)]" },
          { label: "Resultado", content: `VP ≈ COP ${formatMilesCO(kVPa)}` },
          { label: "Comparación", content: `En anualidades vencidas el resultado era aproximadamente COP ${formatMilesCO(kVPv)}.` },
          { label: "Diferencia", content: `${formatMilesCO(kVPa)} − ${formatMilesCO(kVPv)} = COP ${formatMilesCO(kDif, 0)}` },
          { label: "Interpretación", content: "El valor de hoy de la anualidad anticipada es mayor porque cada cuota ocurre un pedacito de tiempo antes." },
        ]} />
        <Interpretacion>
          Con cuotas anticipadas el carro costó unos COP {formatMilesCO(kVPa / 1e6, 3)} millones el día de la compra; con cuotas vencidas habría costado COP {formatMilesCO(kVPv / 1e6, 3)} millones. La diferencia es de unos COP {formatMilesCO(kDif, 0)}, exactamente el 0,71 % de la cifra anterior: el (1 + i) de un pedacito de tiempo.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 13 */}
      <Acordeon title="13 · Cierre y preguntas de repaso">
        <div style={{ padding: 16, background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: C.navy, marginBottom: 8 }}>Antes de terminar, intenta responder sin mirar los apuntes:</div>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>¿Qué significa que una anualidad sea anticipada?</li>
            <li>¿Una tasa anticipada y una anualidad anticipada son lo mismo?</li>
            <li>¿Qué tipo de tasa debe usarse para calcular anualidades anticipadas?</li>
            <li>¿Por qué cambia el resultado frente a una anualidad vencida?</li>
            <li>¿El valor de hoy de una anticipada es mayor o menor que el de una vencida con los mismos datos?</li>
            <li>¿El valor del final de una anticipada es mayor o menor que el de una vencida con los mismos datos?</li>
            <li>¿Puede haber pagos extra en una anualidad anticipada?</li>
            <li>¿Las anualidades se calculan con interés simple o compuesto?</li>
          </ol>
        </div>
        <Acordeon title="Ver respuestas esperadas">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>Que la cuota se paga al inicio de cada pedacito de tiempo.</li>
            <li style={{ marginBottom: 6 }}>No. La tasa anticipada habla del interés; la anualidad anticipada habla del momento de pago de la cuota.</li>
            <li style={{ marginBottom: 6 }}>Una tasa periódica efectiva del mismo periodo de las cuotas.</li>
            <li style={{ marginBottom: 6 }}>Porque cada cuota ocurre un pedacito de tiempo antes.</li>
            <li style={{ marginBottom: 6 }}>Mayor, si la tasa es positiva.</li>
            <li style={{ marginBottom: 6 }}>Mayor, si la tasa es positiva.</li>
            <li style={{ marginBottom: 6 }}>Sí, pero se calculan aparte como pagos extra.</li>
            <li>Se calculan con interés compuesto.</li>
          </ol>
        </Acordeon>
        <Interpretacion>
          Idea final: en una anticipada, la cuota se paga al inicio. Esa es la diferencia más importante frente a una vencida.
        </Interpretacion>
      </Acordeon>

    </div>
  );
}

/* ============================================================
   TERCER CORTE — Gradientes, Perpetuidades y Sistemas de amortización
   Motor de cálculo del módulo educativo (todas las cifras de los
   ejemplos se calculan con estas funciones, con precisión completa;
   solo se redondea la respuesta final a 2 decimales).
   La tasa que entra siempre es la EFECTIVA VENCIDA del periodo de la cuota.
   ============================================================ */
const c3Tasa = (EA, meses) => Math.pow(1 + EA, meses / 12) - 1;
const c3FactorVP = (i, n) => (1 - Math.pow(1 + i, -n)) / i;
const c3FactorVF = (i, n) => (Math.pow(1 + i, n) - 1) / i;
const c3Pago = (i, n, vp, vf = 0) => (vp - vf / Math.pow(1 + i, n)) / c3FactorVP(i, n);
function c3NomAnticipada(nominal, mesesCap) {
  const m = 12 / mesesCap;
  const ia = nominal / m;
  const iv = ia / (1 - ia);
  return { m, ia, iv, EA: Math.pow(1 + iv, m) - 1 };
}
function c3Serie({ A1, paso, tipo, signo, n, i }) {
  const filas = [];
  let VP = 0, VF = 0;
  for (let t = 1; t <= n; t++) {
    const cuota = tipo === "aritmetico" ? A1 + signo * (t - 1) * paso : A1 * Math.pow(1 + signo * paso, t - 1);
    const fd = Math.pow(1 + i, -t);
    const ff = Math.pow(1 + i, n - t);
    filas.push({ t, cuota, fd, vp: cuota * fd, vf: cuota * ff });
    VP += cuota * fd; VF += cuota * ff;
  }
  return { filas, VP, VF, primera: filas[0].cuota, ultima: filas[n - 1].cuota };
}
function c3TIR(flujos) {
  const f = (r) => flujos.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  let lo = -0.5, hi = 10;
  for (let k = 0; k < 400; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function c3Amort({ vp, n, sistema, iDe, otros = 0, vf = 0, gracia = 0, graciaPaga = true, pagaIntereses = true, abonos = {} }) {
  const filas = [];
  const flujos = [vp];
  let saldo = vp, totInt = 0, totOtros = 0, totPag = 0;
  for (let t = 1; t <= n; t++) {
    const i = iDe(t);
    const interes = saldo * i;
    const rest = n - t + 1;
    let abono = 0, cuotaBase = 0, capitaliza = 0;
    if (t <= gracia) {
      if (graciaPaga) cuotaBase = interes; else capitaliza = interes;
    } else if (sistema === "frances") {
      cuotaBase = c3Pago(i, rest, saldo, vf); abono = cuotaBase - interes;
    } else if (sistema === "aleman") {
      abono = saldo / rest; cuotaBase = interes + abono;
    } else {
      if (t < n) { if (pagaIntereses) cuotaBase = interes; else capitaliza = interes; }
      else { abono = saldo; cuotaBase = interes + saldo; }
    }
    const extra = abonos[t] || 0;
    const cuota = cuotaBase + otros;
    saldo = saldo + capitaliza - abono - extra;
    filas.push({ t, cuota, interes, otros, abono, extra, saldo });
    flujos.push(-(cuota + extra));
    totInt += interes; totOtros += otros; totPag += cuota + extra;
  }
  return { filas, flujos, totInt, totOtros, totPag };
}

/* ---------- Piezas visuales reutilizables del tercer corte ---------- */
const m2 = (v) => formatMilesCO(Math.abs(v) < 0.005 ? 0 : v, 2);
const m6 = (v) => formatMilesCO(v, 6);
const m8 = (v) => formatMilesCO(v, 8);

function SubT({ children }) {
  return <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>{children}</div>;
}
function FilaMini({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>{children}</div>;
}
function TablaC3({ cols, filas, pie, alto = 320 }) {
  const th = { padding: "8px 10px", background: C.navy, color: C.white, fontSize: 11.5, fontWeight: 700, textAlign: "right", position: "sticky", top: 0, whiteSpace: "nowrap" };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, margin: "10px 0", overflow: "hidden" }}>
      <div style={{ overflow: "auto", maxHeight: alto }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F_MONO, fontSize: 12.5, color: C.ink }}>
          <thead><tr>{cols.map((c, k) => <th key={k} style={{ ...th, textAlign: k === 0 ? "center" : "right" }}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, r) => (
              <tr key={r} style={{ background: r % 2 ? C.paper : C.white }}>
                {f.map((c, k) => <td key={k} style={{ padding: "6px 10px", textAlign: k === 0 ? "center" : "right", borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{c}</td>)}
              </tr>
            ))}
            {pie && (
              <tr style={{ background: C.paperDark, fontWeight: 700 }}>
                {pie.map((c, k) => <td key={k} style={{ padding: "7px 10px", textAlign: k === 0 ? "center" : "right", borderTop: `2px solid ${C.navy}`, whiteSpace: "nowrap" }}>{c}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function TablaSerie({ serie }) {
  return (
    <TablaC3
      cols={["Periodo t", "Cuota", "1/(1+i)^t", "Valor presente", "Valor al final"]}
      filas={serie.filas.map((f) => [f.t, m2(f.cuota), m6(f.fd), m2(f.vp), m2(f.vf)])}
      pie={["Suma", "", "", m2(serie.VP), m2(serie.VF)]}
    />
  );
}
function TablaAmort({ res, ts, conExtra }) {
  const cols = conExtra ? ["No.", "Cuota", "Interés", "Otros", "Abono a capital", "Abono extra", "Saldo"] : ["No.", "Cuota", "Interés", "Otros", "Abono a capital", "Saldo"];
  const sel = ts ? res.filas.filter((f) => ts.includes(f.t)) : res.filas;
  const filas = sel.map((f) => (conExtra ? [f.t, m2(f.cuota), m2(f.interes), m2(f.otros), m2(f.abono), m2(f.extra), m2(f.saldo)] : [f.t, m2(f.cuota), m2(f.interes), m2(f.otros), m2(f.abono), m2(f.saldo)]));
  return <TablaC3 cols={cols} filas={filas} />;
}
function ConexionesPrevias({ items }) {
  return (
    <div style={{ padding: 16, background: C.paperDark, border: `1px solid ${C.line}`, borderRadius: 10, margin: "0 0 14px" }}>
      <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.navy, fontWeight: 700, marginBottom: 8 }}>🔗 Conexiones con lo que ya aprendimos</div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.65 }}>
        {items.map((t, k) => <li key={k} style={{ marginBottom: 4 }}>{t}</li>)}
      </ul>
    </div>
  );
}
function CierreRepaso({ intro, preguntas, respuestas, idea }) {
  return (
    <>
      <div style={{ padding: 16, background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: C.navy, marginBottom: 8 }}>{intro}</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>{preguntas.map((p, k) => <li key={k}>{p}</li>)}</ol>
      </div>
      <Acordeon title="Ver respuestas esperadas">
        <ol style={{ margin: 0, paddingLeft: 20 }}>{respuestas.map((r, k) => <li key={k} style={{ marginBottom: 6 }}>{r}</li>)}</ol>
      </Acordeon>
      <Interpretacion>{idea}</Interpretacion>
    </>
  );
}

/* ============================================================
   GRADIENTES — módulo educativo (Tercer corte)
   Sigue la presentación de clase "Gradientes y perpetuidades":
   la cuota cambia, aritmético vs geométrico, creciente vs decreciente,
   VP y VF sumando cada cuota traída o llevada con interés compuesto.
   ============================================================ */
function Gradientes() {
  // Ejemplo de clase 1 y 2: 1.000.000 mensuales, 12 meses, 16,2 % EA
  const iM = c3Tasa(0.162, 1);
  const a1 = c3Serie({ A1: 1000000, paso: 80000, tipo: "aritmetico", signo: 1, n: 12, i: iM });
  const a1n = c3Serie({ A1: 1000000, paso: 80000, tipo: "aritmetico", signo: -1, n: 12, i: iM });
  const g1 = c3Serie({ A1: 1000000, paso: 0.015, tipo: "geometrico", signo: 1, n: 12, i: iM });
  const g1n = c3Serie({ A1: 1000000, paso: 0.015, tipo: "geometrico", signo: -1, n: 12, i: iM });
  const anual0 = c3Serie({ A1: 1000000, paso: 0, tipo: "aritmetico", signo: 1, n: 12, i: iM });

  // Crédito del estudiante: 800.000 trimestrales, 17,85 % EA, 5 años = 20 trimestres
  const iT = c3Tasa(0.1785, 3);
  const e1 = c3Serie({ A1: 800000, paso: 30000, tipo: "aritmetico", signo: 1, n: 20, i: iT });
  const e1n = c3Serie({ A1: 800000, paso: 30000, tipo: "aritmetico", signo: -1, n: 20, i: iT });
  const e2 = c3Serie({ A1: 800000, paso: 0.005, tipo: "geometrico", signo: 1, n: 20, i: iT });
  const e2n = c3Serie({ A1: 800000, paso: 0.005, tipo: "geometrico", signo: -1, n: 20, i: iT });

  // Ahorro programado: 500.000 mensuales que suben 6 % cada año, 3 años, 12 % EA
  const iA = c3Tasa(0.12, 1);
  const bA = [500000, 500000 * 1.06, 500000 * 1.06 * 1.06];
  const fVPa = c3FactorVP(iA, 12);
  const fVFa = c3FactorVF(iA, 12);
  const bVP = bA.map((c, k) => c * fVPa / Math.pow(1 + iA, 12 * k));
  const bVF = bA.map((c, k) => c * fVFa * Math.pow(1 + iA, 12 * (2 - k)));
  const anVP = bVP[0] + bVP[1] + bVP[2];
  const anVF = bVF[0] + bVF[1] + bVF[2];
  let chkVP = 0;
  for (let t = 1; t <= 36; t++) chkVP += bA[Math.floor((t - 1) / 12)] / Math.pow(1 + iA, t);

  // Última cuota (ahora ustedes): 12.000.000, G = 200.000 ó g = 3 %, 12 meses
  const u1 = 12000000 + 11 * 200000, u1n = 12000000 - 11 * 200000;
  const u2 = 12000000 * Math.pow(1.03, 11), u2n = 12000000 * Math.pow(0.97, 11);

  // Para practicar: inversionista, 1.200.000 bimestrales, 9,87 % EA, 2,5 años = 15 bimestres
  const iB = c3Tasa(0.0987, 2);
  const pr1 = c3Serie({ A1: 1200000, paso: 75000, tipo: "aritmetico", signo: 1, n: 15, i: iB });
  const pr1n = c3Serie({ A1: 1200000, paso: 75000, tipo: "aritmetico", signo: -1, n: 15, i: iB });
  const pr2 = c3Serie({ A1: 1200000, paso: 0.0095, tipo: "geometrico", signo: 1, n: 15, i: iB });
  const pr2n = c3Serie({ A1: 1200000, paso: 0.0095, tipo: "geometrico", signo: -1, n: 15, i: iB });

  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco titulo="🧸 Nivel 5 años">
        {`Imagina que tu mamá te da una mesada todos los meses.

Si siempre te da las MISMAS monedas, eso es una anualidad: una fila de galletas iguales.

Pero un día te dice: "Este mes te doy 5 monedas, el próximo 6, el otro 7...". Cada mes te da un poquito más. Esa fila ya no es plana: es una ESCALERA. Eso se llama GRADIENTE.

Hay dos tipos de escalera:
— Aritmética: cada escalón sube lo MISMO en pesos (siempre 1 moneda más).
— Geométrica: cada escalón sube el MISMO porcentaje (siempre un poquito más, pero el poquito se hace más grande a medida que la mesada crece).

También puede ser una escalera que BAJA: cada mes te dan un poquito menos.

Y como con las anualidades, podemos preguntar: ¿cuánto vale toda la escalera HOY (VP)? ¿Y cuánto vale al FINAL (VF)? Para saberlo, traemos o llevamos cada escalón con interés compuesto y los sumamos todos.`}
      </NivelCinco>

      <ConexionesPrevias items={[
        "Un gradiente es una anualidad cuya cuota cambia. Una anualidad es un gradiente igual a cero.",
        "Cada cuota se mueve en el tiempo con interés compuesto: VP = VF / (1 + i)^n y VF = VP × (1 + i)^n.",
        "La tasa que entra al cálculo es SIEMPRE la efectiva vencida del periodo de la cuota, obtenida con la conversión de tasas (por ejemplo, de EA a mensual). Esto no se asume: se hace cada vez.",
        "Aquí también hay una cuota por cada pedacito de tiempo y la primera cuota cae en el momento 1 (cuota vencida).",
      ]} />

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · De una cuota igual a una cuota que cambia" defaultOpen>
        <p><strong>¿Qué es un gradiente?</strong> Es una serie de cuotas que <strong>cambia periodo a periodo</strong>: cada cuota es un poquito mayor (o menor) que la anterior, siguiendo una regla fija.</p>
        <FilaMini>
          <TarjetaMini titulo="Anualidad: la fila plana" tono="azul">Todas las cuotas valen lo mismo, como una mesada fija. El cambio entre una cuota y otra es cero.</TarjetaMini>
          <TarjetaMini titulo="Gradiente: la escalera" tono="azul">Cada cuota cambia con una regla: sube (o baja) el mismo valor en pesos, o el mismo porcentaje.</TarjetaMini>
        </FilaMini>
        <p><strong>¿Por qué es importante?</strong> Porque en la vida real casi nada se queda quieto: el sueldo sube, el arriendo se ajusta, los precios suben con la inflación. Si tu ahorro no sube, la inflación le va quitando valor.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "10px 0 6px" }}>Ejemplos reales en Colombia</div>
        <FilaMini>
          <TarjetaMini titulo="Ahorro programado que sube cada año">Hoy ahorras COP 500.000 al mes y cada año subes el aporte un 6 % para que la inflación no le quite valor.</TarjetaMini>
          <TarjetaMini titulo="Crédito de vivienda con cuota que se ajusta">La cuota empieza más baja y va subiendo con el tiempo, o empieza alta y va bajando.</TarjetaMini>
          <TarjetaMini titulo="Arriendo con aumento anual">Pagas lo mismo todo el año y en enero te lo suben un porcentaje.</TarjetaMini>
          <TarjetaMini titulo="Leasing de un vehículo para una empresa">La empresa paga cuotas que suben o bajan según un acuerdo con el banco.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Diferencia fácil con la anualidad" tono="azul">
          Anualidad = fila de galletas iguales. Gradiente = escalera de galletas. Una anualidad es una escalera de escalón cero: por eso todo lo que sabías de anualidades sirve aquí.
        </TarjetaMini>
        <Interpretacion>
          Si el gradiente es cero, la serie vuelve a ser una anualidad. Compruébalo: con cuota de COP 1.000.000 durante 12 meses al 16,2 % EA (i mensual = {m8(iM)}), una anualidad da un valor de hoy de COP {m2(anual0.VP)}.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · Gradiente aritmético: sube o baja siempre lo mismo en pesos">
        <p><strong>¿Qué es?</strong> En el gradiente aritmético, cada cuota es la anterior <strong>más (o menos) un mismo valor en pesos</strong>.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">Es una escalera de escalones parejos: cada escalón sube exactamente 80.000 pesos. Ni más, ni menos.</TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Cómo funciona?</strong> Se parte de la primera cuota y se le suma (o resta) el gradiente una vez por cada periodo que pasa.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula de cada cuota</div>
        <BloqueFormula>Creciente: A(t) = A(1) + (t − 1) × G</BloqueFormula>
        <BloqueFormula>Decreciente: A(t) = A(1) − (t − 1) × G</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="A(t)">La cuota que se paga en el periodo t.</TarjetaMini>
          <TarjetaMini titulo="A(1)">La primera cuota. Es el punto de partida y NO cambia.</TarjetaMini>
          <TarjetaMini titulo="G">El gradiente aritmético: los pesos que sube o baja cada periodo.</TarjetaMini>
          <TarjetaMini titulo="t">El número del periodo (1, 2, 3... n).</TarjetaMini>
        </FilaMini>
        <p>En la presentación de clase se escribe igual, paso a paso: A2 = A1 + G, A3 = A2 + G, y así hasta la última.</p>
        <p style={{ marginTop: 10 }}><strong>Ejemplo:</strong> primera cuota de COP 1.000.000 y gradiente de COP 80.000 (creciente):</p>
        <p style={{ fontFamily: F_MONO, fontSize: 13.5 }}>
          A(1) = {m2(a1.filas[0].cuota)} · A(2) = {m2(a1.filas[1].cuota)} · A(3) = {m2(a1.filas[2].cuota)} · ... · A(12) = {m2(a1.ultima)}
        </p>
        <Interpretacion>
          La última cuota se calcula así: A(12) = 1.000.000 + (12 − 1) × 80.000 = COP {m2(a1.ultima)}. Fíjate que se suma el gradiente 11 veces, no 12, porque la primera cuota todavía no ha cambiado.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · Gradiente geométrico: sube o baja siempre el mismo porcentaje">
        <p><strong>¿Qué es?</strong> En el gradiente geométrico, cada cuota es la anterior <strong>multiplicada por (1 + g)</strong>: sube el mismo porcentaje cada vez.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como una planta que crece un 10 % cada semana: la primera semana crece poquito, pero como ya es más grande, la siguiente crece más centímetros. El porcentaje es el mismo; los centímetros (los pesos) cada vez son más.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué importa?</strong> Es la forma natural de proteger un aporte de la inflación: si los precios suben un 6 % al año, subes tu aporte un 6 % al año y conserva su poder de compra.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula de cada cuota</div>
        <BloqueFormula>Creciente: A(t) = A(1) × (1 + g)^(t − 1)</BloqueFormula>
        <BloqueFormula>Decreciente: A(t) = A(1) × (1 − g)^(t − 1)</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="A(t)">La cuota del periodo t.</TarjetaMini>
          <TarjetaMini titulo="A(1)">La primera cuota. No cambia.</TarjetaMini>
          <TarjetaMini titulo="g">El gradiente geométrico: el porcentaje que sube o baja cada periodo (1,5 % = 0,015).</TarjetaMini>
          <TarjetaMini titulo="t − 1">Cuántas veces ha cambiado la cuota desde la primera.</TarjetaMini>
        </FilaMini>
        <p>En clase: A2 = A1 × (1 + g), A3 = A2 × (1 + g), etc. Multiplicar por (1 + g) tantas veces da la potencia (t − 1).</p>
        <p><strong>Ejemplo:</strong> primera cuota de COP 1.000.000 que sube 1,5 % cada mes:</p>
        <p style={{ fontFamily: F_MONO, fontSize: 13.5 }}>
          A(1) = {m2(g1.filas[0].cuota)} · A(2) = {m2(g1.filas[1].cuota)} · A(3) = {m2(g1.filas[2].cuota)} · ... · A(12) = {m2(g1.ultima)}
        </p>
        <Interpretacion>
          A(12) = 1.000.000 × (1,015)^11 = COP {m2(g1.ultima)}. Cada mes la cuota sube un 1,5 % de lo que valía el mes anterior, por eso los escalones en pesos van creciendo un poquito cada vez.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Aritmético vs geométrico: ¿cuál es cuál?">
        <FilaMini>
          <TarjetaMini titulo="Aritmético (G, en pesos)" tono="azul">
            Siempre el mismo valor en pesos. Ejemplo: +80.000 cada mes. Los escalones son todos del mismo tamaño.
          </TarjetaMini>
          <TarjetaMini titulo="Geométrico (g, en porcentaje)" tono="azul">
            Siempre el mismo porcentaje. Ejemplo: +1,5 % cada mes. Los escalones en pesos van creciendo.
          </TarjetaMini>
        </FilaMini>
        <TablaC3
          cols={["Periodo", "Aritmético (+80.000)", "Geométrico (+1,5 %)", "Escalón aritmético", "Escalón geométrico"]}
          filas={[1, 2, 3, 6, 12].map((t) => [
            t, m2(a1.filas[t - 1].cuota), m2(g1.filas[t - 1].cuota),
            t === 1 ? "—" : m2(a1.filas[t - 1].cuota - a1.filas[t - 2].cuota),
            t === 1 ? "—" : m2(g1.filas[t - 1].cuota - g1.filas[t - 2].cuota),
          ])}
        />
        <p style={{ color: C.slate }}><strong>Pista para reconocerlos:</strong> si el ejercicio dice "gradiente de COP 30.000", es aritmético (pesos). Si dice "gradiente del 0,5 %", es geométrico (porcentaje). Se escriben con letras distintas: G mayúscula para el aritmético y g minúscula para el geométrico.</p>
        <Interpretacion>
          En el aritmético el escalón siempre es de COP 80.000. En el geométrico empieza en COP {m2(g1.filas[1].cuota - g1.filas[0].cuota)} y llega a COP {m2(g1.filas[11].cuota - g1.filas[10].cuota)}: el porcentaje es igual, pero se aplica sobre una cuota cada vez más grande.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · Crecientes y decrecientes: ¿qué cambia en el resultado?">
        <p><strong>Gradiente positivo (creciente):</strong> suma o incrementa la cuota. <strong>Gradiente negativo (decreciente):</strong> resta o disminuye la cuota.</p>
        <FilaMini>
          <TarjetaMini titulo="Creciente" tono="azul">Empiezas pagando poquito y cada vez más. La mayor parte del dinero llega tarde, y el dinero tarde vale menos hoy.</TarjetaMini>
          <TarjetaMini titulo="Decreciente" tono="azul">Empiezas pagando más y cada vez menos. Casi todo el dinero llega temprano y vale más hoy.</TarjetaMini>
        </FilaMini>
        <TablaC3
          cols={["Caso (1.000.000 inicial, 12 meses, 16,2 % EA)", "Última cuota", "Valor presente", "Valor al final"]}
          filas={[
            ["Aritmético creciente (+80.000)", m2(a1.ultima), m2(a1.VP), m2(a1.VF)],
            ["Aritmético decreciente (−80.000)", m2(a1n.ultima), m2(a1n.VP), m2(a1n.VF)],
            ["Geométrico creciente (+1,5 %)", m2(g1.ultima), m2(g1.VP), m2(g1.VF)],
            ["Geométrico decreciente (−1,5 %)", m2(g1n.ultima), m2(g1n.VP), m2(g1n.VF)],
            ["Anualidad (gradiente cero)", m2(anual0.ultima), m2(anual0.VP), m2(anual0.VF)],
          ]}
        />
        <TarjetaMini titulo="Ojo con el decreciente aritmético" tono="alerta">
          La cuota no puede volverse negativa. Debe cumplirse que A(1) − (n − 1) × G sea mayor o igual a cero. Aquí: 1.000.000 − 11 × 80.000 = {m2(a1n.ultima)}, todavía es positiva.
        </TarjetaMini>
        <Interpretacion>
          El gradiente creciente da un valor presente de COP {m2(a1.VP)}, mayor que el de la anualidad (COP {m2(anual0.VP)}), porque en total entra más plata. El decreciente da COP {m2(a1n.VP)}, menor. Si el gradiente suma, el resultado sube; si resta, baja.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Valor presente y valor futuro de un gradiente">
        <p><strong>¿Qué es?</strong> El valor presente (VP) responde: ¿cuánto vale <em>hoy</em> toda la escalera? El valor futuro (VF) responde: ¿cuánto vale <em>al final</em>?</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como traer cada galleta de la escalera a la mesa de hoy. Las galletas lejanas se encogen un poquito (se dividen); luego juntas todas las galletas encogidas. Para el valor del final, en vez de encoger, las agrandas y también las juntas.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Cómo funciona?</strong> Las fórmulas de anualidades no sirven directo, porque las cuotas no son iguales. Entonces hacemos lo mismo que con un pago único, pero con cada cuota: la movemos con interés compuesto y sumamos.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmulas</div>
        <BloqueFormula>VP = A(1)/(1+i)^1 + A(2)/(1+i)^2 + ... + A(n)/(1+i)^n</BloqueFormula>
        <BloqueFormula>VF = A(1)×(1+i)^(n−1) + A(2)×(1+i)^(n−2) + ... + A(n)</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="A(t)">La cuota del periodo t (según el tipo de gradiente).</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo de la cuota. Si la cuota es mensual, i es mensual.</TarjetaMini>
          <TarjetaMini titulo="t">El periodo en que cae la cuota (1, 2, 3... n).</TarjetaMini>
          <TarjetaMini titulo="n">El número total de cuotas.</TarjetaMini>
        </FilaMini>
        <p>En clase se hace en Excel: una columna con la cuota, otra con su valor presente (o futuro) y al final se suman. Eso es exactamente lo que muestran las tablas de los ejemplos que siguen.</p>
        <p style={{ color: C.slate }}><strong>Diferencia con la anualidad:</strong> en la anualidad una sola fórmula suma todas las cuotas porque son iguales. En el gradiente cada cuota es distinta, así que se mueve una por una y después se suma.</p>
        <TarjetaMini titulo="Regla de oro" tono="azul">
          Primero se convierte la tasa al periodo de la cuota (conversión de tasas). Después se mueve cada cuota con interés compuesto. Al final se suma y se redondea solo la respuesta final, conservando al menos 6 decimales en los pasos intermedios.
        </TarjetaMini>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Ejemplo: ahorro programado con gradiente aritmético">
        <p>Un inversionista ahorra COP 1.000.000 el primer mes. Cada mes aumenta su aporte en COP 80.000 durante 12 meses, en un fondo que le da 16,2 % EA. ¿Cuánto vale hoy y cuánto vale al final esa escalera? Hazlo con gradiente positivo y negativo.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Datos", content: "A(1) = 1.000.000 · G = 80.000 · n = 12 meses · tasa = 16,2 % EA" },
          { label: "Paso 2 — Tasa al idioma de la cuota", content: `Las cuotas son mensuales, así que i = (1 + 0,162)^(1/12) − 1 = ${m8(iM)} (${formatMilesCO(iM * 100, 6)} % efectivo mensual)` },
          { label: "Paso 3 — Las cuotas (creciente)", content: `A(t) = 1.000.000 + (t − 1) × 80.000 → desde ${m2(a1.primera)} hasta ${m2(a1.ultima)}` },
          { label: "Paso 4 — Traer cada cuota a hoy", content: "VP de cada cuota = A(t) / (1 + i)^t (columna 'Valor presente' de la tabla)" },
          { label: "Paso 5 — Sumar (VP creciente)", content: `VP = COP ${m2(a1.VP)}` },
          { label: "Paso 6 — Llevar cada cuota al final", content: "VF de cada cuota = A(t) × (1 + i)^(12 − t)" },
          { label: "Paso 7 — Sumar (VF creciente)", content: `VF = COP ${m2(a1.VF)}` },
          { label: "Paso 8 — Repetir con gradiente negativo (A(t) = 1.000.000 − (t − 1) × 80.000)", content: `VP = COP ${m2(a1n.VP)} · VF = COP ${m2(a1n.VF)}` },
        ]} />
        <Acordeon title="Ver la tabla con las 12 cuotas (gradiente positivo)">
          <TablaSerie serie={a1} />
        </Acordeon>
        <Acordeon title="Ver la tabla con las 12 cuotas (gradiente negativo)">
          <TablaSerie serie={a1n} />
        </Acordeon>
        <Interpretacion>
          Con el gradiente positivo la escalera vale hoy COP {m2(a1.VP)}; con el negativo, COP {m2(a1n.VP)}. Comprobación: llevar el VP de {m2(a1.VP)} doce meses adelante con (1 + i) da COP {m2(a1.VP * Math.pow(1 + iM, 12))}, que es el VF: la misma plata vista en dos fechas.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Ejemplo: aporte que sube con la inflación (gradiente geométrico)">
        <p>El mismo inversionista aporta COP 1.000.000 el primer mes y ahora sube su aporte un 1,5 % cada mes, durante 12 meses, con la misma tasa de 16,2 % EA. Halla VP y VF con gradiente positivo y negativo.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Datos", content: "A(1) = 1.000.000 · g = 1,5 % = 0,015 · n = 12 · tasa = 16,2 % EA" },
          { label: "Paso 2 — Tasa mensual efectiva", content: `i = (1 + 0,162)^(1/12) − 1 = ${m8(iM)}` },
          { label: "Paso 3 — Las cuotas (creciente)", content: `A(t) = 1.000.000 × (1,015)^(t − 1) → desde ${m2(g1.primera)} hasta ${m2(g1.ultima)}` },
          { label: "Paso 4 — Traer a hoy y sumar", content: `VP = COP ${m2(g1.VP)}` },
          { label: "Paso 5 — Llevar al final y sumar", content: `VF = COP ${m2(g1.VF)}` },
          { label: "Paso 6 — Con gradiente negativo, A(t) = 1.000.000 × (0,985)^(t − 1)", content: `Última cuota = ${m2(g1n.ultima)} · VP = COP ${m2(g1n.VP)} · VF = COP ${m2(g1n.VF)}` },
        ]} />
        <Acordeon title="Ver la tabla con las 12 cuotas (gradiente positivo)">
          <TablaSerie serie={g1} />
        </Acordeon>
        <Interpretacion>
          El aporte que sube 1,5 % vale hoy COP {m2(g1.VP)} y al final COP {m2(g1.VF)}. Si en cambio baja 1,5 % cada mes, vale hoy COP {m2(g1n.VP)}. Ahorrar más cada mes se nota: la diferencia entre subir y bajar es de COP {m2(g1.VP - g1n.VP)} en valor de hoy.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Ejemplo: el crédito del estudiante (cuotas trimestrales)">
        <p>Un estudiante debe pagar cuotas trimestrales de COP 800.000 por un crédito que le cobra 17,85 % EA. El crédito dura 5 años. Primero tiene un gradiente aritmético de COP 30.000 por trimestre; después, un gradiente geométrico de 0,5 % por trimestre. Halla VP y VF, con gradientes positivos y negativos.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — ¿Cuántas cuotas hay?", content: "5 años = 20 trimestres, así que n = 20" },
          { label: "Paso 2 — Tasa trimestral efectiva", content: `i = (1 + 0,1785)^(3/12) − 1 = ${m8(iT)} (${formatMilesCO(iT * 100, 6)} % efectivo trimestral)` },
          { label: "Paso 3 — Aritmético creciente", content: `A(t) = 800.000 + (t − 1) × 30.000 · última cuota ${m2(e1.ultima)} · VP = ${m2(e1.VP)} · VF = ${m2(e1.VF)}` },
          { label: "Paso 4 — Aritmético decreciente", content: `A(t) = 800.000 − (t − 1) × 30.000 · última cuota ${m2(e1n.ultima)} · VP = ${m2(e1n.VP)} · VF = ${m2(e1n.VF)}` },
          { label: "Paso 5 — Geométrico creciente", content: `A(t) = 800.000 × (1,005)^(t − 1) · última cuota ${m2(e2.ultima)} · VP = ${m2(e2.VP)} · VF = ${m2(e2.VF)}` },
          { label: "Paso 6 — Geométrico decreciente", content: `A(t) = 800.000 × (0,995)^(t − 1) · última cuota ${m2(e2n.ultima)} · VP = ${m2(e2n.VP)} · VF = ${m2(e2n.VF)}` },
        ]} />
        <TablaC3
          cols={["Caso", "Última cuota", "Valor presente", "Valor al final"]}
          filas={[
            ["Aritmético creciente", m2(e1.ultima), m2(e1.VP), m2(e1.VF)],
            ["Aritmético decreciente", m2(e1n.ultima), m2(e1n.VP), m2(e1n.VF)],
            ["Geométrico creciente", m2(e2.ultima), m2(e2.VP), m2(e2.VF)],
            ["Geométrico decreciente", m2(e2n.ultima), m2(e2n.VP), m2(e2n.VF)],
          ]}
        />
        <Acordeon title="Ver la tabla de las 20 cuotas (aritmético creciente)">
          <TablaSerie serie={e1} />
        </Acordeon>
        <Interpretacion>
          Con gradiente aritmético creciente, la última cuota llega a COP {m2(e1.ultima)}; con el geométrico apenas a COP {m2(e2.ultima)}, porque 0,5 % por trimestre es un cambio mucho más suave que 30.000 pesos. Por eso el valor presente aritmético (COP {m2(e1.VP)}) es mayor que el geométrico (COP {m2(e2.VP)}).
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Cuando el gradiente no cambia cada periodo">
        <p><strong>¿Qué pasa?</strong> A veces la cuota es mensual, pero el aumento ocurre solo una vez al año. Entonces durante 12 meses la cuota es igual y en el mes 13 salta.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es una escalera con descansos: te quedas 12 escalones en el mismo nivel y luego subes. Como tu cumpleaños: tu estatura "oficial" cambia una vez al año, aunque tú crezcas todos los días.
        </TarjetaMini>
        <TarjetaMini titulo="Regla importante" tono="alerta">
          Si el ejercicio NO dice cada cuánto cambia el gradiente, el gradiente tiene el mismo periodo de la cuota (cambia en cada cuota). Si dice "cada año" o "cada 4 meses", solo cambia en esos momentos.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Ojo con la tasa:</strong> la tasa i sigue siendo la del periodo de la <em>cuota</em> (mensual). El gradiente anual NO cambia esa tasa: solo dice cuándo salta la cuota.</p>
        <p><strong>Ejemplo (ahorro programado que sube cada año):</strong> ahorras COP 500.000 al mes durante el primer año. Cada año el aporte sube un 6 % (por inflación) durante 3 años. El fondo da 12 % EA. ¿Cuánto vale hoy y cuánto vale al final tu ahorro?</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Datos", content: "Cuota mensual inicial 500.000 · sube 6 % cada 12 meses · 3 años = 36 cuotas · tasa 12 % EA" },
          { label: "Paso 2 — Tasa mensual efectiva (el idioma de la cuota)", content: `i = (1 + 0,12)^(1/12) − 1 = ${m8(iA)}` },
          { label: "Paso 3 — Las tres cuotas distintas", content: `Año 1: ${m2(bA[0])} (meses 1 a 12) · Año 2: ${m2(bA[1])} (meses 13 a 24) · Año 3: ${m2(bA[2])} (meses 25 a 36)` },
          { label: "Paso 4 — Cada año es una anualidad de 12 cuotas iguales", content: `Factor de anualidad a 12 meses: [1 − (1 + i)^−12] / i = ${m6(fVPa)}` },
          { label: "Paso 5 — Valor presente de cada año, traído a hoy", content: `Año 1: ${m2(bVP[0])} · Año 2: ${m2(bVP[1])} (se divide por (1 + i)^12) · Año 3: ${m2(bVP[2])} (se divide por (1 + i)^24)` },
          { label: "Paso 6 — Sumar", content: `VP = COP ${m2(anVP)}` },
          { label: "Paso 7 — Valor al final (mes 36)", content: `Factor de acumulación a 12 meses: [(1 + i)^12 − 1] / i = ${m6(fVFa)} → VF = COP ${m2(anVF)}` },
          { label: "Comprobación", content: `Sumando las 36 cuotas una por una se obtiene VP = COP ${m2(chkVP)}` },
        ]} />
        <Interpretacion>
          Tu ahorro vale hoy COP {m2(anVP)} y al final COP {m2(anVF)}. Cada bloque de 12 cuotas iguales es una anualidad (que ya sabes calcular); el gradiente solo cambia el valor de la cuota de un bloque a otro.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · ¿Cuánto vale la última cuota? Ejercicio resuelto y para practicar">
        <p>Un inversionista paga COP 12.000.000 mensuales durante 12 meses. Halla el valor de la última cuota con cada gradiente, positivo y negativo.</p>
        <FichaProcedimiento pasos={[
          { label: "Aritmético, G = 200.000 (creciente)", content: `A(12) = 12.000.000 + 11 × 200.000 = COP ${m2(u1)}` },
          { label: "Aritmético, G = 200.000 (decreciente)", content: `A(12) = 12.000.000 − 11 × 200.000 = COP ${m2(u1n)}` },
          { label: "Geométrico, g = 3 % (creciente)", content: `A(12) = 12.000.000 × (1,03)^11 = COP ${m2(u2)}` },
          { label: "Geométrico, g = 3 % (decreciente)", content: `A(12) = 12.000.000 × (0,97)^11 = COP ${m2(u2n)}` },
        ]} />
        <Interpretacion>
          Con el mismo punto de partida, el geométrico creciente termina en COP {m2(u2)}, más arriba que el aritmético (COP {m2(u1)}), porque el 3 % se aplica sobre cuotas cada vez más grandes. Y al bajar, el geométrico no llega a cero: se hace cada vez más pequeño sin volverse negativo.
        </Interpretacion>
        <SubT>Ahora tú: el inversionista del fondo bimestral</SubT>
        <p>Un inversionista paga COP 1.200.000 bimestrales en un fondo que le da 9,87 % EA. Aplica un gradiente aritmético de COP 75.000 bimestrales (y luego uno geométrico de 0,95 % bimestral). La inversión duró 2 años y medio. Halla VP y VF con gradiente positivo y negativo.</p>
        <TarjetaMini titulo="Pistas" tono="azul">
          2,5 años = 30 meses y cada cuota es cada 2 meses, así que n = 15. La tasa debe ser efectiva bimestral: i = (1 + 0,0987)^(2/12) − 1 = {m8(iB)}.
        </TarjetaMini>
        <Acordeon title="Ver respuestas">
          <TablaC3
            cols={["Caso", "Última cuota", "Valor presente", "Valor al final"]}
            filas={[
              ["Aritmético creciente (+75.000)", m2(pr1.ultima), m2(pr1.VP), m2(pr1.VF)],
              ["Aritmético decreciente (−75.000)", m2(pr1n.ultima), m2(pr1n.VP), m2(pr1n.VF)],
              ["Geométrico creciente (+0,95 %)", m2(pr2.ultima), m2(pr2.VP), m2(pr2.VF)],
              ["Geométrico decreciente (−0,95 %)", m2(pr2n.ultima), m2(pr2n.VP), m2(pr2n.VF)],
            ]}
          />
        </Acordeon>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Errores comunes">
        <FilaMini>
          <TarjetaMini titulo="Mezclar G con g" tono="alerta">G (pesos) se suma. g (porcentaje) se multiplica por (1 + g). No se pueden cambiar entre sí.</TarjetaMini>
          <TarjetaMini titulo="Sumar el gradiente n veces" tono="alerta">La primera cuota no cambia. El gradiente se aplica (t − 1) veces, no t.</TarjetaMini>
          <TarjetaMini titulo="Tasa que no habla el idioma de la cuota" tono="alerta">Si la cuota es trimestral y usas la EA directo, el resultado queda mal. Primero convierte la tasa.</TarjetaMini>
          <TarjetaMini titulo="Redondear la tasa muy pronto" tono="alerta">Guarda al menos 6 decimales de la tasa y de los factores. Redondea solo la respuesta final.</TarjetaMini>
          <TarjetaMini titulo="Usar la fórmula de anualidades directo" tono="alerta">Solo sirve si las cuotas son iguales. Un gradiente distinto de cero necesita mover cada cuota (o cada bloque de cuotas iguales).</TarjetaMini>
        </FilaMini>
      </Acordeon>

      {/* SECCIÓN 13 */}
      <Acordeon title="13 · Cierre y preguntas de repaso">
        <CierreRepaso
          intro="Antes de seguir, intenta responder sin mirar los apuntes:"
          preguntas={[
            "¿Qué es un gradiente y qué relación tiene con una anualidad?",
            "¿Cuál es la diferencia entre un gradiente aritmético y uno geométrico?",
            "¿Qué cambia en el resultado cuando el gradiente suma y cuando resta?",
            "Si la cuota es mensual y sube cada 12 meses, ¿qué tasa uso? ¿Y si el ejercicio no dice cada cuánto cambia?",
            "¿Cómo se halla el valor presente y el valor futuro de un gradiente?",
          ]}
          respuestas={[
            "Es una serie de cuotas que cambia periodo a periodo. Una anualidad es un gradiente igual a cero.",
            "El aritmético sube o baja siempre el mismo valor en pesos; el geométrico, siempre el mismo porcentaje.",
            "Si suma, las cuotas, el valor presente y el valor futuro son mayores; si resta, son menores.",
            "La tasa efectiva vencida del periodo de la cuota (mensual). Si no se dice cada cuánto cambia, el gradiente tiene el mismo periodo de la cuota.",
            "Se lleva cada cuota al momento del cálculo con interés compuesto (se divide por (1 + i)^t para el valor presente; se multiplica por (1 + i)^(n − t) para el valor futuro) y se suman todas.",
          ]}
          idea="Idea final: un gradiente es una anualidad cuya cuota cambia. Todo lo que ya sabes (tasa efectiva del periodo, interés compuesto, momento de cada cuota) sigue valiendo."
        />
      </Acordeon>

    </div>
  );
}

/* ============================================================
   PERPETUIDADES — módulo educativo (Tercer corte)
   Una perpetuidad es una anualidad que nunca termina.
   Incluye gradiente aritmético y geométrico infinitos.
   ============================================================ */
function Perpetuidades() {
  // Local de arriendo (ejemplo del enunciado): 1.000.000 mensuales, 1 % efectivo mensual
  const pA = 1000000, pi = 0.01;
  const pVP = pA / pi;
  const encoge = [1, 12, 120, 600, 1200].map((t) => ({ t, v: pA / Math.pow(1 + pi, t) }));
  const anual = [12, 60, 120, 360, 600, 1200].map((n) => ({ n, v: pA * c3FactorVP(pi, n) }));

  // Clase: 150.000 cuatrimestrales, 11,35 % EA
  const c1i = c3Tasa(0.1135, 4);
  const c1 = 150000 / c1i;
  // Ahora ustedes: 345.000 semestrales, 19,98 % EA
  const c2i = c3Tasa(0.1998, 6);
  const c2 = 345000 / c2i;

  // Gradiente aritmético infinito: 150.000 mensuales, 11,35 % EA, L = 5.000
  const mi = c3Tasa(0.1135, 1);
  const ar1 = 150000 / mi + 5000 / (mi * mi);
  // Ahora ustedes: 284.000, 19,54 % EA, L = 18.000
  const m2i = c3Tasa(0.1954, 1);
  const ar2 = 284000 / m2i + 18000 / (m2i * m2i);
  // Gradiente geométrico infinito: 150.000, 11,35 % EA, g = 0,72 %
  const ge1 = 150000 / (mi - 0.0072);
  const ge2 = 284000 / (m2i - 0.011);
  // Ejemplo de error de clase
  const okVP = 1000 / (0.03 - 0.015);
  const malVP = 1000 / (0.015 - 0.03);

  // Reto: 2.500.000 bimestrales, 12,35 % EA, gradiente geométrico 0,65 % cada 4 meses
  const rb = c3Tasa(0.1235, 2);
  const rc = c3Tasa(0.1235, 4);
  const rBloque = 2500000 * (1 + rb) + 2500000;
  const rVP = rBloque / (rc - 0.0065);
  let rCheck = 0;
  for (let k = 1; k <= 3000; k++) {
    const A = 2500000 * Math.pow(1.0065, k - 1);
    rCheck += A / Math.pow(1 + rb, 2 * k - 1) + A / Math.pow(1 + rb, 2 * k);
  }
  // Si el gradiente fuera cada bimestre (sin decir cada cuánto): misma regla que la cuota
  const rMal = 2500000 / (rb - 0.0065);

  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco titulo="🧸 Nivel 5 años">
        {`Imagina un árbol mágico que te regala una manzana todos los meses, para siempre. Nunca se acaba.

Alguien te pregunta: "¿cuánto pagarías HOY por ese árbol?". ¿Infinito? No. Porque una manzana que te van a dar dentro de 50 años hoy casi no vale nada: es como una manzana que de aquí a que llegue ya se volvió una semillita.

Las manzanas cercanas valen mucho hoy. Las lejanas valen casi nada. Cuando juntas todas las manzanas encogidas, ¡la suma es un número normal, no infinito!

Y hay una forma fácil de comprobarlo: si pones una cantidad de plata en una alcancía que paga intereses, cada mes los intereses te los puedes gastar y la plata de la alcancía sigue intacta. Ese pago "para siempre" sale solo de los intereses.

Eso es una PERPETUIDAD: una anualidad que nunca termina.`}
      </NivelCinco>

      <ConexionesPrevias items={[
        "Una perpetuidad es una anualidad que nunca termina: es la anualidad con n tan grande que ya no tiene final.",
        "Su valor presente sale de la fórmula del valor presente de una anualidad cuando n crece sin límite.",
        "El interés compuesto es lo que 'encoge' los pagos lejanos: cada pago se divide por (1 + i)^t.",
        "La tasa que entra es la efectiva vencida del periodo de la cuota, obtenida con la conversión de tasas. Si la cuota es cuatrimestral, la tasa debe ser cuatrimestral.",
        "Con gradiente (aritmético o geométrico) usamos lo que vimos en gradientes, pero con infinitas cuotas.",
      ]} />

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · Una anualidad que nunca termina" defaultOpen>
        <p><strong>¿Qué es?</strong> Una perpetuidad es una serie de cuotas que <strong>no termina</strong>: son tantos pagos que se asume que los flujos de dinero van hasta el infinito.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Una anualidad es una fila de galletas con un final. Una perpetuidad es una fila de galletas que nunca se acaba: siempre llega otra.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué importa?</strong> Porque así se valoran cosas que duran muy, muy largo plazo: un negocio, una inversión que reparte rendimientos o un fondo que da becas para siempre.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "10px 0 6px" }}>Ejemplos reales en Colombia</div>
        <FilaMini>
          <TarjetaMini titulo="Un local que genera arriendo">Te pagan arriendo todos los meses y el local sigue ahí. Mientras exista, sigue pagando.</TarjetaMini>
          <TarjetaMini titulo="Un fondo de dotación">Una universidad recibe una donación y con los rendimientos paga becas cada semestre, sin gastar el capital.</TarjetaMini>
          <TarjetaMini titulo="Una inversión que reparte rendimientos">Una inversión que paga una renta periódica de forma indefinida.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Diferencia con la anualidad" tono="azul">
          La anualidad tiene n cuotas (un número conocido). La perpetuidad no tiene n: no hay última cuota. Por eso no se puede pedir "cuánto pagas en total": siempre sería infinito. Solo tiene sentido preguntar cuánto vale hoy.
        </TarjetaMini>
        <Interpretacion>
          Una perpetuidad es una anualidad con n que crece sin parar. Todo lo que sabías de anualidades vencidas (cuota al final de cada periodo, tasa del periodo de la cuota) sigue valiendo.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · ¿Cómo puede valer algo finito una serie infinita de pagos?">
        <p>Esto es contraintuitivo, así que vamos despacio.</p>
        <TarjetaMini titulo="La pregunta" tono="azul">
          Imagina que tienes un local que te paga COP 1.000.000 de arriendo cada mes, para siempre. ¿Cuánto vale hoy? No vale infinito.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Primera razón: el dinero lejano se encoge.</strong> Con interés compuesto, un millón que vas a recibir más adelante vale cada vez menos hoy. Con una tasa de 1 % efectivo mensual:</p>
        <TablaC3
          cols={["Cuándo llega el millón", "Cuánto vale hoy"]}
          filas={encoge.map((e) => [
            e.t === 1 ? "En 1 mes" : e.t === 12 ? "En 1 año (mes 12)" : e.t === 120 ? "En 10 años (mes 120)" : e.t === 600 ? "En 50 años (mes 600)" : "En 100 años (mes 1.200)",
            `COP ${m2(e.v)}`,
          ])}
        />
        <p>El millón que llega dentro de 50 años hoy vale unos pocos pesos: el interés compuesto lo encoge hasta volverlo una moneda. Entonces los pagos lejanos casi no suman, y la suma total deja de crecer.</p>
        <p style={{ marginTop: 12 }}><strong>Segunda razón: se va acercando a un tope.</strong> Si sumamos el valor de hoy de cada vez más cuotas, el resultado se va acercando a un número y no pasa de ahí:</p>
        <TablaC3
          cols={["Número de pagos (n)", "Valor presente de n pagos de 1.000.000", "Tope (A / i)"]}
          filas={anual.map((a) => [a.n, `COP ${m2(a.v)}`, `COP ${m2(pVP)}`])}
        />
        <p><strong>Tercera razón: la prueba de la alcancía.</strong> Si pones COP {m2(pVP)} al 1 % mensual, cada mes te pagan COP {m2(pVP * pi)} de intereses, y el capital nunca se gasta. Ese es exactamente el pago de la perpetuidad. Por eso la perpetuidad vale COP {m2(pVP)} hoy: es la plata que necesitas para que los intereses te paguen el millón para siempre.</p>
        <Interpretacion>
          Una serie infinita de pagos tiene valor presente finito porque cada pago vale menos hoy que el anterior y los pagos lejanos valen casi nada. El tope es COP {m2(pVP)}.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · La fórmula del valor presente de una perpetuidad">
        <p><strong>¿Cómo funciona?</strong> Partimos de la fórmula del valor presente de una anualidad y dejamos que n sea enorme.</p>
        <BloqueFormula>VP = A × [ (1 − (1 + i)^−n) / i ]</BloqueFormula>
        <p>Cuando n crece sin parar, (1 + i)^−n se hace casi cero (es el pago lejano que se encoge). Entonces el paréntesis se queda en (1 − 0) / i:</p>
        <BloqueFormula>VP = A / i</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="VP">El valor de hoy de todos los pagos de la perpetuidad.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota: lo que se paga en cada periodo.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo de la cuota, en decimal (1 % = 0,01).</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es la alcancía al revés: si la cuota es lo que da de intereses cada periodo, la alcancía debe tener VP tal que VP × i = A. Despejando: VP = A / i.
        </TarjetaMini>
        <TarjetaMini titulo="Dos condiciones" tono="alerta">
          1) La tasa debe ser del mismo periodo que la cuota (cuota cuatrimestral, tasa cuatrimestral). 2) La primera cuota cae al final del primer periodo (vencida). Si el primer pago fuera hoy, se le suma A al resultado.
        </TarjetaMini>
        <Interpretacion>
          A mayor tasa, menor valor presente (la alcancía necesita menos plata para generar la misma cuota). Y a mayor cuota, mayor valor presente.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Ejemplos resueltos de perpetuidades">
        <SubT>Ejemplo 1 · El local de arriendo</SubT>
        <p>Un local te paga COP 1.000.000 al mes para siempre. La tasa es 1 % efectivo mensual. ¿Cuánto vale hoy?</p>
        <FichaProcedimiento pasos={[
          { label: "Datos", content: "A = 1.000.000 · i = 1 % efectivo mensual = 0,01" },
          { label: "Fórmula", content: "VP = A / i" },
          { label: "Sustitución", content: "VP = 1.000.000 / 0,01" },
          { label: "Resultado", content: `VP = COP ${m2(pVP)}` },
          { label: "Comprobación", content: `${m2(pVP)} × 0,01 = ${m2(pVP * pi)} de intereses cada mes, y el capital nunca se gasta` },
        ]} />
        <SubT>Ejemplo 2 · Perpetuidad cuatrimestral (de la clase)</SubT>
        <p>Una perpetuidad de COP 150.000 se paga cada cuatrimestre (cada 4 meses). La tasa es 11,35 % EA. ¿Cuál es su valor presente?</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Datos", content: "A = 150.000 cada cuatrimestre · tasa = 11,35 % EA" },
          { label: "Paso 2 — Tasa al idioma de la cuota", content: `Cuatrimestre = 4 meses, o sea 3 por año. i = (1 + 0,1135)^(4/12) − 1 = ${m8(c1i)}` },
          { label: "Paso 3 — Fórmula", content: "VP = A / i" },
          { label: "Paso 4 — Sustitución", content: `VP = 150.000 / ${m8(c1i)}` },
          { label: "Resultado", content: `VP = COP ${m2(c1)}` },
        ]} />
        <SubT>Ejemplo 3 · Perpetuidad semestral (ahora tú, resuelta)</SubT>
        <p>Una perpetuidad de COP 345.000 se paga cada semestre. La tasa es 19,98 % EA.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa semestral efectiva", content: `i = (1 + 0,1998)^(6/12) − 1 = ${m8(c2i)}` },
          { label: "Paso 2 — Fórmula y sustitución", content: `VP = 345.000 / ${m8(c2i)}` },
          { label: "Resultado", content: `VP = COP ${m2(c2)}` },
        ]} />
        <Interpretacion>
          Para recibir COP 150.000 cada cuatrimestre para siempre hoy necesitarías COP {m2(c1)}. Para COP 345.000 cada semestre, COP {m2(c2)}. Mira que lo importante no es solo la cuota: la tasa convertida al periodo correcto es la que decide el resultado.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · ¿Por qué una perpetuidad no tiene valor futuro?">
        <p>El valor futuro lleva todos los pagos hasta el <strong>final</strong>. Pero una perpetuidad no tiene final.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como preguntar "¿cuántas galletas habrá en la mesa al terminar la fila?" si la fila nunca termina. No hay "al terminar".
        </TarjetaMini>
        <p style={{ marginTop: 12 }}>Además, cada pago llevado al futuro se multiplica por (1 + i)^algo, y hay infinitos pagos, así que el resultado sería infinito. Por eso, de las perpetuidades solo calculamos el <strong>valor presente</strong>.</p>
        <FilaMini>
          <TarjetaMini titulo="Valor presente" tono="azul">Sí se puede: los pagos lejanos se encogen y la suma tiene tope.</TarjetaMini>
          <TarjetaMini titulo="Valor futuro" tono="alerta">No se puede: no hay un momento final al cual llevar los pagos.</TarjetaMini>
        </FilaMini>
        <Interpretacion>
          Si un ejercicio de perpetuidades te pide valor futuro, la respuesta es que no existe (o es infinito). Solo se calcula el VP.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Perpetuidad con gradiente aritmético">
        <p><strong>¿Qué es?</strong> Una perpetuidad donde cada pago sube (o baja) un mismo valor en pesos, para siempre.</p>
        <BloqueFormula>VP = A / i + L / i²</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="VP">Valor de hoy de la perpetuidad con gradiente.</TarjetaMini>
          <TarjetaMini titulo="A">El primer pago.</TarjetaMini>
          <TarjetaMini titulo="L">El gradiente aritmético: los pesos que sube cada periodo (si baja, es negativo).</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo de la cuota.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Son dos perpetuidades juntas: la perpetuidad "plana" de la cuota A (que vale A / i) y la perpetuidad de los escalones, que crecen sin parar y valen L / i².
        </TarjetaMini>
        <SubT>Ejemplo (de la clase)</SubT>
        <p>Una perpetuidad de COP 150.000 mensuales, con tasa 11,35 % EA y gradiente aritmético de COP 5.000. ¿Cuál es su valor presente?</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual efectiva", content: `i = (1 + 0,1135)^(1/12) − 1 = ${m8(mi)}` },
          { label: "Paso 2 — Parte plana", content: `A / i = 150.000 / ${m8(mi)} = ${m2(150000 / mi)}` },
          { label: "Paso 3 — Parte de los escalones", content: `L / i² = 5.000 / (${m8(mi)})² = ${m2(5000 / (mi * mi))}` },
          { label: "Paso 4 — Sumar", content: `VP = COP ${m2(ar1)}` },
        ]} />
        <SubT>Ahora tú (resuelto)</SubT>
        <p>Perpetuidad mensual de COP 284.000, tasa 19,54 % EA, gradiente aritmético de COP 18.000.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual efectiva", content: `i = (1 + 0,1954)^(1/12) − 1 = ${m8(m2i)}` },
          { label: "Paso 2 — Parte plana", content: `284.000 / ${m8(m2i)} = ${m2(284000 / m2i)}` },
          { label: "Paso 3 — Parte de los escalones", content: `18.000 / (${m8(m2i)})² = ${m2(18000 / (m2i * m2i))}` },
          { label: "Resultado", content: `VP = COP ${m2(ar2)}` },
        ]} />
        <Interpretacion>
          En el primer ejemplo, el gradiente de apenas COP 5.000 aporta COP {m2(5000 / (mi * mi))} de los COP {m2(ar1)}: como los escalones nunca paran, aunque sean pequeños, pesan muchísimo. No hay restricción entre L y i en el aritmético, porque L está dividido entre i².
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Perpetuidad con gradiente geométrico: ¿por qué i tiene que ser mayor que g?">
        <p><strong>¿Qué es?</strong> Una perpetuidad donde cada pago sube un mismo porcentaje, para siempre.</p>
        <BloqueFormula>VP = A / (i − g)</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="VP">Valor de hoy.</TarjetaMini>
          <TarjetaMini titulo="A">El primer pago.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo de la cuota.</TarjetaMini>
          <TarjetaMini titulo="g">El gradiente geométrico (el porcentaje que sube cada periodo), en el mismo periodo que i.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="La regla: la tasa i debe ser MAYOR que g" tono="alerta">
          Cada pago crece un g %, pero al traerlo a hoy se encoge un i %. Si i es mayor que g, el encogimiento le gana al crecimiento: cada pago vale menos hoy que el anterior y la suma tiene tope. Si g es mayor o igual que i, el crecimiento le gana al encogimiento: cada pago vale MÁS hoy que el anterior, la suma no tiene tope y la fórmula no tiene sentido.
        </TarjetaMini>
        <SubT>El error común, con números</SubT>
        <FilaMini>
          <TarjetaMini titulo="Procedimiento correcto" tono="azul">A = 1.000 · i = 3 % · g = 1,5 % → VP = 1.000 / (3 % − 1,5 %) = {m2(okVP)}</TarjetaMini>
          <TarjetaMini titulo="Error común" tono="alerta">A = 1.000 · i = 1,5 % · g = 3 % → 1.000 / (1,5 % − 3 %) = {m2(malVP)}. ¡Un valor negativo! Una perpetuidad que paga dinero no puede valer menos que cero.</TarjetaMini>
        </FilaMini>
        <SubT>Ejemplo (de la clase)</SubT>
        <p>Perpetuidad mensual de COP 150.000, tasa 11,35 % EA, gradiente geométrico de 0,72 % mensual.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual efectiva", content: `i = (1 + 0,1135)^(1/12) − 1 = ${m8(mi)} (${formatMilesCO(mi * 100, 6)} %)` },
          { label: "Paso 2 — Revisar la regla", content: `g = 0,72 % = 0,0072 es menor que i = ${m8(mi)}. Sí se puede usar la fórmula.` },
          { label: "Paso 3 — Fórmula", content: "VP = A / (i − g)" },
          { label: "Paso 4 — Sustitución", content: `VP = 150.000 / (${m8(mi)} − 0,0072)` },
          { label: "Resultado", content: `VP = COP ${m2(ge1)}` },
        ]} />
        <SubT>Ahora tú (resuelto)</SubT>
        <p>Perpetuidad mensual de COP 284.000, tasa 19,54 % EA, gradiente geométrico de 1,1 %.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual efectiva", content: `i = ${m8(m2i)} (${formatMilesCO(m2i * 100, 6)} %)` },
          { label: "Paso 2 — Revisar la regla", content: "g = 1,1 % = 0,011 es menor que i. Sí se puede." },
          { label: "Resultado", content: `VP = 284.000 / (${m8(m2i)} − 0,011) = COP ${m2(ge2)}` },
        ]} />
        <Interpretacion>
          Fíjate lo sensible que es la fórmula: cuando g se acerca a i, el denominador se hace muy pequeño y el valor presente se dispara. Con i = {formatMilesCO(m2i * 100, 4)} % y g = 1,1 %, el denominador es de solo {formatMilesCO((m2i - 0.011) * 100, 4)} % y el VP es COP {m2(ge2)}.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Reto: el gradiente se aplica cada 4 meses y la cuota es bimestral">
        <p>Tienes una inversión que paga una perpetuidad bimestral de COP 2.500.000. Te pagan 12,35 % EA. Tiene un gradiente geométrico que se aplica <strong>cada 4 meses</strong> de 0,65 %. ¿Cuál es el valor presente?</p>
        <TarjetaMini titulo="La idea" tono="azul">
          La cuota es cada 2 meses, pero el aumento ocurre cada 4 meses. Entonces dos cuotas seguidas valen lo mismo y luego saltan: el aumento cae cada 2 cuotas. Agrupamos las cuotas de a dos y las tratamos como una sola cuota cuatrimestral equivalente.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasas que necesitamos", content: `Bimestral: ib = (1 + 0,1235)^(2/12) − 1 = ${m8(rb)} · Cuatrimestral (4 meses): ic = (1 + 0,1235)^(4/12) − 1 = ${m8(rc)}` },
          { label: "Paso 2 — Agrupar dos pagos (meses 2 y 4)", content: `Al mes 4: 2.500.000 × (1 + ib) + 2.500.000 = ${m2(rBloque)}. Esta es la cuota cuatrimestral equivalente.` },
          { label: "Paso 3 — Revisar la regla", content: `g = 0,65 % = 0,0065 es menor que ic = ${m8(rc)}. Sí se puede.` },
          { label: "Paso 4 — Fórmula", content: "VP = A_equivalente / (ic − g)" },
          { label: "Paso 5 — Sustitución", content: `VP = ${m2(rBloque)} / (${m8(rc)} − 0,0065)` },
          { label: "Resultado", content: `VP = COP ${m2(rVP)}` },
          { label: "Comprobación", content: `Sumando uno por uno los primeros 6.000 pagos bimestrales se obtiene COP ${m2(rCheck)}` },
        ]} />
        <TarjetaMini titulo="Qué pasa si no lees bien el enunciado" tono="alerta">
          Si se ignorara el "cada 4 meses" y se aplicara el 0,65 % en cada bimestre: VP = 2.500.000 / (ib − 0,0065) = COP {m2(rMal)}. Es otra respuesta: la frecuencia del gradiente cambia el resultado.
        </TarjetaMini>
        <Interpretacion>
          El valor presente es COP {m2(rVP)}. Regla para recordar: si el ejercicio no dice cada cuánto cambia el gradiente, cambia al ritmo de la cuota; si lo dice, hay que agrupar las cuotas para que el gradiente y la tasa hablen el mismo idioma.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Perpetuidad vs anualidad: lo que cambia y lo que no">
        <TablaC3
          cols={["Característica", "Anualidad", "Perpetuidad"]}
          filas={[
            ["Número de cuotas", "n, un número conocido", "Infinito"],
            ["Valor presente", "A × [(1 − (1 + i)^−n) / i]", "A / i"],
            ["Valor futuro", "Sí existe", "No existe"],
            ["Tasa que se usa", "Efectiva vencida del periodo de la cuota", "La misma"],
            ["Con gradiente aritmético", "Se suma cuota por cuota", "VP = A / i + L / i²"],
            ["Con gradiente geométrico", "Se suma cuota por cuota", "VP = A / (i − g), con i mayor que g"],
          ]}
        />
        <Interpretacion>
          Una perpetuidad es una anualidad que nunca termina: su valor presente es el "tope" al que se acercan las anualidades cuando n es muy grande (ejemplo: 100 años de cuotas de un millón al 1 % mensual valen COP {m2(pA * c3FactorVP(pi, 1200))}, casi lo mismo que la perpetuidad de COP {m2(pVP)}).
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Errores comunes">
        <FilaMini>
          <TarjetaMini titulo="Pedir valor futuro" tono="alerta">Una perpetuidad no tiene valor futuro.</TarjetaMini>
          <TarjetaMini titulo="Tasa del periodo equivocado" tono="alerta">Si la cuota es mensual, i debe ser mensual (y g también). Convierte la tasa antes.</TarjetaMini>
          <TarjetaMini titulo="g mayor o igual que i" tono="alerta">En la perpetuidad geométrica la fórmula solo sirve si i es mayor que g.</TarjetaMini>
          <TarjetaMini titulo="Mezclar L con g" tono="alerta">L (pesos) va con i². g (porcentaje) va restando a i.</TarjetaMini>
          <TarjetaMini titulo="Redondear la tasa muy pronto" tono="alerta">Con perpetuidades un cambio pequeño en i cambia mucho el resultado. Guarda al menos 6 decimales.</TarjetaMini>
        </FilaMini>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Cierre y preguntas de repaso">
        <CierreRepaso
          intro="Antes de seguir, intenta responder sin mirar los apuntes:"
          preguntas={[
            "¿Cuál es la característica de una perpetuidad?",
            "¿Por qué una serie infinita de pagos tiene un valor presente finito?",
            "¿Por qué una perpetuidad no tiene valor futuro?",
            "¿Las perpetuidades pueden tener gradientes? ¿Cuáles fórmulas se usan?",
            "¿Qué restricción tienen las perpetuidades geométricas y por qué?",
          ]}
          respuestas={[
            "Los pagos no terminan: se suponen infinitos. Es una anualidad que nunca termina.",
            "Porque con interés compuesto cada pago vale menos hoy que el anterior y los pagos lejanos valen casi nada. La suma se acerca a un tope: A / i.",
            "Porque no hay un momento final al cual llevar los pagos; el resultado sería infinito. Solo se calcula el valor presente.",
            "Sí: aritmético, VP = A / i + L / i²; y geométrico, VP = A / (i − g).",
            "La tasa i debe ser mayor que el gradiente g. Si no, cada pago valdría más hoy que el anterior y la suma no tendría tope (o daría un valor negativo sin sentido).",
          ]}
          idea="Idea final: una perpetuidad es una anualidad que nunca termina. Se calcula con la tasa efectiva vencida del periodo de la cuota y solo tiene valor presente."
        />
      </Acordeon>

    </div>
  );
}

/* ============================================================
   SISTEMAS DE AMORTIZACIÓN — módulo educativo (Tercer corte)
   Sigue la presentación de clase "Sistemas de amortización":
   tabla de amortización, francés, alemán, americano, comparación,
   otros costos y costo real, cambios a mitad del crédito y leasing.
   ============================================================ */
function SistemasAmortizacion() {
  // ---------- Tasa del ejemplo: 16,72 % NACA (nominal anual capitalización cuatrimestral anticipada)
  const nac = c3NomAnticipada(0.1672, 4);
  const iMes = c3Tasa(nac.EA, 1);
  const fr = c3Amort({ vp: 1000000, n: 24, sistema: "frances", iDe: () => iMes });
  const al = c3Amort({ vp: 1000000, n: 24, sistema: "aleman", iDe: () => iMes });
  const amSin = c3Amort({ vp: 1000000, n: 24, sistema: "americano", pagaIntereses: false, iDe: () => iMes });
  const amCon = c3Amort({ vp: 1000000, n: 24, sistema: "americano", pagaIntereses: true, iDe: () => iMes });
  const frA = fr.filas[0].cuota;

  // ---------- Tarea francés: 36 cuotas bimestrales, 18.000.000, 13,85 % NASA
  const nT1 = c3NomAnticipada(0.1385, 6);
  const iBim = c3Tasa(nT1.EA, 2);
  const frT = c3Amort({ vp: 18000000, n: 36, sistema: "frances", iDe: () => iBim });

  // ---------- Tarea alemán: 25.000.000, trimestral, 17,13 % NAQA (quintumestral = 5 meses), 9 años, manejo 45.000
  const nT2 = c3NomAnticipada(0.1713, 5);
  const iTri = c3Tasa(nT2.EA, 3);
  const alT = c3Amort({ vp: 25000000, n: 36, sistema: "aleman", otros: 45000, iDe: () => iTri });

  // ---------- Tarea americano: 35.000.000, 18,59 % NASA (septimestral = 7 meses), 48 meses
  const nT3 = c3NomAnticipada(0.1859, 7);
  const iMes3 = c3Tasa(nT3.EA, 1);
  const amT1 = c3Amort({ vp: 35000000, n: 48, sistema: "americano", pagaIntereses: false, iDe: () => iMes3 });
  const amT2 = c3Amort({ vp: 35000000, n: 48, sistema: "americano", pagaIntereses: true, iDe: () => iMes3 });

  // ---------- ¿Cuál crédito es más barato? 1.000.000, 12 meses
  const costoEA = (res, per) => Math.pow(1 + c3TIR(res.flujos), per) - 1;
  const k1i = c3Tasa(0.195, 1), k2i = c3Tasa(0.1687, 1), k3i = c3Tasa(0.183, 1), k4i = c3Tasa(0.1725, 1);
  const k1 = c3Amort({ vp: 1000000, n: 12, sistema: "frances", iDe: () => k1i });
  const k2 = c3Amort({ vp: 1000000, n: 12, sistema: "frances", otros: 45000, iDe: () => k2i });
  const k3 = c3Amort({ vp: 1000000, n: 12, sistema: "aleman", iDe: () => k3i });
  const k4 = c3Amort({ vp: 1000000, n: 12, sistema: "americano", pagaIntereses: false, iDe: () => k4i });
  const k2u = c3Amort({ vp: 1000000, n: 12, sistema: "frances", iDe: () => k2i });
  const k2uEA = Math.pow(1 + c3TIR([1000000 - 45000, ...k2u.flujos.slice(1)]), 12) - 1;

  // ---------- Costo real: ejemplo con cuota de manejo 12.000
  const cm = c3Amort({ vp: 1000000, n: 24, sistema: "frances", otros: 12000, iDe: () => iMes });
  const cmTIR = c3TIR(cm.flujos);
  const cmEA = Math.pow(1 + cmTIR, 12) - 1;

  // ---------- Compra de cartera: 2.800.000, 36 cuotas, 22,89 % EA; desde la cuota 16, 21,31 % EA
  const xi = c3Tasa(0.2289, 1), yi = c3Tasa(0.2131, 1);
  const sinCambio = c3Amort({ vp: 2800000, n: 36, sistema: "frances", iDe: () => xi });
  const conCambio = c3Amort({ vp: 2800000, n: 36, sistema: "frances", iDe: (t) => (t >= 16 ? yi : xi) });
  // Tarea: 45.000.000, alemán, 10 años, 19,66 % EA y desde el periodo 61, 18,12 % EA
  const zx = c3Tasa(0.1966, 1), zy = c3Tasa(0.1812, 1);
  const zSin = c3Amort({ vp: 45000000, n: 120, sistema: "aleman", iDe: () => zx });
  const zCon = c3Amort({ vp: 45000000, n: 120, sistema: "aleman", iDe: (t) => (t >= 61 ? zy : zx) });

  // ---------- Abono extraordinario a capital
  const ab0 = c3Amort({ vp: 2800000, n: 36, sistema: "frances", iDe: () => xi });
  const ab1 = c3Amort({ vp: 2800000, n: 36, sistema: "frances", iDe: () => xi, abonos: { 14: 500000 } });
  const bi = c3Tasa(0.1945, 1);
  const bb0 = c3Amort({ vp: 45000000, n: 120, sistema: "frances", iDe: () => bi });
  const bb1 = c3Amort({ vp: 45000000, n: 120, sistema: "frances", iDe: () => bi, abonos: { 32: 10000000 } });

  // ---------- Periodo de gracia al inicio
  const gi = c3Tasa(0.1356, 1);
  const gr1 = c3Amort({ vp: 560000000, n: 264, sistema: "frances", gracia: 24, graciaPaga: false, iDe: () => gi });
  const saldoGracia = 560000000 * Math.pow(1 + gi, 24);
  const pi2 = c3Tasa(0.1176, 1);
  const gr2 = c3Amort({ vp: 1270000000, n: 360, sistema: "frances", gracia: 60, graciaPaga: true, iDe: () => pi2 });

  // ---------- Leasing financiero: oficina 850.000.000, 11,23 % EA, 15 años, opción de compra 10 %
  const li = c3Tasa(0.1123, 1);
  const lea = c3Amort({ vp: 850000000, n: 180, sistema: "frances", vf: 85000000, iDe: () => li });
  const leaSin = c3Pago(li, 180, 850000000);

  const interesOrden = [
    ["Alemán", al], ["Francés", fr], ["Americano pagando intereses", amCon], ["Americano sin pagar intereses", amSin],
  ];

  return (
    <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>

      <NivelCinco titulo="🧸 Nivel 5 años">
        {`Imagina que un amigo te presta 10 dulces y tú se los devuelves poco a poco.

Pero no le devuelves solo los 10 dulces: también le das unos dulces de "gracias" por haberte prestado (esos son los INTERESES). Y a veces hay un cobro extra por usar la cajita donde te los guardó (los OTROS COSTOS, como un seguro).

Cada vez que le pagas, tu pago se parte en tres cajitas:
— Cajita de gracias (interés): es el pago por usar los dulces del amigo.
— Cajita de devolver (abono a capital): son los dulces prestados que de verdad le devuelves.
— Cajita de extras (otros costos): seguros o cuotas de manejo.

AMORTIZAR es ir devolviendo la deuda así, pedacito por pedacito, hasta que no debas nada. La TABLA DE AMORTIZACIÓN es la libreta donde anotas, en cada pago, a qué cajita fue cada peso y cuánto sigues debiendo.

Hay tres formas de devolverlos:
— Francés: pagas SIEMPRE lo mismo.
— Alemán: devuelves SIEMPRE los mismos dulces prestados, pero los de "gracias" van bajando.
— Americano: esperas y devuelves todo al final.`}
      </NivelCinco>

      <ConexionesPrevias items={[
        "La cuota del sistema francés es una anualidad vencida: la misma fórmula que ya conoces.",
        "El interés de cada periodo es interés compuesto: se calcula sobre lo que todavía debes (el saldo).",
        "En todos los casos la tasa que entra al cálculo es la efectiva vencida del periodo de la cuota, obtenida con la conversión de tasas. Si la tasa viene nominal o anticipada, primero se convierte.",
        "El sistema alemán es una serie con gradiente: la cuota baja un valor casi constante cada periodo (un gradiente aritmético decreciente).",
        "Si el crédito tiene un pago final grande (americano, leasing), el saldo final no es cero: se usa el valor futuro dentro de la fórmula de la cuota.",
      ]} />

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · ¿Qué es amortizar y qué es una tabla de amortización?" defaultOpen>
        <p><strong>¿Qué es?</strong> Amortizar es la forma en la que se paga una deuda y cómo va disminuyendo con el tiempo. La <strong>tabla de amortización</strong> muestra, en cada pago, a dónde va cada peso de la cuota y cuánto se debe después de pagar.</p>
        <FilaMini>
          <TarjetaMini titulo="Cuota" tono="azul">Lo que pagas cada periodo. Incluye interés + abono a capital + otros costos (seguros, cuota de manejo, costos adicionales).</TarjetaMini>
          <TarjetaMini titulo="Interés" tono="azul">El costo de usar la plata prestada. Se calcula como saldo del periodo anterior × tasa de interés del periodo.</TarjetaMini>
          <TarjetaMini titulo="Abono a capital" tono="azul">La parte de la cuota que de verdad baja la deuda. Es cuota − interés − otros.</TarjetaMini>
          <TarjetaMini titulo="Saldo" tono="azul">Cuánto se debe después de pagar: saldo anterior − abono a capital.</TarjetaMini>
        </FilaMini>
        <p><strong>¿Por qué importa?</strong> Porque dos créditos con la misma cuota pueden costar muy diferente. La tabla te muestra cuánto de tu plata paga la deuda y cuánto se va en intereses.</p>
        <TablaC3
          cols={["No.", "Cuota / Anualidad", "Interés", "Otros", "Abono a capital", "Saldo"]}
          filas={[
            ["0", "", "", "", "", "Valor presente"],
            ["1", "PAGO(i; n; −VP) + Otros", "Saldo anterior × i", "X", "Cuota − interés − otros", "Saldo anterior − abono"],
          ]}
          alto={200}
        />
        <TarjetaMini titulo="El saldo final debe ser 0" tono="azul">
          En la mayoría de los créditos, el saldo final es 0: el crédito se terminó de pagar. Si no es 0, algo está mal (a menos que sea un crédito con pago final, como el leasing).
        </TarjetaMini>
        <Interpretacion>
          Sea cual sea el sistema, todas las tablas tienen las mismas columnas y las mismas reglas: interés = saldo anterior × i, y saldo nuevo = saldo anterior − abono. Lo único que cambia entre sistemas es cómo se decide la cuota o el abono.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · Los tres sistemas de un vistazo">
        <FilaMini>
          <TarjetaMini titulo="Francés (cuota fija)" tono="azul">Todas las cuotas son iguales. Al inicio pagas más interés y al final más capital.</TarjetaMini>
          <TarjetaMini titulo="Alemán (abono fijo)" tono="azul">El abono a capital es igual en todos los periodos y la cuota disminuye con el tiempo.</TarjetaMini>
          <TarjetaMini titulo="Americano (periodo de gracia o balloon payment)" tono="azul">Las cuotas no se pagan (o se pagan solo los intereses) y al final se paga el crédito.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Los tres nombres del americano" tono="azul">
          Periodo de gracia, balloon payment y método americano se refieren al mismo tipo de amortización. Tiene dos variantes: sin pago de intereses y con pago de intereses.
        </TarjetaMini>
        <Interpretacion>
          Francés = cuotas iguales. Alemán = abonos iguales. Americano = todo el capital al final. Con la misma tasa, el que devuelve capital más rápido paga menos intereses en total.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · Sistema francés: la cuota fija">
        <p><strong>¿Qué es?</strong> En el método francés los pagos periódicos son iguales; es decir, son anualidades. Como la cuota no cambia, al principio casi todo es interés y al final casi todo es capital.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como pagar siempre el mismo precio por una fila de galletas, pero al principio casi todo el precio es "gracias" y al final casi todo es devolver la galleta prestada.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Cómo funciona?</strong> Se calcula la cuota con la fórmula de anualidades (la que despeja A desde el valor presente) y luego se arma la tabla.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula</div>
        <BloqueFormula>A = VP / [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <p style={{ fontFamily: F_MONO, fontSize: 13.5 }}>Excel: =PAGO(i; n; −VP) [en inglés =PMT]. Con el signo "$" se fijan las celdas para que no se muevan al copiar.</p>
        <FilaMini>
          <TarjetaMini titulo="A">La cuota fija (anualidad).</TarjetaMini>
          <TarjetaMini titulo="VP">El valor del crédito.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo de la cuota.</TarjetaMini>
          <TarjetaMini titulo="n">El número de cuotas.</TarjetaMini>
        </FilaMini>
        <SubT>Ejemplo resuelto (de la clase)</SubT>
        <p>Un crédito por COP 1.000.000 se paga en 24 cuotas mensuales. La tasa es 16,72 % NACA (nominal anual, capitalización cuatrimestral anticipada). Construye la tabla por el sistema francés.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Idioma de la tasa", content: "16,72 % NACA: nominal, capitalización cada cuatrimestre (4 meses), anticipada. Las cuotas son mensuales, así que hay que llegar a una tasa efectiva mensual vencida." },
          { label: "Paso 2 — Repartir la nominal", content: `Un año tiene ${formatMilesCO(nac.m, 0)} cuatrimestres: 16,72 % / 3 = ${formatMilesCO(nac.ia * 100, 6)} % efectiva cuatrimestral anticipada` },
          { label: "Paso 3 — Anticipada a vencida", content: `iv = ia / (1 − ia) = ${m8(nac.ia)} / (1 − ${m8(nac.ia)}) = ${m8(nac.iv)} (${formatMilesCO(nac.iv * 100, 6)} % cuatrimestral vencida)` },
          { label: "Paso 4 — Cuatrimestral a mensual", content: `i = (1 + ${m8(nac.iv)})^(1/4) − 1 = ${m8(iMes)} (${formatMilesCO(iMes * 100, 6)} % mensual vencida)` },
          { label: "Paso 5 — Datos", content: `VP = 1.000.000 · i = ${m8(iMes)} · n = 24` },
          { label: "Paso 6 — Factor de anualidad", content: `[(1 + i)^24 − 1] / [i × (1 + i)^24] = ${m6(c3FactorVP(iMes, 24))}` },
          { label: "Paso 7 — Cuota", content: `A = 1.000.000 / ${m6(c3FactorVP(iMes, 24))} = COP ${m2(frA)}` },
          { label: "Paso 8 — Primera fila de la tabla", content: `Interés = 1.000.000 × ${m8(iMes)} = ${m2(fr.filas[0].interes)} · Abono = ${m2(frA)} − ${m2(fr.filas[0].interes)} = ${m2(fr.filas[0].abono)} · Saldo = ${m2(fr.filas[0].saldo)}` },
          { label: "Paso 9 — Comprobar", content: `Saldo final = ${m2(Math.abs(fr.filas[23].saldo) < 0.005 ? 0 : fr.filas[23].saldo)}` },
        ]} />
        <Acordeon title="Ver la tabla de amortización completa (24 cuotas)">
          <TablaAmort res={fr} />
        </Acordeon>
        <Interpretacion>
          La cuota es de COP {m2(frA)} todos los meses. En la cuota 1, COP {m2(fr.filas[0].interes)} son interés y COP {m2(fr.filas[0].abono)} bajan la deuda; en la cuota 24, solo COP {m2(fr.filas[23].interes)} son interés y COP {m2(fr.filas[23].abono)} bajan la deuda. En total pagas COP {m2(fr.totPag)}, de los cuales COP {m2(fr.totInt)} son intereses.
        </Interpretacion>
        <SubT>Ahora tú (resuelto)</SubT>
        <p>Un crédito de COP 18.000.000 se paga en 36 cuotas bimestrales con una tasa de 13,85 % NASA (nominal anual, capitalización semestral anticipada).</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Repartir la nominal", content: `13,85 % / 2 = ${formatMilesCO(nT1.ia * 100, 6)} % semestral anticipada` },
          { label: "Paso 2 — A vencida", content: `iv = ia / (1 − ia) = ${m8(nT1.iv)} (semestral vencida)` },
          { label: "Paso 3 — A bimestral", content: `i = (1 + ${m8(nT1.iv)})^(2/6) − 1 = ${m8(iBim)} (${formatMilesCO(iBim * 100, 6)} % bimestral vencida)` },
          { label: "Paso 4 — Cuota", content: `A = 18.000.000 / [factor de anualidad con i = ${m8(iBim)}, n = 36] = COP ${m2(frT.filas[0].cuota)}` },
          { label: "Total de intereses", content: `COP ${m2(frT.totInt)} · Saldo final: 0` },
        ]} />
        <Acordeon title="Ver las primeras y últimas filas de la tabla">
          <TablaAmort res={frT} ts={[1, 2, 3, 34, 35, 36]} />
        </Acordeon>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Sistema alemán: el abono fijo a capital">
        <p><strong>¿Qué es?</strong> En el método alemán el abono a capital es el mismo en todos los periodos. Como el saldo baja, el interés baja, y por eso la cuota va disminuyendo con el tiempo.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Devuelves siempre la misma cantidad de dulces prestados cada vez. Como cada vez debes menos dulces, los "gracias" también bajan, y tu pago total baja.
        </TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmulas</div>
        <BloqueFormula>Abono a capital = Monto del préstamo / Periodos del crédito</BloqueFormula>
        <BloqueFormula>Cuota = Interés + Abono a capital + Otros</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="Abono a capital">Igual en todos los periodos: VP / n.</TarjetaMini>
          <TarjetaMini titulo="Interés">Saldo anterior × i. Baja cada periodo porque el saldo baja.</TarjetaMini>
          <TarjetaMini titulo="Otros">Seguros o cuotas de manejo. Se suman a la cuota por fuera de la fórmula.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Diferencia con el francés" tono="azul">
          En el francés la cuota es fija y el abono crece. En el alemán el abono es fijo y la cuota baja.
        </TarjetaMini>
        <SubT>Ejemplo resuelto (de la clase)</SubT>
        <p>Mismo crédito: COP 1.000.000, 24 cuotas mensuales, 16,72 % NACA, ahora por el sistema alemán.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual", content: `Ya la calculamos: i = ${m8(iMes)} (efectiva mensual vencida)` },
          { label: "Paso 2 — Abono fijo", content: `1.000.000 / 24 = ${m2(al.filas[0].abono)}` },
          { label: "Paso 3 — Cuota 1", content: `Interés = 1.000.000 × ${m8(iMes)} = ${m2(al.filas[0].interes)} · Cuota = ${m2(al.filas[0].interes)} + ${m2(al.filas[0].abono)} = ${m2(al.filas[0].cuota)}` },
          { label: "Paso 4 — Cuota 2", content: `Saldo = ${m2(al.filas[0].saldo)} · Interés = ${m2(al.filas[1].interes)} · Cuota = ${m2(al.filas[1].cuota)}` },
          { label: "Paso 5 — Cuota 24", content: `Interés = ${m2(al.filas[23].interes)} · Cuota = ${m2(al.filas[23].cuota)} · Saldo final = 0` },
        ]} />
        <Acordeon title="Ver la tabla de amortización completa (24 cuotas)">
          <TablaAmort res={al} />
        </Acordeon>
        <Interpretacion>
          La primera cuota es de COP {m2(al.filas[0].cuota)} y la última de COP {m2(al.filas[23].cuota)}. En total pagas COP {m2(al.totPag)}, con COP {m2(al.totInt)} de intereses: menos que en el francés (COP {m2(fr.totInt)}), porque devuelves capital más rápido.
        </Interpretacion>
        <SubT>Ahora tú (resuelto): crédito de COP 25.000.000, cuotas trimestrales, 9 años</SubT>
        <p>Tasa de 17,13 % NAQA (nominal anual, capitalización quintumestral anticipada: cada 5 meses). Costo de manejo periódico de COP 45.000.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — ¿Cuántas cuotas?", content: "9 años = 108 meses; cada cuota es cada 3 meses → n = 36" },
          { label: "Paso 2 — Periodos de capitalización en el año", content: `Quintumestre = 5 meses → ${formatMilesCO(nT2.m, 6)} periodos al año (12 / 5)` },
          { label: "Paso 3 — Repartir la nominal", content: `17,13 % / ${formatMilesCO(nT2.m, 1)} = ${formatMilesCO(nT2.ia * 100, 6)} % efectiva quintumestral anticipada` },
          { label: "Paso 4 — A vencida", content: `iv = ia / (1 − ia) = ${m8(nT2.iv)} (quintumestral vencida)` },
          { label: "Paso 5 — A trimestral", content: `i = (1 + ${m8(nT2.iv)})^(3/5) − 1 = ${m8(iTri)} (${formatMilesCO(iTri * 100, 6)} % trimestral vencida)` },
          { label: "Paso 6 — Abono fijo", content: `25.000.000 / 36 = ${m2(alT.filas[0].abono)}` },
          { label: "Paso 7 — Cuota 1 (con manejo)", content: `Interés = ${m2(alT.filas[0].interes)} · Cuota = ${m2(alT.filas[0].interes)} + ${m2(alT.filas[0].abono)} + 45.000 = ${m2(alT.filas[0].cuota)}` },
          { label: "Paso 8 — Cuota 36", content: `Interés = ${m2(alT.filas[35].interes)} · Cuota = ${m2(alT.filas[35].cuota)}` },
          { label: "Totales", content: `Intereses: ${m2(alT.totInt)} · Cuotas de manejo: ${m2(alT.totOtros)} · Saldo final: 0` },
        ]} />
        <Acordeon title="Ver la tabla (36 cuotas)">
          <TablaAmort res={alT} />
        </Acordeon>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · Sistema americano: periodo de gracia (balloon payment)">
        <p><strong>¿Qué es?</strong> No se paga capital durante casi todo el crédito. Al final se paga todo. Tiene dos variantes:</p>
        <FilaMini>
          <TarjetaMini titulo="Sin pago de intereses" tono="azul">En ningún periodo se paga un valor. En el último se paga el saldo más los intereses acumulados.</TarjetaMini>
          <TarjetaMini titulo="Con pago de intereses" tono="azul">Los intereses se pagan periodo a periodo. El saldo de la deuda se paga hasta el último periodo.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es como pedir los dulces prestados y no devolver nada hasta el último día. En la variante "sin pago", ni siquiera dices "gracias" cada mes: se acumula y al final pagas todo junto.
        </TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmulas</div>
        <BloqueFormula>Sin pago de intereses: pago final = VP × (1 + i)^n</BloqueFormula>
        <BloqueFormula>Con pago de intereses: cuota = VP × i (periodos 1 a n − 1) y último pago = VP × i + VP</BloqueFormula>
        <TarjetaMini titulo="¿Qué implicación tiene no pagar los intereses hasta el final?" tono="alerta">
          Los intereses no pagados se suman a la deuda y empiezan a generar más intereses (interés sobre interés). La deuda crece cada mes en vez de bajar, y el pago final es enorme.
        </TarjetaMini>
        <SubT>Ejemplo resuelto (de la clase)</SubT>
        <p>COP 1.000.000 a 24 meses, 16,72 % NACA, método balloon payment con pago completo en el mes 24. Se hace sin pagar intereses y pagando intereses.</p>
        <FichaProcedimiento pasos={[
          { label: "Tasa mensual", content: `i = ${m8(iMes)} (la misma de antes)` },
          { label: "Sin pago de intereses — pago final", content: `1.000.000 × (1 + ${m8(iMes)})^24 = COP ${m2(amSin.filas[23].cuota)}` },
          { label: "Sin pago de intereses — intereses acumulados", content: `${m2(amSin.filas[23].cuota)} − 1.000.000 = COP ${m2(amSin.totInt)}` },
          { label: "Con pago de intereses — cuota de los meses 1 a 23", content: `1.000.000 × ${m8(iMes)} = COP ${m2(amCon.filas[0].cuota)}` },
          { label: "Con pago de intereses — último pago (mes 24)", content: `${m2(amCon.filas[0].cuota)} + 1.000.000 = COP ${m2(amCon.filas[23].cuota)}` },
          { label: "Con pago de intereses — total de intereses", content: `${m2(amCon.filas[0].cuota)} × 24 = COP ${m2(amCon.totInt)}` },
        ]} />
        <Acordeon title="Ver tablas (sin pago de intereses: meses 1, 2, 3, 22, 23, 24)">
          <TablaAmort res={amSin} ts={[1, 2, 3, 22, 23, 24]} />
        </Acordeon>
        <Acordeon title="Ver tablas (con pago de intereses: meses 1, 2, 3, 22, 23, 24)">
          <TablaAmort res={amCon} ts={[1, 2, 3, 22, 23, 24]} />
        </Acordeon>
        <Interpretacion>
          Sin pagar intereses, la deuda de COP 1.000.000 se convierte en COP {m2(amSin.filas[23].cuota)} al final: pagas COP {m2(amSin.totInt)} de intereses. Pagando los intereses cada mes pagas COP {m2(amCon.totInt)}, un poco menos porque no hay interés sobre interés, pero la deuda sigue entera hasta el último día.
        </Interpretacion>
        <SubT>Ahora tú (resuelto)</SubT>
        <p>Crédito de COP 35.000.000 a 48 meses, 18,59 % NASA (capitalización septimestral anticipada: cada 7 meses), método americano, con y sin pago de intereses.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Periodos al año", content: `Septimestre = 7 meses → ${formatMilesCO(nT3.m, 6)} periodos al año (12 / 7)` },
          { label: "Paso 2 — Repartir la nominal", content: `18,59 % / ${formatMilesCO(nT3.m, 6)} = ${formatMilesCO(nT3.ia * 100, 6)} % septimestral anticipada` },
          { label: "Paso 3 — A vencida", content: `iv = ia / (1 − ia) = ${m8(nT3.iv)} (septimestral vencida)` },
          { label: "Paso 4 — A mensual", content: `i = (1 + ${m8(nT3.iv)})^(1/7) − 1 = ${m8(iMes3)} (${formatMilesCO(iMes3 * 100, 6)} % mensual vencida)` },
          { label: "Sin pago de intereses", content: `Pago final en el mes 48 = 35.000.000 × (1 + i)^48 = COP ${m2(amT1.filas[47].cuota)} · Intereses: COP ${m2(amT1.totInt)}` },
          { label: "Con pago de intereses", content: `Cuota mensual de intereses = COP ${m2(amT2.filas[0].cuota)} · Último pago = COP ${m2(amT2.filas[47].cuota)} · Intereses: COP ${m2(amT2.totInt)}` },
        ]} />
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Comparación: ¿cuál conviene?">
        <p>Comparamos los cuatro con el mismo crédito (COP 1.000.000, 24 meses, misma tasa mensual de {m8(iMes)}).</p>
        <TablaC3
          cols={["Sistema", "Primera cuota", "Última cuota", "Total de intereses", "Total pagado"]}
          filas={[
            ["Francés", m2(fr.filas[0].cuota), m2(fr.filas[23].cuota), m2(fr.totInt), m2(fr.totPag)],
            ["Alemán", m2(al.filas[0].cuota), m2(al.filas[23].cuota), m2(al.totInt), m2(al.totPag)],
            ["Americano con pago de intereses", m2(amCon.filas[0].cuota), m2(amCon.filas[23].cuota), m2(amCon.totInt), m2(amCon.totPag)],
            ["Americano sin pago de intereses", m2(amSin.filas[0].cuota), m2(amSin.filas[23].cuota), m2(amSin.totInt), m2(amSin.totPag)],
          ]}
        />
        <FilaMini>
          <TarjetaMini titulo="¿Quién paga menos intereses en total?" tono="azul">El alemán (COP {m2(al.totInt)}), porque devuelve capital más rápido. Entre francés y alemán, el alemán paga menos intereses en total.</TarjetaMini>
          <TarjetaMini titulo="¿Quién paga más intereses en total?" tono="azul">El americano sin pago de intereses (COP {m2(amSin.totInt)}): la deuda nunca baja y los intereses se acumulan sobre sí mismos.</TarjetaMini>
          <TarjetaMini titulo="¿Quién tiene la primera cuota más baja?" tono="azul">El americano: sin pago de intereses es COP {m2(amSin.filas[0].cuota)} y con pago de intereses, COP {m2(amCon.filas[0].cuota)}. Entre francés y alemán, el francés (COP {m2(fr.filas[0].cuota)}) empieza más bajo que el alemán (COP {m2(al.filas[0].cuota)}).</TarjetaMini>
        </FilaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>¿Cuál conviene según el perfil del cliente?</div>
        <FilaMini>
          <TarjetaMini titulo="Francés">Para quien quiere cuotas iguales y un presupuesto fácil de planear, por ejemplo con ingresos estables (un sueldo fijo).</TarjetaMini>
          <TarjetaMini titulo="Alemán">Para quien puede pagar más al inicio y quiere pagar menos intereses; por ejemplo, una empresa con buen flujo de caja hoy.</TarjetaMini>
          <TarjetaMini titulo="Americano">Para quien espera recibir una plata grande al final (la venta de un bien, una bonificación) y necesita aliviar el flujo de caja ahora. Es el más riesgoso: al final hay que tener toda la plata.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Ojo: pagar menos intereses en total no siempre significa 'más barato'" tono="alerta">
          En el americano debes toda la plata durante todo el tiempo; en el alemán debes cada vez menos. Por eso, para comparar créditos distintos, el costo se mide con la tasa efectiva anual real (sección 7).
        </TarjetaMini>
        <Interpretacion>
          Ordenados de menos a más intereses en total: {interesOrden.map(([nom, r]) => `${nom} (COP ${m2(r.totInt)})`).join(" → ")}.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · ¿Cuál de estos créditos es más barato?">
        <p>Todos son a 12 meses y por COP 1.000.000:</p>
        <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>
          <li>Cuota fija y tasa 19,5 % EA.</li>
          <li>Cuota fija, tasa 16,87 % EA y cuota de manejo de COP 45.000 (la suponemos mensual, como se suman los "otros" en clase).</li>
          <li>Cuota variable (alemán) y tasa 18,3 % EA.</li>
          <li>Periodo de gracia de 11 meses y pago en el último mes, con 17,25 % EA.</li>
        </ol>
        <p><strong>Método:</strong> armamos el flujo de cada crédito (el desembolso positivo y cada cuota negativa), calculamos la TIR (costo efectivo del periodo) y la pasamos a efectivo anual.</p>
        <TablaC3
          cols={["Crédito", "Primera cuota", "Total de intereses + otros", "Costo efectivo anual (TIR)"]}
          filas={[
            ["1 · Francés 19,5 % EA", m2(k1.filas[0].cuota), m2(k1.totInt + k1.totOtros), formatPctMilesCO(costoEA(k1, 12), 2)],
            ["2 · Francés 16,87 % EA + manejo 45.000", m2(k2.filas[0].cuota), m2(k2.totInt + k2.totOtros), formatPctMilesCO(costoEA(k2, 12), 2)],
            ["3 · Alemán 18,3 % EA", m2(k3.filas[0].cuota), m2(k3.totInt + k3.totOtros), formatPctMilesCO(costoEA(k3, 12), 2)],
            ["4 · Gracia sin pago de intereses 17,25 % EA", m2(k4.filas[0].cuota), m2(k4.totInt + k4.totOtros), formatPctMilesCO(costoEA(k4, 12), 2)],
          ]}
        />
        <TarjetaMini titulo="Respuesta" tono="azul">
          Por costo efectivo anual, el más barato es el crédito 4 ({formatPctMilesCO(costoEA(k4, 12), 2)}), después el 3 ({formatPctMilesCO(costoEA(k3, 12), 2)}) y el 1 ({formatPctMilesCO(costoEA(k1, 12), 2)}). El 2 es el más caro: tiene la tasa más baja (16,87 %), pero la cuota de manejo la dispara a {formatPctMilesCO(costoEA(k2, 12), 2)}. Si los COP 45.000 se cobraran una sola vez al desembolso, el costo sería de {formatPctMilesCO(k2uEA, 2)} EA: sigue siendo el más caro.
        </TarjetaMini>
        <Interpretacion>
          Sin costos extra, el costo efectivo anual coincide con la tasa EA del crédito. Los costos extra lo suben. Y el crédito 4 es el de menor costo por peso prestado, aunque sea el que más pesos de intereses suma (COP {m2(k4.totInt)}), porque tienes todo el millón durante los 12 meses.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Otros costos: por qué encarecen el crédito y cómo hallar el costo real">
        <p><strong>¿Qué son?</strong> Los "otros" son costos que no están directamente relacionados con el crédito: cuota de manejo de una tarjeta, costos de emisión, estudio de crédito y seguros.</p>
        <TarjetaMini titulo="Cómo se incluyen en la tabla" tono="azul">
          Se suman a la cuota por fuera de la fórmula de la anualidad, y se restan al calcular el abono a capital: abono = cuota − interés − otros. No bajan la deuda: son plata que sale de tu bolsillo sin pagar capital.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué encarecen el crédito?</strong> Porque recibes la misma plata pero pagas más. Esa diferencia hace que el costo real sea mayor que la tasa que te dijeron.</p>
        <FilaMini>
          <TarjetaMini titulo="Paso 1" tono="azul">Armar la tabla de amortización con la columna "Otros".</TarjetaMini>
          <TarjetaMini titulo="Paso 2" tono="azul">Agregar una columna de flujos de efectivo: el desembolso en positivo y cada cuota (con otros incluidos) en negativo.</TarjetaMini>
          <TarjetaMini titulo="Paso 3" tono="azul">Aplicar =TIR() (en inglés =IRR) a toda la columna: da el costo efectivo del periodo.</TarjetaMini>
          <TarjetaMini titulo="Paso 4" tono="azul">Pasar ese costo a efectivo anual: EA = (1 + TIR)^12 − 1.</TarjetaMini>
        </FilaMini>
        <SubT>Ejemplo resuelto (de la clase)</SubT>
        <p>Crédito de COP 1.000.000, 24 cuotas mensuales, 16,72 % NACA y cuota de manejo de COP 12.000 mensuales. Sistema francés. ¿Cuál es el costo real?</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual vencida", content: `i = ${m8(iMes)} (como en la sección 3)` },
          { label: "Paso 2 — Cuota sin otros", content: `A = COP ${m2(frA)}` },
          { label: "Paso 3 — Cuota con manejo", content: `${m2(frA)} + 12.000 = COP ${m2(cm.filas[0].cuota)}` },
          { label: "Paso 4 — Flujos", content: `Mes 0: +1.000.000 · Meses 1 a 24: −${m2(cm.filas[0].cuota)}` },
          { label: "Paso 5 — TIR (costo mensual real)", content: `TIR = ${m8(cmTIR)} (${formatMilesCO(cmTIR * 100, 6)} % mensual)` },
          { label: "Paso 6 — A efectivo anual", content: `EA = (1 + ${m8(cmTIR)})^12 − 1 = ${formatMilesCO(cmEA * 100, 6)} %` },
          { label: "Comparación", content: `Sin la cuota de manejo, el costo era ${formatPctMilesCO(nac.EA, 2)} EA` },
        ]} />
        <Acordeon title="Ver la tabla (cuotas 1, 2, 3, 22, 23, 24)">
          <TablaAmort res={cm} ts={[1, 2, 3, 22, 23, 24]} />
        </Acordeon>
        <Interpretacion>
          Una cuota de manejo de COP 12.000 sobre un crédito de COP 1.000.000 parece pequeña, pero hace que el costo real pase de {formatPctMilesCO(nac.EA, 2)} EA a {formatPctMilesCO(cmEA, 2)} EA. El costo real es el que debes comparar entre créditos.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Cuando algo cambia en el crédito">
        <p>En la vida real las condiciones no siempre son las mismas durante todo el crédito. Tres cambios comunes: cambio de tasa (compra de cartera), abonos extraordinarios a capital y periodos de gracia al inicio.</p>
        <TarjetaMini titulo="La idea para todos" tono="azul">
          Se arma la tabla normal hasta el momento del cambio. Desde ahí, se vuelve a calcular la cuota con el saldo que quedó, el tiempo que falta y la nueva condición.
        </TarjetaMini>

        <SubT>9.1 · Compra de cartera: cambio de tasa</SubT>
        <p>Es cuando un banco le compra la deuda a otro (le paga todo lo que debes) y te da una tasa mejor. Si el interés baja, la cuota baja.</p>
        <p>Una persona compra COP 2.800.000 a 36 cuotas mensuales con la tarjeta del banco X, a 22,89 % EA. Desde la cuota 16 (incluyéndola), el banco Y le ofrece 21,31 % EA. Sistema francés.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasas mensuales", content: `Banco X: (1 + 0,2289)^(1/12) − 1 = ${m8(xi)} · Banco Y: (1 + 0,2131)^(1/12) − 1 = ${m8(yi)}` },
          { label: "Paso 2 — Cuota con el banco X (cuotas 1 a 15)", content: `A = COP ${m2(conCambio.filas[0].cuota)}` },
          { label: "Paso 3 — Saldo después de pagar la cuota 15", content: `COP ${m2(conCambio.filas[14].saldo)}` },
          { label: "Paso 4 — Cuota con el banco Y (cuotas 16 a 36: 21 cuotas)", content: `A = saldo / [factor con i = ${m8(yi)}, n = 21] = COP ${m2(conCambio.filas[15].cuota)}` },
          { label: "Resultado", content: `La cuota baja de ${m2(conCambio.filas[0].cuota)} a ${m2(conCambio.filas[15].cuota)}` },
          { label: "Ahorro en intereses", content: `Sin cambio: ${m2(sinCambio.totInt)} · Con cambio: ${m2(conCambio.totInt)} · Ahorro: COP ${m2(sinCambio.totInt - conCambio.totInt)}` },
        ]} />
        <Acordeon title="Ver la tabla (36 cuotas)">
          <TablaAmort res={conCambio} />
        </Acordeon>
        <p style={{ marginTop: 10 }}><strong>Ahora tú (resuelto):</strong> máquina de COP 45.000.000, crédito a 10 años en cuotas mensuales por el método alemán, 19,66 % EA, y desde el periodo 61 una compra de cartera al 18,12 % EA.</p>
        <FichaProcedimiento pasos={[
          { label: "Tasas mensuales", content: `19,66 % EA → ${m8(zx)} · 18,12 % EA → ${m8(zy)}` },
          { label: "Abono fijo", content: `45.000.000 / 120 = ${m2(zCon.filas[0].abono)}` },
          { label: "Cuota 1", content: `COP ${m2(zCon.filas[0].cuota)}` },
          { label: "Cuota 60 (con la tasa inicial)", content: `COP ${m2(zCon.filas[59].cuota)}` },
          { label: "Cuota 61 (con la tasa nueva)", content: `COP ${m2(zCon.filas[60].cuota)}` },
          { label: "Cuota 120", content: `COP ${m2(zCon.filas[119].cuota)}` },
          { label: "Ahorro en intereses", content: `Sin cambio: ${m2(zSin.totInt)} · Con cambio: ${m2(zCon.totInt)} · Ahorro: COP ${m2(zSin.totInt - zCon.totInt)}` },
        ]} />

        <SubT>9.2 · Abono extraordinario a capital</SubT>
        <p>Si pagas un valor adicional a la cuota (de forma esporádica o en cada cuota), bajas la deuda y pagas menos intereses. Tiene dos efectos: <strong>reducir la cuota</strong> o <strong>reducir el tiempo</strong>. En estos ejemplos mantenemos el plazo igual, así que baja la cuota.</p>
        <p>Compra de COP 2.800.000 a 36 cuotas mensuales, 22,89 % EA. Hace un abono de COP 500.000 en el periodo 14.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Cuota original", content: `A = COP ${m2(ab0.filas[0].cuota)} (i = ${m8(xi)}, n = 36)` },
          { label: "Paso 2 — Saldo después de pagar la cuota 14 (sin abono)", content: `COP ${m2(ab0.filas[13].saldo)}` },
          { label: "Paso 3 — Restar el abono extra", content: `${m2(ab0.filas[13].saldo)} − 500.000 = COP ${m2(ab1.filas[13].saldo)}` },
          { label: "Paso 4 — Cuotas que faltan", content: "36 − 14 = 22 cuotas (el plazo se mantiene)" },
          { label: "Paso 5 — Nueva cuota desde el periodo 15", content: `A = ${m2(ab1.filas[13].saldo)} / [factor con i = ${m8(xi)}, n = 22] = COP ${m2(ab1.filas[14].cuota)}` },
          { label: "Ahorro en intereses", content: `Sin abono: ${m2(ab0.totInt)} · Con abono: ${m2(ab1.totInt)} · Ahorro: COP ${m2(ab0.totInt - ab1.totInt)}` },
        ]} />
        <p style={{ marginTop: 10 }}><strong>Ahora tú (resuelto):</strong> máquina de COP 45.000.000, 10 años, método francés, 19,45 % EA. Abono adicional de COP 10.000.000 en el periodo 32. ¿Cuál es la cuota desde el periodo 33?</p>
        <FichaProcedimiento pasos={[
          { label: "Tasa mensual", content: `(1 + 0,1945)^(1/12) − 1 = ${m8(bi)}` },
          { label: "Cuota original", content: `COP ${m2(bb0.filas[0].cuota)}` },
          { label: "Saldo después de la cuota 32, restando el abono", content: `${m2(bb0.filas[31].saldo)} − 10.000.000 = COP ${m2(bb1.filas[31].saldo)}` },
          { label: "Cuotas que faltan", content: "120 − 32 = 88" },
          { label: "Nueva cuota desde el periodo 33", content: `COP ${m2(bb1.filas[32].cuota)}` },
        ]} />

        <SubT>9.3 · Periodo de gracia al inicio del crédito</SubT>
        <p>Los periodos de gracia son periodos en los que no se paga ningún valor o solo los intereses, pero no se abona capital. Se usan como estrategia comercial (para no pagar de inmediato) y en casos de insolvencia (para dar un respiro).</p>
        <p><strong>Caso 1: sin pagar nada.</strong> Una familia compra un apartamento de COP 560.000.000 con un crédito por el total. Tiene 2 años de gracia en los que no pagan nada. Luego pagan 20 años con cuotas mensuales a 13,56 % EA.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual", content: `i = (1 + 0,1356)^(1/12) − 1 = ${m8(gi)}` },
          { label: "Paso 2 — Durante la gracia, los intereses no se pagan: se suman a la deuda", content: `Saldo a los 24 meses = 560.000.000 × (1 + ${m8(gi)})^24 = COP ${m2(saldoGracia)}` },
          { label: "Paso 3 — Cuotas que se pagan", content: "20 años × 12 = 240 cuotas" },
          { label: "Paso 4 — Cuota mensual", content: `A = ${m2(saldoGracia)} / [factor con i = ${m8(gi)}, n = 240] = COP ${m2(gr1.filas[24].cuota)}` },
        ]} />
        <p><strong>Caso 2: pagando intereses (ahora tú, resuelto).</strong> Una empresa compra una planta por COP 1.270.000.000 a 30 años, cuotas mensuales, método francés, 11,76 % EA. Los primeros 5 años son de gracia pagando los intereses. Desde el periodo 61 empieza a pagar cuotas completas.</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Tasa mensual", content: `i = (1 + 0,1176)^(1/12) − 1 = ${m8(pi2)}` },
          { label: "Paso 2 — Cuota en la gracia (periodos 1 a 60)", content: `Solo intereses: 1.270.000.000 × ${m8(pi2)} = COP ${m2(gr2.filas[0].cuota)}` },
          { label: "Paso 3 — Cuotas completas", content: "30 años = 360 periodos; 360 − 60 = 300 cuotas completas" },
          { label: "Paso 4 — Cuota completa (periodo 61 en adelante)", content: `A = 1.270.000.000 / [factor con i = ${m8(pi2)}, n = 300] = COP ${m2(gr2.filas[60].cuota)}` },
        ]} />
        <Interpretacion>
          Un periodo de gracia no es plata gratis. En el caso 1 la deuda creció de COP 560.000.000 a COP {m2(saldoGracia)} antes de la primera cuota. En el caso 2 la cuota de la gracia (COP {m2(gr2.filas[0].cuota)}) es mucho menor que la cuota completa (COP {m2(gr2.filas[60].cuota)}), pero el saldo no baja ni un peso durante 5 años.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Leasing: ¿por qué el saldo final no es cero?">
        <p><strong>¿Qué es?</strong> Es un crédito que funciona como un arrendamiento: el dueño del bien se lo ofrece a una persona o empresa y, al final del tiempo pactado, se ofrece una <strong>opción de compra</strong>.</p>
        <FilaMini>
          <TarjetaMini titulo="Leasing financiero" tono="azul">Lo usual es pactar una opción de compra al final, y es usual que se ejerza: se compra el bien.</TarjetaMini>
          <TarjetaMini titulo="Leasing operativo" tono="azul">Lo más usual es que no se ejerza la opción de compra: al terminar el tiempo se acaba el arrendamiento.</TarjetaMini>
        </FilaMini>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Alquilas una bicicleta por un tiempo. Pagas cuotas más pequeñas porque al final todavía queda un pedacito de la bicicleta por pagar: la opción de compra. Ese pedacito es el saldo final.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué el saldo final no es cero?</strong> Porque las cuotas no alcanzan a pagar toda la deuda: dejan sin pagar el valor de la opción de compra. Si la persona la ejerce, paga ese valor al final y el bien es suyo.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Fórmula (Excel: =PAGO(i; n; −VP; VF))</div>
        <BloqueFormula>A = [ VP − VF / (1 + i)^n ] / [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <FilaMini>
          <TarjetaMini titulo="A">La cuota del leasing.</TarjetaMini>
          <TarjetaMini titulo="VP">El valor del bien financiado.</TarjetaMini>
          <TarjetaMini titulo="VF">El valor de la opción de compra: lo que se debe al final.</TarjetaMini>
          <TarjetaMini titulo="i, n">La tasa efectiva vencida del periodo de la cuota y el número de cuotas.</TarjetaMini>
        </FilaMini>
        <p>Es la fórmula del sistema francés, pero al VP se le resta el valor presente de la opción de compra. Con VF = 0 vuelve a ser el francés normal.</p>
        <SubT>Ejemplo resuelto (de la clase)</SubT>
        <p>Una empresa compra una oficina de COP 850.000.000 con un leasing financiero: 11,23 % EA, 15 años, pagos mensuales. La opción de compra es el 10 % del valor total. ¿Cuál es la cuota mensual?</p>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Datos", content: "VP = 850.000.000 · n = 15 × 12 = 180 · VF = 10 % × 850.000.000 = 85.000.000" },
          { label: "Paso 2 — Tasa mensual", content: `i = (1 + 0,1123)^(1/12) − 1 = ${m8(li)}` },
          { label: "Paso 3 — Valor presente de la opción de compra", content: `85.000.000 / (1 + ${m8(li)})^180 = ${m2(85000000 / Math.pow(1 + li, 180))}` },
          { label: "Paso 4 — Valor que deben pagar las cuotas", content: `850.000.000 − ${m2(85000000 / Math.pow(1 + li, 180))} = ${m2(850000000 - 85000000 / Math.pow(1 + li, 180))}` },
          { label: "Paso 5 — Cuota", content: `A = ${m2(850000000 - 85000000 / Math.pow(1 + li, 180))} / ${m6(c3FactorVP(li, 180))} = COP ${m2(lea.filas[0].cuota)}` },
          { label: "Paso 6 — Saldo final", content: `Después de la cuota 180, el saldo es COP ${m2(lea.filas[179].saldo)} = la opción de compra` },
        ]} />
        <Acordeon title="Ver filas de la tabla (1, 2, 3, 178, 179, 180)">
          <TablaAmort res={lea} ts={[1, 2, 3, 178, 179, 180]} />
        </Acordeon>
        <Interpretacion>
          Con la opción de compra, la cuota es de COP {m2(lea.filas[0].cuota)}. Si no hubiera opción de compra (francés normal), la cuota sería COP {m2(leaSin)}. La diferencia está en los COP {m2(lea.filas[179].saldo)} que quedan sin pagar al final y que la empresa paga si decide quedarse con la oficina.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Errores comunes y un reto">
        <FilaMini>
          <TarjetaMini titulo="No fijar las celdas en Excel" tono="alerta">Si no pones el "$" en la fórmula de la cuota, al arrastrar o copiar se mueven los datos iniciales y la cuota cambia.</TarjetaMini>
          <TarjetaMini titulo="Usar la tasa sin convertir" tono="alerta">La tasa debe ser la efectiva vencida del periodo de la cuota. Una nominal o anticipada se convierte primero.</TarjetaMini>
          <TarjetaMini titulo="Olvidar los otros costos" tono="alerta">Se suman a la cuota y se restan al abono. Y para el costo real se usa la TIR con los otros incluidos.</TarjetaMini>
          <TarjetaMini titulo="Saldo final distinto de cero" tono="alerta">Si no hay opción de compra ni pago final, el saldo debe terminar en 0. Si no, hay un error en la tabla.</TarjetaMini>
          <TarjetaMini titulo="Confundir 'paga menos intereses' con 'más barato'" tono="alerta">Para comparar créditos distintos se usa el costo efectivo anual real (TIR), no solo el total de intereses.</TarjetaMini>
        </FilaMini>
        <SubT>Reto (sin resolver): combina todo</SubT>
        <p>María Paula compra un carro de COP 160.000.000 con un leasing de cuotas mensuales a 6 años, con periodo de gracia de 10 periodos y 12,55 % EA. A los 3 años, un nuevo banco le hace una compra de cartera desde el periodo 37 con una tasa de 9,12 %.</p>
        <TarjetaMini titulo="Antes de calcular, decide y escribe tus supuestos" tono="azul">
          El enunciado no dice: (1) si en la gracia se pagan intereses o no, (2) cuál es la opción de compra, ni (3) si el 9,12 % es efectivo anual. Escribe cada supuesto y luego usa: tasa mensual de cada banco → saldo al final de la gracia → cuota desde el periodo 11 → saldo después del periodo 36 → nueva cuota con la tasa de 9,12 % desde el periodo 37 (con el plazo que queda: 72 − 36 = 36 cuotas).
        </TarjetaMini>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Cierre y preguntas de repaso">
        <CierreRepaso
          intro="Sin ver los apuntes, intenta responder:"
          preguntas={[
            "¿Cuáles son los sistemas de amortización que existen y en qué se diferencian?",
            "¿Cuál es el método que paga más intereses en total y cuál paga menos?",
            "¿En qué casos el saldo no termina en 0?",
            "¿Por qué una cuota de manejo o un seguro encarecen el crédito y cómo se halla el costo real?",
            "¿Qué pasa con la cuota cuando hay una compra de cartera o un abono extra a capital?",
            "¿Qué tasa entra siempre al cálculo de la cuota?",
          ]}
          respuestas={[
            "Francés (cuota fija), alemán (abono a capital fijo, la cuota baja) y americano (solo intereses o nada, y se paga todo al final).",
            "El americano sin pago de intereses paga más; el alemán paga menos (entre francés y alemán).",
            "Cuando hay una opción de compra (leasing) o un pago final grande pactado (americano). En un crédito normal el saldo termina en 0.",
            "Porque se pagan sin bajar la deuda. El costo real se halla armando los flujos (desembolso positivo, cuotas con otros negativas), aplicando TIR y pasando el resultado a efectivo anual.",
            "Con una tasa menor o un abono extra, el saldo o el interés baja y se recalcula la cuota con el saldo y los periodos que quedan: la cuota baja (si el plazo se mantiene) o el crédito termina antes.",
            "La efectiva vencida del periodo de la cuota, obtenida con la conversión de tasas.",
          ]}
          idea="Idea final: todo el semestre converge aquí. La cuota francesa es una anualidad, el interés de cada periodo es interés compuesto y la tasa siempre es la efectiva vencida del periodo de la cuota."
        />
      </Acordeon>

    </div>
  );
}


function Aprender() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Educación financiera</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 32, color: C.navy, margin: "0 0 26px" }}>Conceptos fundamentales de matemáticas financieras</h1>

      <Acordeon title="1 · Interés simple" defaultOpen>
        <BloqueInteres
          queEs="El interés simple es la forma más fácil de ganar o pagar intereses. Siempre se calcula sobre el mismo capital inicial. Ese capital inicial no cambia."
          analogia={`Imagina que le prestas tu bicicleta a un amigo.

Cada mes, tu amigo te regala UNA moneda de las gracias.
Pase el tiempo que pase, siempre te da la MISMA moneda.

¿Por qué? Porque siempre te está pagando por la MISMA bicicleta.

El interés simple es igual: siempre se calcula sobre el mismo capital inicial, sin importar cuántos meses pasen.`}
          comoFunciona="Cada mes se cobra el mismo interés. Ese interés NO se junta con el numerito del principio. Se queda guardado aparte, como moneditas sueltas en un frasco."
          usoLabel="¿Cuándo se usa?"
          usoRespuesta="En préstamos cortos, y en cuentas donde lo que ganas no se vuelve a sumar para ganar más."
          formula="VF = VP · (1 + i · n)"
          despejes={["VP = VF / (1 + i·n)", "i = (VF/VP − 1) / n", "n = (VF/VP − 1) / i"]}
          ejemploTexto="Un capital de $ 1.000.000,00 COP se invierte al 2,00 % mensual simple durante 10 meses."
          pasosEjemplo={[
            { label: "Datos", content: "VP = $1.000.000,00 · i = 2,00 % mensual · n = 10 periodos" },
            { label: "Incógnita", content: "VF (Valor Futuro)" },
            { label: "Fórmula", content: "VF = VP · (1 + i·n)" },
            { label: "Conversión de tasa", content: "2,00 % → 0,02" },
            { label: "Sustitución", content: "VF = 1.000.000 · (1 + 0,02 × 10)" },
            { label: "Desarrollo", content: "VF = 1.000.000 × 1,2" },
            { label: "Resultado sin redondear", content: "1200000" },
            { label: "Resultado presentado", content: formatCurrencyCO(1200000, "COP") },
            { label: "Interpretación", content: "Bajo estas condiciones, el capital alcanzaría un valor del final de $ 1.200.000,00 COP." },
          ]}
        />
      </Acordeon>

      <Acordeon title="2 · Interés compuesto: interés sobre interés">
        <BloqueInteres
          queEs="El interés compuesto es cuando los intereses generados se incorporan al capital. Dicho fácil: es interés sobre interés, porque el dinero crece y los intereses también empiezan a producir más intereses."
          analogia={`Imagina una bola de nieve.

La empujas cuesta abajo y empieza chiquitica.
Mientras rueda, se le va pegando más nieve.
Y esa nieve nueva hace que se le pegue TODAVÍA más nieve.

Cada vuelta, la bola es más grande que la vuelta de antes.

El dinero hace lo mismo: gana intereses, esos intereses se vuelven parte del dinero, y ese dinero más grande gana más intereses todavía.`}
          comoFunciona="Al final de cada mes, el interés se suma al dinero que ya tenías. Al mes siguiente, el interés se calcula sobre ese dinero más grande. Por eso crece cada vez más rápido."
          usoLabel="¿Por qué es diferente al interés simple?"
          usoRespuesta="En el simple, siempre calculas sobre el capital inicial. En el compuesto, el capital va creciendo. Con una tasa positiva y durante más de un periodo, el compuesto genera más valor porque los intereses acumulados también producen intereses."
          formula="VF = VP · (1 + i)ⁿ"
          despejes={["VP = VF / (1+i)ⁿ", "i = (VF/VP)^(1/n) − 1", "n = ln(VF/VP) / ln(1+i)"]}
          ejemploTexto="Un capital de $ 1.000.000,00 COP se invierte al 3,00 % trimestral compuesto durante 4 trimestres."
          pasosEjemplo={[
            { label: "Datos", content: "VP = $1.000.000,00 · i = 3,00 % trimestral · n = 4 periodos" },
            { label: "Incógnita", content: "VF (Valor Futuro)" },
            { label: "Fórmula", content: "VF = VP · (1+i)ⁿ" },
            { label: "Sustitución", content: "VF = 1.000.000 × (1,03)⁴" },
            { label: "Resultado sin redondear", content: String(futureValueCompound(1000000, 0.03, 4)) },
            { label: "Resultado presentado", content: formatCurrencyCO(futureValueCompound(1000000, 0.03, 4), "COP") },
            { label: "Interpretación", content: "El saldo puede crecer más que en interés simple porque cada trimestre los intereses se suman al capital y generan más intereses." },
          ]}
        />
      </Acordeon>

      <Acordeon title="3 · Interés continuo">
        <BloqueInteres
          queEs="El interés continuo es como el compuesto, pero sin esperar nada. En vez de sumar los intereses cada mes, los va sumando todo el tiempo, sin parar nunca."
          analogia={`¿Te acuerdas de la bola de nieve de hace un momento?

Ahora imagina que no espera a dar una vuelta completa para que se le pegue nieve.
Se le va pegando nieve en CADA segundito, sin parar.

Por eso esta bola crece un poquito más rápido que la del interés compuesto normal.`}
          comoFunciona="El dinero no espera a que termine el mes para crecer. Va creciendo poquito a poquito, todo el tiempo, sin pausas. Para calcular esto usamos un número especial que se llama 'e'."
          usoLabel="¿Dónde se usa y en qué se diferencia del compuesto?"
          usoRespuesta="Se usa más en cuentas avanzadas de bancos y en estudios de dinero, no tanto en la vida diaria. La diferencia con el compuesto es que el compuesto suma los intereses cada cierto tiempo (cada mes, por ejemplo), y el continuo los va sumando sin parar nunca."
          notaEspecial="En interés continuo, t siempre se expresa en años. Ejemplo: 2 años y 6 meses = 2 + 6/12 = 2,5 años."
          formula="VF = VP · e^(r·t)"
          despejes={["VP = VF · e^(−r·t)", "r = ln(VF/VP) / t", "t = ln(VF/VP) / r"]}
          ejemploTexto="Un capital de $ 850.000,00 COP se invierte al 8,95 % continuo durante 2 años y 6 meses (t = 2,5 años)."
          pasosEjemplo={[
            { label: "Datos", content: "VP = $850.000,00 · r = 8,95 % anual de tasa continua · tiempo = 2 años 6 meses" },
            { label: "Conversión temporal", content: "t = 2 + 6/12 = 2,5 años" },
            { label: "Incógnita", content: "VF (Valor Futuro)" },
            { label: "Fórmula", content: "VF = VP · e^(r·t)" },
            { label: "Sustitución", content: "VF = 850.000 × e^(0,0895 × 2,5)" },
            { label: "Resultado sin redondear", content: String(futureValueContinuous(850000, 0.0895, 2.5)) },
            { label: "Resultado presentado", content: formatCurrencyCO(futureValueContinuous(850000, 0.0895, 2.5), "COP") },
          ]}
        />
      </Acordeon>

      <Acordeon title="4 · Conversión de tasas">
        <ConversionTasas />
      </Acordeon>

      <Acordeon title="5 · Anualidades vencidas">
        <AnualidadesVencidas />
      </Acordeon>

      <Acordeon title="6 · Anualidades anticipadas">
        <AnualidadesAnticipadas />
      </Acordeon>

      <Acordeon title="7 · Gradientes">
        <Gradientes />
      </Acordeon>

      <Acordeon title="8 · Perpetuidades">
        <Perpetuidades />
      </Acordeon>

      <Acordeon title="9 · Sistemas de amortización">
        <SistemasAmortizacion />
      </Acordeon>

      <div style={{ marginTop: 18, padding: 16, background: C.paperDark, borderRadius: 8, fontSize: 13, color: C.slate }}>
        <strong style={{ color: C.navy }}>Notación:</strong> para interés simple y compuesto usamos <em>i</em> (tasa por periodo) y <em>n</em> (número de periodos). Para interés continuo usamos <em>r</em> (tasa continua) y <em>t</em> (tiempo en años). Nunca usamos una "T" aislada: siempre indicamos "Momento del flujo" con su unidad explícita.
      </div>
      
    </Section>
  );
}

/* ============================================================
   SIMULAR — MODO BÁSICO
   ============================================================ */
function SimularBasico({ moneda, onGuardarHistorial }) {
  const [operacion, setOperacion] = useState("credito");
  const [regimen, setRegimen] = useState("simple");
  const [incognita, setIncognita] = useState("VF");
  const [VP, setVP] = useState("1000000");
  const [VF, setVF] = useState("");
  const [I, setI] = useState("");
  const [usarI, setUsarI] = useState(false);
  const [tasaPct, setTasaPct] = useState("2");
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [nPersonalizado, setNPersonalizado] = useState("3");
  const [anios, setAnios] = useState("1");
  const [meses, setMeses] = useState("0");
  const [masDecimales, setMasDecimales] = useState(false);
  const [tasaDef, setTasaDef] = useState({ tipo: "efectiva", modalidad: "vencida", periodo: "mensual", meses: "5" });
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  const incognitasDisponibles = regimen === "continuo"
    ? [
        { value: "VF", label: "Valor Futuro (VF)" },
        { value: "VP", label: "Valor Presente (VP)" },
        { value: "I", label: "Interés / ganancia neta (I)" },
        { value: "r", label: "Tasa continua (r)" },
        { value: "t", label: "Tiempo (t, en años)" },
      ]
    : [
        { value: "VF", label: "Valor Futuro (VF)" },
        { value: "VP", label: "Valor Presente (VP)" },
        { value: "I", label: "Interés / ganancia neta (I)" },
        { value: "i", label: "Tasa de interés (i)" },
        { value: "n", label: "Número de períodos (n)" },
      ];

  const parseNum = (v) => {
    if (v === "" || v === null || v === undefined) return NaN;
    let txt = String(v).trim();
    if (txt.includes(",")) txt = txt.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(txt)) txt = txt.replace(/\./g, "");
    return parseFloat(txt);
  };

  const periodoActual = PERIODICIDADES.find((p) => p.value === periodicidad);
  const mesesPeriodoVista = periodicidad === "personalizada" ? parseNum(nPersonalizado) : periodoActual?.meses;
  const nombrePeriodo = periodicidad === "personalizada"
    ? `cada ${Number.isFinite(mesesPeriodoVista) ? formatNumberCO(mesesPeriodoVista, 0, 2) : "N"} meses`
    : periodicidad;

  function cargarEjemplo() {
    const ej = EJEMPLOS[regimen];
    setOperacion(ej.operacion); setVP(ej.VP); setTasaPct(ej.tasa); setAnios(ej.anios); setMeses(ej.meses);
    setIncognita(ej.incognita); setVF(ej.VF || ""); setI(""); setUsarI(false);
    if (regimen !== "continuo") setPeriodicidad(ej.periodicidad);
    if (regimen === "compuesto") setTasaDef({ tipo: "efectiva", modalidad: "vencida", periodo: ej.periodicidad === "personalizada" ? "personalizado_meses" : ej.periodicidad, meses: ej.nPersonalizado || "5" });
  }

  function calcular() {
    setError(""); setResultado(null);
    let vp = parseNum(VP), vf = parseNum(VF), interesDato = parseNum(I);
    let tasa = parseNum(tasaPct) / 100;
    const a = parseNum(anios) || 0, m = parseNum(meses) || 0;

    if (a < 0 || m < 0) { setError("El tiempo no puede ser negativo."); return; }


    let mesesPorPeriodo = 1;
    if (regimen !== "continuo") {
      const perio = PERIODICIDADES.find((p) => p.value === periodicidad);
      mesesPorPeriodo = periodicidad === "personalizada" ? parseNum(nPersonalizado) : perio?.meses;
      if (!mesesPorPeriodo || mesesPorPeriodo <= 0) { setError("Ingresa cuántos meses tiene el período personalizado."); return; }
    }

    const pasos = [];
    let valorFinal, etiquetaFinal;
    let vpFinal = vp, vfFinal = vf;
    let convResumen = null;

    pasos.push({
      label: "1. Datos del ejercicio",
      content: `Operación: ${operacion === "credito" ? "Crédito" : "Inversión"}. VP = ${Number.isFinite(vp) ? formatCurrencyCO(vp, moneda) : "incógnita"}; VF = ${Number.isFinite(vf) ? formatCurrencyCO(vf, moneda) : "incógnita"}; I = ${Number.isFinite(interesDato) ? formatCurrencyCO(interesDato, moneda) : "por calcular"}.`,
    });
    pasos.push({
      label: "2. Significado de las variables",
      content: regimen === "continuo"
        ? "VP = Valor Presente; VF = Valor Futuro; I = interés o ganancia neta; r = tasa continua; t = tiempo expresado en años."
        : "VP = Valor Presente; VF = Valor Futuro; I = interés o ganancia neta; i = tasa por período; n = número de períodos de la tasa.",
    });

    // I puede usarse como dato auxiliar. En clase: I = VF − VP.
    if (incognita !== "I" && usarI) {
      if (!Number.isFinite(interesDato)) { setError("Marcaste I como dato conocido. Ingresa el valor de I."); return; }
      if (incognita === "VF") {
        if (!Number.isFinite(vp)) { setError("Para hallar VF usando I necesitas ingresar VP."); return; }
        vf = vp + interesDato; vfFinal = vf;
      } else if (incognita === "VP") {
        if (!Number.isFinite(vf)) { setError("Para hallar VP usando I necesitas ingresar VF."); return; }
        vp = vf - interesDato; vpFinal = vp;
      } else if (["i", "n", "r", "t"].includes(incognita)) {
        if (!Number.isFinite(vp)) { setError("Para usar I como dato en este despeje, ingresa VP. La herramienta obtiene VF = VP + I."); return; }
        vf = vp + interesDato; vfFinal = vf;
        pasos.push({ label: "3. Relación con I", content: `Como I = VF − VP, entonces VF = VP + I = ${formatCurrencyCO(vp, moneda)} + ${formatCurrencyCO(interesDato, moneda)} = ${formatCurrencyCO(vf, moneda)}.` });
      }
    }

    try {
      if (incognita === "I") {
        if (!Number.isFinite(vp) || !Number.isFinite(vf)) throw new Error("Para calcular I necesitas ingresar VP y VF.");
        valorFinal = vf - vp;
        vpFinal = vp; vfFinal = vf;
        etiquetaFinal = "Interés / ganancia neta (I)";
        pasos.push(
          { label: "3. Fórmula de I", content: "I = VF − VP" },
          { label: "4. Sustitución", content: `I = ${formatCurrencyCO(vf, moneda)} − ${formatCurrencyCO(vp, moneda)}` },
          { label: "5. Resultado", content: `I = ${formatCurrencyCO(valorFinal, moneda)}` },
        );
      } else if (usarI && (incognita === "VF" || incognita === "VP")) {
        valorFinal = incognita === "VF" ? vf : vp;
        vpFinal = incognita === "VP" ? valorFinal : vp;
        vfFinal = incognita === "VF" ? valorFinal : vf;
        etiquetaFinal = incognita === "VF" ? "Valor Futuro (VF)" : "Valor Presente (VP)";
        pasos.push(
          { label: "3. Relación fundamental", content: incognita === "VF" ? "I = VF − VP  →  VF = VP + I" : "I = VF − VP  →  VP = VF − I" },
          { label: "4. Sustitución", content: incognita === "VF" ? `VF = ${formatCurrencyCO(vp, moneda)} + ${formatCurrencyCO(interesDato, moneda)}` : `VP = ${formatCurrencyCO(vf, moneda)} − ${formatCurrencyCO(interesDato, moneda)}` },
        );
      } else if (regimen === "continuo") {
        const t = incognita === "t" ? null : yearsMonthsToDecimalYears(a, m);
        if (incognita !== "t") pasos.push({ label: "3. Conversión del tiempo", content: `En continuo usamos t en años: t = ${a} + ${m}/12 = ${formatNumberCO(t, 2, 4)} años.` });
        pasos.push({ label: "4. Régimen", content: "Interés continuo: el crecimiento ocurre de forma continua. No usamos n ni períodos de capitalización; usamos r y t." });
        if (incognita === "VF") {
          if (!Number.isFinite(vp) || vp <= 0 || !Number.isFinite(tasa)) throw new Error("Ingresa VP y r válidos.");
          valorFinal = futureValueContinuous(vp, tasa, t); vfFinal = valorFinal; vpFinal = vp;
          pasos.push(
            { label: "Fórmula general usada en clase", content: "VF = VP · e^(r·t)" },
            { label: "Reemplazamos los valores", content: `VF = ${procRaw(vp)} · e^(${procRaw(tasa)} · ${procRaw(t)})` },
            { label: "Resolvemos primero el exponente", content: `r·t = ${procRaw(tasa)} · ${procRaw(t)} = ${procRaw(tasa * t)}` },
            { label: "Calculamos e^(r·t)", content: `e^(${procRaw(tasa * t)}) = ${procRaw(Math.exp(tasa * t))}` },
            { label: "Multiplicamos por VP", content: `VF = ${procRaw(vp)} · ${procRaw(Math.exp(tasa * t))} = ${procRaw(valorFinal)}` },
            { label: "Resultado", content: `VF = ${procRaw(valorFinal)}` }
          );
          etiquetaFinal = "Valor Futuro (VF)";
        } else if (incognita === "VP") {
          if (!Number.isFinite(vf) || !Number.isFinite(tasa)) throw new Error("Ingresa VF y r válidos.");
          valorFinal = presentValueContinuous(vf, tasa, t); vpFinal = valorFinal; vfFinal = vf;
          pasos.push(
            { label: "Partimos de la fórmula vista en clase", content: "VF = VP · e^(r·t)" },
            { label: "Despejamos VP", content: "VP = VF / e^(r·t) = VF · e^(−r·t)" },
            { label: "Reemplazamos los valores", content: `VP = ${procRaw(vf)} · e^(−${procRaw(tasa)} · ${procRaw(t)})` },
            { label: "Resolvemos el exponente", content: `−r·t = −${procRaw(tasa)} · ${procRaw(t)} = ${procRaw(-tasa * t)}` },
            { label: "Calculamos y multiplicamos", content: `VP = ${procRaw(vf)} · ${procRaw(Math.exp(-tasa * t))} = ${procRaw(valorFinal)}` },
            { label: "Resultado", content: `VP = ${procRaw(valorFinal)}` }
          );
          etiquetaFinal = "Valor Presente (VP)";
        } else if (incognita === "r") {
          if (!Number.isFinite(vp) || !Number.isFinite(vf) || !t) throw new Error("Ingresa VP, VF y tiempo válidos.");
          valorFinal = solveRateContinuous(vp, vf, t); vpFinal = vp; vfFinal = vf;
          pasos.push(
            { label: "Partimos de la fórmula vista en clase", content: "VF = VP · e^(r·t)" },
            { label: "Dividimos entre VP", content: "VF / VP = e^(r·t)" },
            { label: "Aplicamos logaritmo natural", content: "ln(VF / VP) = r·t" },
            { label: "Despejamos r", content: "r = ln(VF / VP) / t" },
            { label: "Reemplazamos los valores", content: `r = ln(${procRaw(vf)} / ${procRaw(vp)}) / ${procRaw(t)}` },
            { label: "Resolvemos", content: `VF/VP = ${procRaw(vf / vp)}; ln(VF/VP) = ${procRaw(Math.log(vf / vp))}; r = ${procRaw(Math.log(vf / vp))} / ${procRaw(t)} = ${procRaw(valorFinal)}` },
            { label: "Pasamos la tasa a porcentaje", content: `r = ${procRaw(valorFinal)} · 100 = ${procRaw(valorFinal * 100)} % continuo` }
          );
          etiquetaFinal = "Tasa continua (r)";
        } else if (incognita === "t") {
          if (!Number.isFinite(vp) || !Number.isFinite(vf) || !Number.isFinite(tasa) || tasa === 0) throw new Error("Ingresa VP, VF y r válidos.");
          valorFinal = solveTimeContinuous(vp, vf, tasa); vpFinal = vp; vfFinal = vf;
          pasos.push(
            { label: "Partimos de la fórmula vista en clase", content: "VF = VP · e^(r·t)" },
            { label: "Dividimos entre VP", content: "VF / VP = e^(r·t)" },
            { label: "Aplicamos logaritmo natural", content: "ln(VF / VP) = r·t" },
            { label: "Despejamos t", content: "t = ln(VF / VP) / r" },
            { label: "Reemplazamos los valores", content: `t = ln(${procRaw(vf)} / ${procRaw(vp)}) / ${procRaw(tasa)}` },
            { label: "Resolvemos", content: `VF/VP = ${procRaw(vf / vp)}; ln(VF/VP) = ${procRaw(Math.log(vf / vp))}; t = ${procRaw(Math.log(vf / vp))} / ${procRaw(tasa)} = ${procRaw(valorFinal)} años` },
            { label: "Unidad usada en clase", content: "En interés continuo, t siempre se expresa en años." }
          );
          etiquetaFinal = "Tiempo (t)";
        }
      } else {
        const n = incognita === "n" ? null : convertTimeToPeriods(a, m, mesesPorPeriodo);
        const etiquetaPer = periodicidad === "personalizada" ? `cada ${mesesPorPeriodo} meses` : periodoActual?.label?.toLowerCase();
        if (incognita !== "n") pasos.push({
          label: "3. Conversión del tiempo a n",
          content: `${a} años y ${m} meses = ${a * 12 + m} meses (${Math.floor((a * 12 + m) / 12)} años y ${(a * 12 + m) % 12} meses). Como la tasa es ${etiquetaPer} (1 período = ${mesesPorPeriodo} ${mesesPorPeriodo === 1 ? "mes" : "meses"}), n = ${a * 12 + m}/${mesesPorPeriodo} = ${formatNumberCO(n, 2, 6)} períodos.`,
        });
        if (regimen === "compuesto" && incognita !== "i") {
          // Interés compuesto: conversión automática a efectiva vencida del periodo de la operación.
          const tasaIngresada = parseNum(tasaPct);
          if (!Number.isFinite(tasaIngresada)) throw new Error("La tasa ingresada debe ser numérica.");
          const conv = convertirTasaAPeriodoOperacion({
            tasaPct: tasaIngresada, tipoEntrada: tasaDef.tipo, modalidadEntrada: tasaDef.modalidad, periodoEntrada: tasaDef.periodo,
            mesesEntradaPersonalizados: parseNum(tasaDef.meses), periodoOperacion: "personalizado_meses", mesesOperacionPersonalizados: mesesPorPeriodo,
          });
          tasa = conv.iEfectivaVencida;
          const entradaTxt = descripcionTasa({ tasaPct: tasaIngresada, tipo: tasaDef.tipo, modalidad: tasaDef.modalidad, periodo: tasaDef.periodo, meses: tasaDef.meses });
          pasos.push({ label: "Conversión automática de la tasa (solo interés compuesto)", content: `Tasa ingresada: ${entradaTxt}. Se convierte a efectiva ${etiquetaPer} vencida, el periodo de la operación.` });
          conv.pasos.slice(1, -1).forEach((p) => pasos.push({ label: `Conversión — ${p.label}`, content: p.content }));
          pasos.push({ label: "Tasa efectiva vencida final usada", content: `i = ${formatPercentCO(tasa, 4)} efectiva ${etiquetaPer} vencida. Esta es la tasa que entra en la fórmula de interés compuesto.` });
          convResumen = { entrada: entradaTxt, final: formatPercentCO(tasa, 4), periodo: etiquetaPer };
        }
        pasos.push({
          label: "4. Régimen y periodicidad",
          content: regimen === "simple"
            ? `Interés simple: i = ${formatPercentCO(tasa)} ${etiquetaPer}; los intereses NO se capitalizan y siempre se calculan sobre el capital inicial.`
            : `Interés compuesto: i = ${formatPercentCO(tasa)} ${etiquetaPer}; los intereses sí se capitalizan y generan nuevos intereses.`,
        });
        if (regimen === "simple") {
          if (incognita === "VF") {
            valorFinal = futureValueSimple(vp, tasa, n); vfFinal = valorFinal; vpFinal = vp;
            pasos.push(
              { label: "Fórmula general usada en clase", content: "VF = VP · (1 + i·n)" },
              { label: "Reemplazamos los valores", content: `VF = ${procRaw(vp)} · (1 + ${procRaw(tasa)} · ${procRaw(n)})` },
              { label: "Multiplicamos i·n", content: `i·n = ${procRaw(tasa)} · ${procRaw(n)} = ${procRaw(tasa * n)}` },
              { label: "Resolvemos el paréntesis", content: `1 + i·n = 1 + ${procRaw(tasa * n)} = ${procRaw(1 + tasa * n)}` },
              { label: "Multiplicamos por VP", content: `VF = ${procRaw(vp)} · ${procRaw(1 + tasa * n)} = ${procRaw(valorFinal)}` },
              { label: "Resultado", content: `VF = ${procRaw(valorFinal)}` }
            ); etiquetaFinal = "Valor Futuro (VF)";
          }
          else if (incognita === "VP") {
            valorFinal = presentValueSimple(vf, tasa, n); vpFinal = valorFinal; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1 + i·n)" },
              { label: "Despejamos VP", content: "VP = VF / (1 + i·n)" },
              { label: "Reemplazamos los valores", content: `VP = ${procRaw(vf)} / (1 + ${procRaw(tasa)} · ${procRaw(n)})` },
              { label: "Resolvemos el denominador", content: `1 + i·n = 1 + (${procRaw(tasa)} · ${procRaw(n)}) = ${procRaw(1 + tasa * n)}` },
              { label: "Dividimos", content: `VP = ${procRaw(vf)} / ${procRaw(1 + tasa * n)} = ${procRaw(valorFinal)}` },
              { label: "Resultado", content: `VP = ${procRaw(valorFinal)}` }
            ); etiquetaFinal = "Valor Presente (VP)";
          }
          else if (incognita === "i") {
            valorFinal = solveRateSimple(vp, vf, n); vpFinal = vp; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1 + i·n)" },
              { label: "Dividimos entre VP", content: "VF / VP = 1 + i·n" },
              { label: "Restamos 1", content: "VF / VP − 1 = i·n" },
              { label: "Despejamos i", content: "i = (VF / VP − 1) / n" },
              { label: "Reemplazamos los valores", content: `i = (${procRaw(vf)} / ${procRaw(vp)} − 1) / ${procRaw(n)}` },
              { label: "Resolvemos", content: `VF/VP = ${procRaw(vf / vp)}; VF/VP − 1 = ${procRaw((vf / vp) - 1)}; i = ${procRaw((vf / vp) - 1)} / ${procRaw(n)} = ${procRaw(valorFinal)}` },
              { label: "Pasamos a porcentaje", content: `i = ${procRaw(valorFinal)} · 100 = ${procRaw(valorFinal * 100)} % por período` }
            ); etiquetaFinal = "Tasa de interés (i)";
          }
          else if (incognita === "n") {
            valorFinal = solveTimeSimple(vp, vf, tasa); vpFinal = vp; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1 + i·n)" },
              { label: "Dividimos entre VP", content: "VF / VP = 1 + i·n" },
              { label: "Restamos 1", content: "VF / VP − 1 = i·n" },
              { label: "Despejamos n", content: "n = (VF / VP − 1) / i" },
              { label: "Reemplazamos los valores", content: `n = (${procRaw(vf)} / ${procRaw(vp)} − 1) / ${procRaw(tasa)}` },
              { label: "Resolvemos", content: `VF/VP = ${procRaw(vf / vp)}; VF/VP − 1 = ${procRaw((vf / vp) - 1)}; n = ${procRaw((vf / vp) - 1)} / ${procRaw(tasa)} = ${procRaw(valorFinal)} períodos` }
            ); etiquetaFinal = "Número de períodos (n)";
          }
        } else {
          if (incognita === "VF") {
            valorFinal = futureValueCompound(vp, tasa, n); vfFinal = valorFinal; vpFinal = vp;
            pasos.push(
              { label: "Fórmula general usada en clase", content: "VF = VP · (1+i)ⁿ" },
              { label: "Reemplazamos los valores", content: `VF = ${procRaw(vp)} · (1 + ${procRaw(tasa)})^${procRaw(n)}` },
              { label: "Resolvemos la base", content: `1 + i = 1 + ${procRaw(tasa)} = ${procRaw(1 + tasa)}` },
              { label: "Elevamos al número de períodos", content: `(1+i)^n = ${procRaw(1 + tasa)}^${procRaw(n)} = ${procRaw(Math.pow(1 + tasa, n))}` },
              { label: "Multiplicamos por VP", content: `VF = ${procRaw(vp)} · ${procRaw(Math.pow(1 + tasa, n))} = ${procRaw(valorFinal)}` },
              { label: "Resultado", content: `VF = ${procRaw(valorFinal)}` }
            ); etiquetaFinal = "Valor Futuro (VF)";
          }
          else if (incognita === "VP") {
            valorFinal = presentValueCompound(vf, tasa, n); vpFinal = valorFinal; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1+i)ⁿ" },
              { label: "Despejamos VP", content: "VP = VF / (1+i)ⁿ" },
              { label: "Reemplazamos los valores", content: `VP = ${procRaw(vf)} / (1 + ${procRaw(tasa)})^${procRaw(n)}` },
              { label: "Calculamos el factor", content: `(1+i)^n = ${procRaw(1 + tasa)}^${procRaw(n)} = ${procRaw(Math.pow(1 + tasa, n))}` },
              { label: "Dividimos", content: `VP = ${procRaw(vf)} / ${procRaw(Math.pow(1 + tasa, n))} = ${procRaw(valorFinal)}` },
              { label: "Resultado", content: `VP = ${procRaw(valorFinal)}` }
            ); etiquetaFinal = "Valor Presente (VP)";
          }
          else if (incognita === "i") {
            valorFinal = solveRateCompound(vp, vf, n); vpFinal = vp; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1+i)ⁿ" },
              { label: "Dividimos entre VP", content: "VF / VP = (1+i)ⁿ" },
              { label: "Aplicamos raíz n-ésima", content: "(VF / VP)^(1/n) = 1+i" },
              { label: "Despejamos i", content: "i = (VF / VP)^(1/n) − 1" },
              { label: "Reemplazamos los valores", content: `i = (${procRaw(vf)} / ${procRaw(vp)})^(1/${procRaw(n)}) − 1` },
              { label: "Resolvemos", content: `VF/VP = ${procRaw(vf / vp)}; 1/n = ${procRaw(1 / n)}; i = ${procRaw(valorFinal)}` },
              { label: "Pasamos a porcentaje", content: `i = ${procRaw(valorFinal)} · 100 = ${procRaw(valorFinal * 100)} % por período` }
            ); etiquetaFinal = "Tasa de interés (i)";
          }
          else if (incognita === "n") {
            valorFinal = solveTimeCompound(vp, vf, tasa); vpFinal = vp; vfFinal = vf;
            pasos.push(
              { label: "Partimos de la fórmula vista en clase", content: "VF = VP · (1+i)ⁿ" },
              { label: "Dividimos entre VP", content: "VF / VP = (1+i)ⁿ" },
              { label: "Aplicamos logaritmo", content: "log(VF / VP) = n · log(1+i)" },
              { label: "Despejamos n", content: "n = log(VF / VP) / log(1+i)" },
              { label: "Reemplazamos los valores", content: `n = log(${procRaw(vf)} / ${procRaw(vp)}) / log(1 + ${procRaw(tasa)})` },
              { label: "Resolvemos", content: `log(VF/VP) = ${procRaw(Math.log10(vf / vp))}; log(1+i) = ${procRaw(Math.log10(1 + tasa))}; n = ${procRaw(Math.log10(vf / vp))} / ${procRaw(Math.log10(1 + tasa))} = ${procRaw(valorFinal)} períodos` },
              { label: "Interpretación de n", content: `La respuesta queda en períodos de la tasa seleccionada. Luego se convierte a años y meses si corresponde.` }
            ); etiquetaFinal = "Número de períodos (n)";
          }
        }
      }
    } catch (e) { setError(e.message || "No fue posible calcular con estos datos."); return; }

    if (!validateSolution(valorFinal)) { setError("Con los datos ingresados no encontramos una solución financiera válida. Revisa VP, VF, I, la tasa y el tiempo."); return; }

    const interesCalculado = Number.isFinite(vpFinal) && Number.isFinite(vfFinal) ? vfFinal - vpFinal : (incognita === "I" ? valorFinal : NaN);
    if (Number.isFinite(interesCalculado) && incognita !== "I") pasos.push({ label: "7. Interés / ganancia neta (I)", content: `I = VF − VP = ${formatCurrencyCO(vfFinal, moneda)} − ${formatCurrencyCO(vpFinal, moneda)} = ${formatCurrencyCO(interesCalculado, moneda)}.` });
    pasos.push({
      label: "Interpretación",
      content: operacion === "credito"
        ? "Desde la perspectiva del cliente, I representa el costo financiero total del crédito entre VP y VF."
        : "En una inversión, I representa la ganancia neta generada entre el valor inicial VP y el valor final VF.",
    });

    let residual = 0, verifOk = true;
    try {
      if (incognita === "I" || (usarI && ["VF", "VP"].includes(incognita))) residual = (vfFinal - vpFinal) - interesCalculado;
      else if (regimen === "continuo") {
        const t = incognita === "t" ? valorFinal : yearsMonthsToDecimalYears(a, m);
        const rUsar = incognita === "r" ? valorFinal : tasa;
        residual = vfFinal - futureValueContinuous(vpFinal, rUsar, t);
      } else {
        const n = incognita === "n" ? valorFinal : convertTimeToPeriods(a, m, mesesPorPeriodo);
        const iUsar = incognita === "i" ? valorFinal : tasa;
        const vfCalc = regimen === "simple" ? futureValueSimple(vpFinal, iUsar, n) : futureValueCompound(vpFinal, iUsar, n);
        residual = vfFinal - vfCalc;
      }
      verifOk = Math.abs(residual) < Math.max(1, Math.abs(Number.isFinite(valorFinal) ? valorFinal : 1)) * 1e-6;
    } catch { verifOk = false; }

    const esTiempo = incognita === "n" || incognita === "t";
    const esTasa = incognita === "i" || incognita === "r";
    let equivalenciaTemporal = null;
    if (incognita === "n") equivalenciaTemporal = periodsToYearsMonths(valorFinal, mesesPorPeriodo);

    const res = {
      etiquetaFinal, valorFinal, esTiempo, esTasa, equivalenciaTemporal, pasos, residual, verifOk, incognita, regimen, operacion,
      interesCalculado, vpFinal, vfFinal, mesesPorPeriodo, convResumen,
    };
    setResultado(res);
    onGuardarHistorial({ tipo: "basico", regimen, operacion, incognita, resultado: valorFinal, resultadoTipo: esTasa ? "tasa" : esTiempo ? "tiempo" : "moneda", fecha: new Date().toISOString(), moneda });
  }

  const mostrarTasaTiempo = incognita !== "I" && !(usarI && (incognita === "VF" || incognita === "VP"));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(340px,1.3fr)", gap: 26, alignItems: "start" }}>
      <Tarjeta>
        <Etiqueta>Configuración</Etiqueta>
        <Campo label="Tipo de operación" help="La interpretación de entradas, salidas e intereses cambia según sea crédito o inversión.">
          <Selector value={operacion} onChange={(e) => setOperacion(e.target.value)} options={[{ value: "credito", label: "Crédito" }, { value: "inversion", label: "Inversión" }]} />
        </Campo>
        <div style={{ padding: 12, background: C.paperDark, borderRadius: 8, fontSize: 12.5, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
          {operacion === "credito"
            ? <><strong style={{ color: C.navy }}>Crédito:</strong> VP suele ser el dinero que recibes hoy; VF es lo que terminas pagando o debiendo; <strong>I = VF − VP</strong> representa los intereses pagados.</>
            : <><strong style={{ color: C.navy }}>Inversión:</strong> VP es el capital que inviertes hoy; VF es lo que recibes al final; <strong>I = VF − VP</strong> representa la ganancia neta por intereses.</>}
        </div>

        <Campo label="Tipo de interés">
          <Selector value={regimen} onChange={(e) => { setRegimen(e.target.value); setIncognita("VF"); setUsarI(false); }} options={[{ value: "simple", label: "Simple" }, { value: "compuesto", label: "Compuesto" }, { value: "continuo", label: "Continuo" }]} />
        </Campo>
        <Campo label="Incógnita a calcular">
          <Selector value={incognita} onChange={(e) => { setIncognita(e.target.value); if (e.target.value === "I") setUsarI(false); }} options={incognitasDisponibles} />
        </Campo>

        {incognita !== "I" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, margin: "8px 0 12px" }}>
            <input type="checkbox" checked={usarI} onChange={(e) => setUsarI(e.target.checked)} />
            Tengo <strong>I (interés / ganancia neta)</strong> como dato conocido del ejercicio
          </label>
        )}

        {incognita !== "VP" && <Campo label={`Valor Presente (VP) — ${moneda}`} help="VP = valor del dinero en el momento inicial o fecha de referencia."><Entrada value={VP} onChange={(e) => setVP(e.target.value)} placeholder="1.000.000" /></Campo>}
        {incognita !== "VF" && !(usarI && ["i","n","r","t"].includes(incognita)) && <Campo label={`Valor Futuro (VF) — ${moneda}`} help="VF = valor equivalente del dinero en un momento futuro."><Entrada value={VF} onChange={(e) => setVF(e.target.value)} placeholder="1.200.000" /></Campo>}
        {(incognita === "I" ? false : usarI) && <Campo label={`Interés / ganancia neta (I) — ${moneda}`} help="En los ejercicios básicos usamos I = VF − VP."><Entrada value={I} onChange={(e) => setI(e.target.value)} placeholder="200.000" /></Campo>}

        {mostrarTasaTiempo && (regimen === "continuo" ? incognita !== "r" : incognita !== "i") && (
          <Campo label={regimen === "continuo" ? "Tasa continua (r) % anual" : regimen === "compuesto" ? "Valor de la tasa (%)" : "Tasa de interés (i) % por período"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} placeholder="2,00" />
          </Campo>
        )}

        {mostrarTasaTiempo && regimen === "compuesto" && incognita !== "i" && (
          <div style={{ padding: 12, border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 14, background: C.paper }}>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>En interés compuesto puedes ingresar cualquier tasa: la herramienta la convierte sola a efectiva vencida del periodo de la operación.</div>
            <EditorTasa valor={tasaDef} onChange={setTasaDef} conValor={false} />
          </div>
        )}
        {mostrarTasaTiempo && regimen !== "continuo" && (
          <Campo label={regimen === "compuesto" ? "Período de la operación (en el que se mide n)" : "Período de la tasa"} help={regimen === "compuesto" ? "La tasa se convierte automáticamente a efectiva vencida de este período." : "En simple la tasa tiene periodicidad, pero los intereses no se capitalizan."}>
            <Selector value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} options={PERIODICIDADES.map((p) => ({ value: p.value, label: p.label }))} />
            {periodicidad === "personalizada" && <div style={{ marginTop: 8 }}><span style={{ fontSize: 12.5, color: C.slate }}>¿Cada cuántos meses se aplica la tasa?</span><Entrada value={nPersonalizado} onChange={(e) => setNPersonalizado(e.target.value)} placeholder="5" style={{ marginTop: 4 }} /></div>}
            <div style={{ marginTop: 7, fontSize: 12, color: C.slate }}>
              {periodicidad === "personalizada" ? `La tasa se aplica ${nombrePeriodo}.` : `1 período ${periodicidad === "anual" ? "anual" : periodicidad} = ${mesesPeriodoVista} ${mesesPeriodoVista === 1 ? "mes" : "meses"}.`}
            </div>
          </Campo>
        )}

        {mostrarTasaTiempo && (regimen === "continuo" ? incognita !== "t" : incognita !== "n") && (
          <Campo label={regimen === "continuo" ? "Tiempo total → t (años)" : "Tiempo total → se convierte a n períodos"}>
            <div style={{ display: "flex", gap: 8 }}><Entrada value={anios} onChange={(e) => setAnios(e.target.value)} placeholder="Años" /><Entrada value={meses} onChange={(e) => setMeses(e.target.value)} placeholder="Meses" /></div>
            <div style={{ marginTop: 7, fontSize: 12, color: C.slate }}>
              {regimen === "continuo" ? `t = años + meses/12. Aquí no usamos n.` : regimen === "compuesto" ? `n = meses totales ÷ ${mesesPeriodoVista || "meses por período"}. La tasa se convierte automáticamente a efectiva vencida del período de la operación.` : `n = meses totales ÷ ${mesesPeriodoVista || "meses por período"}. En interés simple la tasa NO se convierte.`}
            </div>
          </Campo>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Boton variant="gold" onClick={calcular}>Calcular</Boton><Boton variant="outline" onClick={cargarEjemplo}>Cargar ejemplo</Boton></div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: C.danger }}>{error}</div>}
      </Tarjeta>

      <div>
        {!resultado && !error && <Tarjeta style={{ color: C.slate, fontSize: 14, textAlign: "center", padding: 40 }}>Completa los datos y presiona <strong>Calcular</strong>. La herramienta mostrará la fórmula, el reemplazo con la notación de clase y la interpretación.</Tarjeta>}
        {resultado && (
          <Tarjeta>
            <div style={{ fontSize: 13, color: C.slate, marginBottom: 4 }}>Resultado de {resultado.operacion === "credito" ? "crédito" : "inversión"} · interés {resultado.regimen}</div>
            <Etiqueta>{resultado.etiquetaFinal}</Etiqueta>
            <div style={{ fontFamily: F_MONO, fontSize: 30, color: C.navy, fontWeight: 700, marginBottom: 6 }}>
              {resultado.esTiempo ? (resultado.incognita === "n" ? `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 10 : 2)} períodos` : `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 10 : 2)} años`) : resultado.esTasa ? formatPercentCO(resultado.valorFinal, masDecimales ? 10 : 2) : formatCurrencyCO(resultado.valorFinal, moneda, masDecimales ? 10 : 2)}
            </div>
            {resultado.incognita === "n" && resultado.equivalenciaTemporal && <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Equivalencia: {resultado.equivalenciaTemporal.anios} años y {formatNumberCO(resultado.equivalenciaTemporal.meses, 1, 2)} meses</div>}
            <button onClick={() => setMasDecimales(!masDecimales)} style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>{masDecimales ? "Mostrar menos decimales" : "Mostrar más decimales"}</button>

            {Number.isFinite(resultado.interesCalculado) && (
              <div style={{ marginTop: 8, padding: 13, background: C.successBg, borderRadius: 8, color: C.navy, fontSize: 13.5 }}>
                <strong>{resultado.operacion === "credito" ? "Intereses pagados (I)" : "Ganancia neta / intereses (I)"}:</strong> {formatCurrencyCO(resultado.interesCalculado, moneda, masDecimales ? 10 : 2)}
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>I = VF − VP = {formatCurrencyCO(resultado.vfFinal, moneda, masDecimales ? 10 : 2)} − {formatCurrencyCO(resultado.vpFinal, moneda, masDecimales ? 10 : 2)}</div>
              </div>
            )}

            <div style={{ fontSize: 13.5, color: C.ink, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
              <strong>Interpretación financiera:</strong> {resultado.operacion === "credito"
                ? `Desde la perspectiva del cliente, VP es el capital recibido y VF es el valor equivalente a pagar. I muestra cuánto corresponde a intereses.`
                : `VP es el capital invertido, VF es el valor alcanzado y I muestra únicamente la ganancia generada por intereses.`}
            </div>
            {resultado.convResumen && (
              <div style={{ marginTop: 10, padding: 13, background: C.paperDark, borderRadius: 8, fontSize: 13, color: C.navy, lineHeight: 1.6 }}>
                <strong>Tasa ingresada:</strong> {resultado.convResumen.entrada}.<br />
                <strong>Tasa efectiva vencida final ({resultado.convResumen.periodo}):</strong> {resultado.convResumen.final}. Es la que entra en la fórmula de interés compuesto.
              </div>
            )}
            <Verificacion ok={resultado.verifOk} residual={resultado.residual} />
            <Acordeon title="Ver procedimiento completo — con variables de clase">
              <FichaProcedimiento pasos={[...resultado.pasos, { label: "Resultado sin redondear", content: String(resultado.valorFinal) }, { label: "Resultado presentado", content: resultado.esTiempo ? formatNumberCO(resultado.valorFinal, 2, masDecimales ? 10 : 4) : resultado.esTasa ? formatPercentCO(resultado.valorFinal, masDecimales ? 10 : 4) : formatCurrencyCO(resultado.valorFinal, moneda, masDecimales ? 10 : 2) }]} />
            </Acordeon>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SIMULAR — MODO AVANZADO (múltiples flujos)
   Alineado con los ejercicios de clase: Valor Presente 1, Valor
   Presente 2, desembolsos adicionales y Valor Futuro, con
   periodicidad configurable y momentos ingresados en años y meses.
   ============================================================ */
let flujoIdSeq = 1;

const ROLES_FLUJO = [
  { value: "VP1", label: "Valor Presente 1" },
  { value: "VP2", label: "Valor Presente 2" },
  { value: "VP3", label: "Valor Presente 3" },
  { value: "desembolso", label: "Desembolso adicional" },
  { value: "pago", label: "Pago / Cuota" },
  { value: "retiro", label: "Retiro" },
  { value: "VF", label: "Valor Futuro (resultado)" },
  { value: "otro", label: "Otro (personalizado)" },
];

function etiquetaRol(f) {
  if (f.rol === "otro") return f.descripcionPersonalizada || "Flujo personalizado";
  const r = ROLES_FLUJO.find((x) => x.value === f.rol);
  return r ? r.label : "Flujo";
}

function nuevoFlujo(overrides) {
  return {
    id: flujoIdSeq++,
    rol: "desembolso",
    descripcionPersonalizada: "",
    monto: "",
    anios: "0",
    meses: "0",
    direccion: "entrada",
    esIncognitaMonto: false,
    esIncognitaMomento: false,
    coeficiente: "1",
    ...overrides,
  };
}

function SimularAvanzado({ moneda, onGuardarHistorial }) {
  const [operacion, setOperacion] = useState("inversion");
  const [regimen, setRegimen] = useState("compuesto");
  const [tasaPct, setTasaPct] = useState("3");
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [nPersonalizado, setNPersonalizado] = useState("3");
  const [focalAnios, setFocalAnios] = useState("0");
  const [focalMeses, setFocalMeses] = useState("6");
  const [objetivo, setObjetivo] = useState("0");
  const [interesConocido, setInteresConocido] = useState("");
  const [tipoIncognita, setTipoIncognita] = useState("monto"); // monto | momento | tasa
  const [tasaDef, setTasaDef] = useState({ tipo: "efectiva", modalidad: "vencida", periodo: "mensual", meses: "5" });
  const [flujos, setFlujos] = useState([
    nuevoFlujo({ rol: "VP1", monto: "10000000", anios: "0", meses: "0", direccion: "salida" }),
    nuevoFlujo({ rol: "VF", monto: "", anios: "0", meses: "6", direccion: "entrada", esIncognitaMonto: true }),
  ]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [masDecimales, setMasDecimales] = useState(false);

  function actualizar(id, campo, valor) {
    setFlujos((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }
  function agregarFlujo() {
    setFlujos((fs) => [...fs, nuevoFlujo({ rol: fs.length === 1 ? "VP2" : "desembolso" })]);
  }
  function eliminarFlujo(id) { setFlujos((fs) => fs.filter((f) => f.id !== id)); }

  // Meses por periodo según la periodicidad elegida (no aplica en continuo: ahí el tiempo siempre es en años)
  function obtenerMesesPorPeriodo() {
    if (regimen === "continuo") return null;
    const perio = PERIODICIDADES.find((p) => p.value === periodicidad);
    return periodicidad === "personalizada" ? parseFloat(nPersonalizado) : perio.meses;
  }

  // Convierte los años/meses de un flujo (o del momento focal) al "momento" en la unidad del régimen:
  // periodos (simple/compuesto) o años decimales (continuo).
  function momentoDeAniosMeses(anios, meses, mesesPorPeriodo) {
    return regimen === "continuo"
      ? yearsMonthsToDecimalYears(anios, meses)
      : convertTimeToPeriods(anios, meses, mesesPorPeriodo);
  }

  function resolver() {
    setError(""); setResultado(null);
    let tasa = parseFloat(String(tasaPct).replace(",", ".")) / 100;
    const target = parseFloat(String(objetivo).replace(",", ".")) || 0;

    let mesesPorPeriodo = 1;
    if (regimen !== "continuo") {
      mesesPorPeriodo = obtenerMesesPorPeriodo();
      if (!mesesPorPeriodo || mesesPorPeriodo <= 0) { setError("Ingresa cuántos meses tiene el periodo personalizado."); return; }
    }

    const focalA = parseFloat(focalAnios) || 0, focalM = parseFloat(focalMeses) || 0;
    if (focalA < 0 || focalM < 0) { setError("El momento focal no puede ser negativo."); return; }
    const focal = momentoDeAniosMeses(focalA, focalM, mesesPorPeriodo);

    const marcadosMonto = flujos.filter((f) => f.esIncognitaMonto);
    const marcadosMomento = flujos.filter((f) => f.esIncognitaMomento);

    if (tipoIncognita === "monto" && marcadosMonto.length < 1) { setError("Marca al menos un flujo con monto desconocido. Si varios flujos dependen de la misma X, márcalos y usa sus coeficientes (por ejemplo 1·X y 1,4·X)."); return; }
    if (tipoIncognita === "momento" && marcadosMomento.length !== 1) { setError("Marca exactamente un flujo con momento desconocido."); return; }
    for (const f of flujos) {
      const a = parseFloat(f.anios) || 0, m = parseFloat(f.meses) || 0;
      if (a < 0 || m < 0) { setError(`El tiempo de "${etiquetaRol(f)}" no puede ser negativo.`); return; }
      if ((f.anios === "" || f.meses === "") && !(tipoIncognita === "momento" && f.esIncognitaMomento)) {
        setError(`Ingresa el momento (años y meses) de "${etiquetaRol(f)}".`); return;
      }
    }

    const pasosConversion = [];
    // Interés compuesto: conversión automática con el motor central (no aplica a simple ni continuo).
    if (regimen === "compuesto" && tipoIncognita !== "tasa") {
      const tasaIngresada = parseNumCO(tasaPct);
      if (!Number.isFinite(tasaIngresada)) { setError("La tasa ingresada debe ser numérica."); return; }
      try {
        const conv = convertirTasaAPeriodoOperacion({
          tasaPct: tasaIngresada, tipoEntrada: tasaDef.tipo, modalidadEntrada: tasaDef.modalidad, periodoEntrada: tasaDef.periodo,
          mesesEntradaPersonalizados: parseNumCO(tasaDef.meses), periodoOperacion: "personalizado_meses", mesesOperacionPersonalizados: mesesPorPeriodo,
        });
        tasa = conv.iEfectivaVencida;
        pasosConversion.push({ label: "Tasa ingresada (conversión automática, solo interés compuesto)", content: descripcionTasa({ tasaPct: tasaIngresada, tipo: tasaDef.tipo, modalidad: tasaDef.modalidad, periodo: tasaDef.periodo, meses: tasaDef.meses }) });
        conv.pasos.slice(1, -1).forEach((p) => pasosConversion.push({ label: `Conversión — ${p.label}`, content: p.content }));
        pasosConversion.push({ label: "Tasa efectiva vencida final usada", content: `i = ${formatPercentCO(tasa, 4)} efectiva vencida del periodo de los flujos. Esta es la tasa que entra en la ecuación de valor.` });
      } catch (e) { setError(e.message); return; }
    } else if (regimen === "compuesto") {
      pasosConversion.push({ label: "Tasa como incógnita (interés compuesto)", content: "No hay conversión automática porque la tasa es lo que se despeja. El resultado queda como tasa efectiva vencida del periodo seleccionado." });
    }
    pasosConversion.push({
      label: "Periodicidad de la tasa",
      content: regimen === "continuo" ? "No aplica (interés continuo: el tiempo se expresa siempre en años)" : `${PERIODICIDADES.find((p) => p.value === periodicidad)?.label}${periodicidad === "personalizada" ? ` (cada ${mesesPorPeriodo} meses)` : ""}`,
    });
    pasosConversion.push({
      label: "Momento focal",
      content: regimen === "continuo"
        ? `${focalA} años y ${focalM} meses = ${formatNumberCO(focal, 2, 4)} años`
        : `${focalA} años y ${focalM} meses = ${focalA * 12 + focalM} meses → ${focalA * 12 + focalM}/${mesesPorPeriodo} = ${formatNumberCO(focal, 2, 4)} periodos`,
    });

    const flowsBase = flujos.map((f) => {
      const a = parseFloat(f.anios) || 0, m = parseFloat(f.meses) || 0;
      const momento = (tipoIncognita === "momento" && f.esIncognitaMomento) ? 0 : momentoDeAniosMeses(a, m, mesesPorPeriodo);
      if (!(tipoIncognita === "momento" && f.esIncognitaMomento)) {
        pasosConversion.push({
          label: etiquetaRol(f),
          content: regimen === "continuo"
            ? `${a} años y ${m} meses = ${formatNumberCO(momento, 2, 4)} años`
            : `${a} años y ${m} meses = ${a * 12 + m} meses → ${a * 12 + m}/${mesesPorPeriodo} = ${formatNumberCO(momento, 2, 4)} periodos`,
        });
      } else {
        pasosConversion.push({ label: etiquetaRol(f), content: "Momento desconocido (incógnita a despejar)" });
      }
      return {
        rol: f.rol,
        etiqueta: etiquetaRol(f),
        monto: parseFloat(String(f.monto).replace(",", ".")) || 0,
        momento,
        signo: f.direccion === "entrada" ? 1 : -1,
        esIncognita: tipoIncognita === "monto" && f.esIncognitaMonto,
        coeficiente: parseFloat(String(f.coeficiente).replace(",", ".")) || 1,
      };
    });

    // Construye el procedimiento matemático completo de la ecuación de valor.
    // No muestra solo una suma de entradas menos salidas: enseña qué fórmula se aplica a cada flujo.
    const formulaGeneralTraslado = regimen === "simple"
      ? "Hacia el futuro: VF = VP·(1+i·n). Hacia el pasado: VP = VF/(1+i·n)."
      : regimen === "compuesto"
        ? "Hacia el futuro: VF = VP·(1+i)^n. Hacia el pasado: VP = VF/(1+i)^n."
        : "Hacia el futuro: VF = VP·e^(r·t). Hacia el pasado: VP = VF·e^(−r·t).";

    const expresionMonto = (f, usarX = true) => {
      if (usarX && f.esIncognita) {
        const c = Number.isFinite(f.coeficiente) ? f.coeficiente : 1;
        return Math.abs(c - 1) < 1e-12 ? "X" : `${formatNumberCO(c, 0, 6)}·X`;
      }
      return formatNumberCO(f.monto, 2, 2);
    };

    const expresionTraslado = (f, usarX = true, tasaUsada = tasa) => {
      const base = expresionMonto(f, usarX);
      const delta = focal - f.momento;
      const ad = Math.abs(delta);
      if (Math.abs(delta) < 1e-12) return base;
      if (regimen === "simple") {
        return delta > 0
          ? `${base}·(1 + ${formatNumberCO(tasaUsada, 6, 8)}·${formatNumberCO(ad, 2, 6)})`
          : `${base}/(1 + ${formatNumberCO(tasaUsada, 6, 8)}·${formatNumberCO(ad, 2, 6)})`;
      }
      if (regimen === "compuesto") {
        return delta > 0
          ? `${base}·(1 + ${formatNumberCO(tasaUsada, 6, 8)})^${formatNumberCO(ad, 2, 6)}`
          : `${base}/(1 + ${formatNumberCO(tasaUsada, 6, 8)})^${formatNumberCO(ad, 2, 6)}`;
      }
      return delta > 0
        ? `${base}·e^(${formatNumberCO(tasaUsada, 6, 8)}·${formatNumberCO(ad, 2, 6)})`
        : `${base}·e^(−${formatNumberCO(tasaUsada, 6, 8)}·${formatNumberCO(ad, 2, 6)})`;
    };

    const pasosFormulasFlujos = flowsBase.map((f, idx) => {
      const delta = focal - f.momento;
      const ad = Math.abs(delta);
      const dir = Math.abs(delta) < 1e-12 ? "ya está en el momento focal" : delta > 0 ? "lo llevamos hacia el futuro" : "lo traemos hacia el pasado";
      const signoTxt = f.signo === 1 ? "Entrada" : "Salida";
      const simboloEq = delta > 0 ? `VF${idx + 1}` : delta < 0 ? `VP${idx + 1}` : `${f.etiqueta}_focal`;
      const factor = trasladoFlujo(1, f.momento, focal, regimen, tasa);
      let desarrollo;
      if (Math.abs(delta) < 1e-12) {
        desarrollo = `${simboloEq} = ${expresionMonto(f, true)} (ya está en el momento focal)`;
      } else if (regimen === "simple") {
        desarrollo = delta > 0
          ? `${simboloEq} = ${expresionMonto(f, true)}(1 + i·n) = ${expresionMonto(f, true)}(1 + ${procRaw(tasa)}·${procRaw(ad)})`
          : `${simboloEq} = ${expresionMonto(f, true)}/(1 + i·n) = ${expresionMonto(f, true)}/(1 + ${procRaw(tasa)}·${procRaw(ad)})`;
      } else if (regimen === "compuesto") {
        desarrollo = delta > 0
          ? `${simboloEq} = ${expresionMonto(f, true)}(1+i)^n = ${expresionMonto(f, true)}(1+${procRaw(tasa)})^${procRaw(ad)}`
          : `${simboloEq} = ${expresionMonto(f, true)}/(1+i)^n = ${expresionMonto(f, true)}/(1+${procRaw(tasa)})^${procRaw(ad)}`;
      } else {
        desarrollo = delta > 0
          ? `${simboloEq} = ${expresionMonto(f, true)}e^(r·t) = ${expresionMonto(f, true)}e^(${procRaw(tasa)}·${procRaw(ad)})`
          : `${simboloEq} = ${expresionMonto(f, true)}e^(−r·t) = ${expresionMonto(f, true)}e^(−${procRaw(tasa)}·${procRaw(ad)})`;
      }
      const valorEq = f.esIncognita
        ? `${procRaw(f.coeficiente * factor)}·X`
        : procRaw(f.monto * factor);
      return {
        label: `${simboloEq}: ${f.etiqueta} (${signoTxt})`,
        content: `${dir}. ${desarrollo} = ${valorEq}`,
      };
    });

    const ecuacionExpandida = flowsBase.map((f, idx) => {
      const prefijo = f.signo === 1 ? "+" : "−";
      return `${prefijo} ${expresionTraslado(f, true)}`;
    }).join(" ") + ` = ${procRaw(target)}`;

    const calcularIConFlujos = (flowsMaterializados) => {
      const entradas = flowsMaterializados.filter((f) => f.signo === 1).reduce((acc, f) => acc + f.monto, 0);
      const salidas = flowsMaterializados.filter((f) => f.signo === -1).reduce((acc, f) => acc + f.monto, 0);
      const Icalc = operacion === "inversion" ? entradas - salidas : salidas - entradas;
      return { entradas, salidas, Icalc };
    };

    try {
      let valorHistorial = null;
      let tipoResultadoHistorial = "moneda";

      if (tipoIncognita === "monto") {
        const sol = solveUnknownCashFlow(flowsBase, focal, regimen, tasa, target);
        if (!sol.ok || !validateSolution(sol.value)) {
          throw new Error("Con los datos ingresados no encontramos una solución financiera válida.");
        }
        let total = 0;
        for (const f of flowsBase) {
          total += f.signo * (f.esIncognita ? f.coeficiente * sol.value : f.monto) * trasladoFlujo(1, f.momento, focal, regimen, tasa);
        }
        const residual = total - target;
        const materializados = flowsBase.map((f) => ({ ...f, monto: f.esIncognita ? f.coeficiente * sol.value : f.monto }));
        const resumenI = calcularIConFlujos(materializados);
        const valoresIncognitas = flowsBase
          .filter((f) => f.esIncognita)
          .map((f) => ({ etiqueta: f.etiqueta, coeficiente: f.coeficiente, valor: f.coeficiente * sol.value }));
        const pasosEcuacion = [
          { label: "Procedimiento usado en clase", content: "Llevamos todos los valores al mismo momento focal. Solo después de tenerlos en el mismo momento los sumamos, restamos o despejamos la incógnita." },
          { label: "Fórmula que corresponde al traslado", content: formulaGeneralTraslado },
          ...pasosFormulasFlujos,
          { label: "Planteamos la ecuación de valor", content: ecuacionExpandida },
          { label: "Agrupamos lo conocido y lo que contiene X", content: `Términos conocidos en el momento focal = ${procRaw(sol.knownSum)}. Términos que acompañan a X = ${procRaw(sol.unknownCoefSum)}·X.` },
          { label: "Ecuación reducida", content: `${procRaw(sol.knownSum)} + (${procRaw(sol.unknownCoefSum)})·X = ${procRaw(target)}` },
          { label: "Pasamos lo conocido al otro lado", content: `(${procRaw(sol.unknownCoefSum)})·X = ${procRaw(target)} − (${procRaw(sol.knownSum)}) = ${procRaw(target - sol.knownSum)}` },
          { label: "Despejamos X", content: `X = ${procRaw(target - sol.knownSum)} / ${procRaw(sol.unknownCoefSum)} = ${procRaw(sol.value)}` },
          ...valoresIncognitas.map((v) => ({ label: `Hallamos ${v.etiqueta}`, content: Math.abs(v.coeficiente - 1) < 1e-12 ? `${v.etiqueta} = X = ${procRaw(v.valor)}` : `${v.etiqueta} = ${procRaw(v.coeficiente)}·X = ${procRaw(v.coeficiente)}·(${procRaw(sol.value)}) = ${procRaw(v.valor)}` })),
        ];
        setResultado({
          tipo: "monto", valor: sol.value, residual,
          verifOk: Math.abs(residual) < Math.max(1, Math.abs(sol.value)) * 1e-5,
          focal, tasa, regimen, target, pasosConversion, pasosEcuacion, mesesPorPeriodo, operacion,
          valoresIncognitas,
          interesCalculado: resumenI.Icalc, totalEntradas: resumenI.entradas, totalSalidas: resumenI.salidas,
          interesConocido: parseFloat(String(interesConocido).replace(",", ".")),
          etiquetaIncognita: marcadosMonto.length > 1 ? "X base de flujos relacionados por coeficientes" : etiquetaRol(flujos.find((f) => f.esIncognitaMonto)),
        });
        valorHistorial = sol.value; tipoResultadoHistorial = "moneda";
      } else if (tipoIncognita === "momento") {
        const idx = flujos.findIndex((f) => f.esIncognitaMomento);
        const rangoBusqueda = regimen === "continuo" ? [0, 60] : [0, 600];
        const sol = solveUnknownCashFlowTime(flowsBase, focal, regimen, tasa, target, idx, rangoBusqueda);
        if (!sol.ok) {
          throw new Error("Con los datos ingresados no encontramos una solución financiera válida. Revisa los valores, la tasa y los momentos.");
        }
        const equivalencia = regimen === "continuo" ? periodsToYearsMonths(sol.value, 12) : periodsToYearsMonths(sol.value, mesesPorPeriodo);
        const resumenI = calcularIConFlujos(flowsBase);
        setResultado({
          tipo: "momento", valor: sol.value, residual: sol.residual,
          verifOk: Math.abs(sol.residual) < 1e-4,
          focal, tasa, regimen, target, pasosConversion,
          pasosEcuacion: [{ label: "Procedimiento usado en clase", content: "Llevamos cada flujo al mismo momento focal antes de despejar el momento desconocido." }, { label: "Fórmula que corresponde al traslado", content: formulaGeneralTraslado }, ...pasosFormulasFlujos, { label: "Planteamos la ecuación de valor", content: ecuacionExpandida }],
          mesesPorPeriodo, equivalencia, operacion,
          interesCalculado: resumenI.Icalc, totalEntradas: resumenI.entradas, totalSalidas: resumenI.salidas,
          interesConocido: parseFloat(String(interesConocido).replace(",", ".")),
          etiquetaIncognita: etiquetaRol(flujos.find((f) => f.esIncognitaMomento)),
        });
        valorHistorial = sol.value; tipoResultadoHistorial = "tiempo";
      } else {
        const sol = solveUnknownRateMultiFlow(flowsBase, focal, regimen, target);
        if (!sol.ok) {
          throw new Error("Con los datos ingresados no encontramos una tasa que satisfaga la ecuación de valor.");
        }
        const resumenI = calcularIConFlujos(flowsBase);
        setResultado({
          tipo: "tasa", valor: sol.value, residual: sol.residual,
          verifOk: Math.abs(sol.residual) < 1e-4,
          focal, regimen, target, pasosConversion,
          pasosEcuacion: [{ label: "Fórmulas de traslado", content: formulaGeneralTraslado }, ...pasosFormulasFlujos, { label: "Ecuación de valor desarrollada", content: ecuacionExpandida }],
          mesesPorPeriodo, operacion,
          interesCalculado: resumenI.Icalc, totalEntradas: resumenI.entradas, totalSalidas: resumenI.salidas,
          interesConocido: parseFloat(String(interesConocido).replace(",", ".")),
        });
        valorHistorial = sol.value; tipoResultadoHistorial = "tasa";
      }

      onGuardarHistorial({
        tipo: "avanzado", regimen, operacion, incognita: tipoIncognita,
        resultado: valorHistorial, resultadoTipo: tipoResultadoHistorial, moneda,
      });
    } catch (e) {
      setError(e.message);
    }
  }

  const mesesPorPeriodoActual = obtenerMesesPorPeriodo();
  function momentoParaTimeline(f) {
    const a = parseFloat(f.anios) || 0, m = parseFloat(f.meses) || 0;
    return momentoDeAniosMeses(a, m, mesesPorPeriodoActual || 1);
  }
  const focalParaTimeline = momentoDeAniosMeses(parseFloat(focalAnios) || 0, parseFloat(focalMeses) || 0, mesesPorPeriodoActual || 1);
  const maxMomento = Math.max(focalParaTimeline, ...flujos.map((f) => momentoParaTimeline(f)), 1);

  return (
    <div>
      <Tarjeta style={{ marginBottom: 20 }}>
        <Etiqueta>Motor general de ecuaciones de valor</Etiqueta>
        <p style={{ fontSize: 13.5, color: C.slate, margin: "0 0 16px" }}>
          Para comparar cantidades de dinero ubicadas en momentos diferentes (ej. Valor Presente 1, Valor Presente 2 y Valor Futuro) las llevamos a un mismo momento focal y construimos una ecuación de valor. En interés simple y continuo la tasa y el tiempo deben quedar en la misma unidad y la herramienta NO convierte tasas. En interés compuesto, cuando la incógnita no es la tasa, la herramienta convierte automáticamente la tasa ingresada a efectiva vencida del periodo de los flujos.
        </p>
        <div style={{ padding: 13, background: C.paperDark, borderRadius: 8, fontSize: 12.5, lineHeight: 1.55, color: C.slate, marginBottom: 16 }}>
          <strong style={{ color: C.navy }}>¿Qué significa entrada y salida?</strong><br />
          La dirección se interpreta <strong>desde la perspectiva del cliente</strong>. {operacion === "inversion"
            ? "En una inversión, una SALIDA es dinero que inviertes o aportas y una ENTRADA es dinero que recibes, retiras o recuperas."
            : "En un crédito, una ENTRADA es dinero que recibes del banco (desembolso) y una SALIDA es dinero que pagas al banco (cuotas o pago final)."}
          <div style={{ marginTop: 6 }}><strong>I (interés / ganancia neta)</strong>: en inversión se calcula como entradas − salidas; en crédito como salidas − entradas.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
          <Campo label="Tipo de operación">
            <Selector value={operacion} onChange={(e) => setOperacion(e.target.value)} options={[{ value: "credito", label: "Crédito" }, { value: "inversion", label: "Inversión" }]} />
          </Campo>
          <Campo label="Régimen">
            <Selector value={regimen} onChange={(e) => setRegimen(e.target.value)} options={[{ value: "simple", label: "Simple" }, { value: "compuesto", label: "Compuesto" }, { value: "continuo", label: "Continuo" }]} />
          </Campo>
          <Campo label={regimen === "continuo" ? "Tasa continua r (% anual)" : regimen === "compuesto" ? "Valor de la tasa (%)" : "Tasa i (% por periodo)"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} disabled={tipoIncognita === "tasa"} />
          </Campo>
          {regimen !== "continuo" && (
            <Campo label={regimen === "compuesto" ? "Periodo de los flujos (al que se convierte la tasa)" : "Periodicidad de la tasa"}>
              <Selector value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} options={PERIODICIDADES.map((p) => ({ value: p.value, label: p.label }))} />
            </Campo>
          )}
          {regimen !== "continuo" && periodicidad === "personalizada" && (
            <Campo label="¿Cada cuántos meses?">
              <Entrada value={nPersonalizado} onChange={(e) => setNPersonalizado(e.target.value)} placeholder="5" />
            </Campo>
          )}
          <Campo label="Incógnita">
            <Selector value={tipoIncognita} onChange={(e) => setTipoIncognita(e.target.value)}
              options={[{ value: "monto", label: "Valor de un flujo" }, { value: "momento", label: "Momento de un flujo" }, { value: "tasa", label: "Tasa de interés" }]} />
          </Campo>
          <Campo label="Momento focal — tiempo total">
            <div style={{ display: "flex", gap: 8 }}>
              <Entrada value={focalAnios} onChange={(e) => setFocalAnios(e.target.value)} placeholder="Años" />
              <Entrada value={focalMeses} onChange={(e) => setFocalMeses(e.target.value)} placeholder="Meses" />
            </div>
          </Campo>
          <Campo label="Valor objetivo en el momento focal" help="0 = equilibrio (entradas = salidas)">
            <Entrada value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
          </Campo>
          <Campo label={`I conocido — ${moneda} (opcional)`} help="Si el enunciado te da la ganancia neta o los intereses totales, puedes registrarlos aquí. La herramienta comparará este dato con el I calculado a partir de los flujos.">
            <Entrada value={interesConocido} onChange={(e) => setInteresConocido(e.target.value)} placeholder="Ej. 332.500" />
          </Campo>
        </div>
        {regimen === "compuesto" && tipoIncognita !== "tasa" && (
          <div style={{ marginTop: 14, padding: 12, border: `1px solid ${C.line}`, borderRadius: 8, background: C.paper }}>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Conversión automática (solo interés compuesto): ingresa cualquier tasa y la herramienta la convierte a efectiva vencida del periodo de los flujos. En interés simple y continuo no se convierte.</div>
            <EditorTasa valor={tasaDef} onChange={setTasaDef} conValor={false} />
          </div>
        )}
        {regimen === "compuesto" && tipoIncognita === "tasa" && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.slate }}>La tasa es la incógnita: no se hace conversión automática. El resultado será una tasa efectiva vencida del periodo seleccionado.</div>
        )}
      </Tarjeta>

      <Tarjeta style={{ marginBottom: 20 }}>
        <Etiqueta>Flujos de dinero (Valor Presente 1, Valor Presente 2, desembolsos, Valor Futuro...)</Etiqueta>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.slate, fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: 6 }}>Rol</th><th style={{ padding: 6 }}>Monto</th><th style={{ padding: 6 }}>Momento (años y meses)</th>
                <th style={{ padding: 6 }}>Dirección</th><th style={{ padding: 6 }}>Coef. (×flujo)</th><th style={{ padding: 6 }}>¿Desconocido?</th><th />
              </tr>
            </thead>
            <tbody>
              {flujos.map((f) => (
                <tr key={f.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: 6 }}>
                    <Selector value={f.rol} onChange={(e) => actualizar(f.id, "rol", e.target.value)} options={ROLES_FLUJO} style={{ ...selectStyle, minWidth: 170 }} />
                    {f.rol === "otro" && (
                      <Entrada value={f.descripcionPersonalizada} onChange={(e) => actualizar(f.id, "descripcionPersonalizada", e.target.value)} placeholder="Nombre del flujo" style={{ marginTop: 6, minWidth: 150 }} />
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    {(tipoIncognita === "monto" && f.esIncognitaMonto) ? <span style={{ fontFamily: F_MONO, color: C.gold }}>{f.coeficiente}·X</span>
                      : <Entrada value={f.monto} onChange={(e) => actualizar(f.id, "monto", e.target.value)} style={{ minWidth: 100 }} />}
                  </td>
                  <td style={{ padding: 6 }}>
                    {(tipoIncognita === "momento" && f.esIncognitaMomento) ? <span style={{ fontFamily: F_MONO, color: C.gold }}>? años / ? meses</span>
                      : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Entrada value={f.anios} onChange={(e) => actualizar(f.id, "anios", e.target.value)} placeholder="Años" style={{ minWidth: 60 }} />
                          <Entrada value={f.meses} onChange={(e) => actualizar(f.id, "meses", e.target.value)} placeholder="Meses" style={{ minWidth: 60 }} />
                        </div>
                      )}
                  </td>
                  <td style={{ padding: 6 }}>
                    <Selector value={f.direccion} onChange={(e) => actualizar(f.id, "direccion", e.target.value)} options={[{ value: "entrada", label: "Entrada ↑" }, { value: "salida", label: "Salida ↓" }]} style={{ ...selectStyle, minWidth: 100 }} />
                  </td>
                  <td style={{ padding: 6 }}><Entrada value={f.coeficiente} onChange={(e) => actualizar(f.id, "coeficiente", e.target.value)} style={{ minWidth: 60 }} /></td>
                  <td style={{ padding: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <input type="checkbox" checked={tipoIncognita === "monto" ? f.esIncognitaMonto : f.esIncognitaMomento}
                        disabled={tipoIncognita === "tasa"}
                        onChange={(e) => actualizar(f.id, tipoIncognita === "monto" ? "esIncognitaMonto" : "esIncognitaMomento", e.target.checked)} />
                      {tipoIncognita === "monto" ? "Monto" : tipoIncognita === "momento" ? "Momento" : "—"}
                    </label>
                  </td>
                  <td style={{ padding: 6 }}><button onClick={() => eliminarFlujo(f.id)} aria-label="Eliminar flujo" style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color={C.danger} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Boton small variant="outline" onClick={agregarFlujo} style={{ marginTop: 12 }}><Plus size={14} /> Agregar flujo</Boton>
        <div style={{ marginTop: 10, fontSize: 12, color: C.slate, lineHeight: 1.55 }}>
          Ingresa el momento de cada flujo en años y meses; la herramienta lo convierte automáticamente {regimen === "continuo" ? "a t en años decimales" : "a n, el número de períodos según la periodicidad elegida arriba"}.<br />
          <strong>Coeficientes:</strong> si un enunciado dice “el segundo desembolso fue 1,4 veces el primero”, marca ambos montos como desconocidos y usa coeficientes 1 y 1,4. La herramienta resolverá una sola X y aplicará cada coeficiente.
        </div>

        {/* Línea de tiempo visual */}
        <div style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Línea de tiempo</div>
          <div style={{ position: "relative", height: 70, background: C.paper, borderRadius: 8 }}>
            <div style={{ position: "absolute", left: 20, right: 20, top: 35, height: 2, background: C.line }} />
            {flujos.map((f) => {
              const m = momentoParaTimeline(f);
              const pct = 20 + (m / maxMomento) * 60;
              const esIn = f.direccion === "entrada";
              return (
                <div key={f.id} title={`${etiquetaRol(f)} · ${f.anios} años y ${f.meses} meses`} style={{ position: "absolute", left: `${pct}%`, top: esIn ? 6 : 38, transform: "translateX(-50%)", textAlign: "center" }}>
                  {esIn ? <ArrowUp size={16} color={C.success} /> : <ArrowDown size={16} color={C.danger} />}
                  <div style={{ fontSize: 9.5, color: C.slate, whiteSpace: "nowrap" }}>{etiquetaRol(f)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Tarjeta>

      <Boton variant="gold" onClick={resolver}>Resolver ecuación de valor</Boton>
      {error && <div style={{ marginTop: 12, fontSize: 13, color: C.danger }}>{error}</div>}

      {resultado && (
        <Tarjeta style={{ marginTop: 20 }}>
          <Etiqueta>Resultado{resultado.etiquetaIncognita ? ` — ${resultado.etiquetaIncognita}` : ""}</Etiqueta>
          <div style={{ fontFamily: F_MONO, fontSize: 28, color: C.navy, fontWeight: 700, marginBottom: 8 }}>
            {resultado.tipo === "monto" && formatCurrencyCO(resultado.valor, moneda, masDecimales ? 10 : 2)}
            {resultado.tipo === "momento" && (resultado.regimen === "continuo" ? `${formatNumberCO(resultado.valor, 2, masDecimales ? 10 : 4)} años` : `${formatNumberCO(resultado.valor, 2, masDecimales ? 10 : 4)} periodos`)}
            {resultado.tipo === "tasa" && formatPercentCO(resultado.valor, masDecimales ? 10 : 4)}
          </div>
          {resultado.tipo === "tasa" && resultado.regimen === "compuesto" && <div style={{ fontSize: 13, color: C.slate, marginBottom: 8 }}>Tasa efectiva vencida del periodo seleccionado para los flujos.</div>}
          <button onClick={() => setMasDecimales(!masDecimales)} style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>{masDecimales ? "Mostrar menos decimales" : "Mostrar más decimales"}</button>
          {resultado.tipo === "monto" && Array.isArray(resultado.valoresIncognitas) && resultado.valoresIncognitas.length > 0 && (
            <div style={{ margin: "12px 0", display: "grid", gap: 8 }}>
              {resultado.valoresIncognitas.map((v, idx) => (
                <div key={`${v.etiqueta}-${idx}`} style={{ padding: 12, background: C.paperDark, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: C.slate }}>{v.etiqueta}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 17, color: C.navy, fontWeight: 700 }}>{formatCurrencyCO(v.valor, moneda, masDecimales ? 10 : 2)}</div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>{formatNumberCO(v.coeficiente, 0, masDecimales ? 10 : 6)} × X</div>
                </div>
              ))}
            </div>
          )}
          {resultado.tipo === "momento" && resultado.equivalencia && (
            <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>
              Equivalencia: {resultado.equivalencia.anios} años y {formatNumberCO(resultado.equivalencia.meses, 1, masDecimales ? 10 : 2)} meses
            </div>
          )}
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>
            Momento focal utilizado: {focalAnios} años y {focalMeses} meses ({formatNumberCO(resultado.focal, 2, masDecimales ? 10 : 4)} {resultado.regimen === "continuo" ? "años (t)" : "períodos (n)"})
          </div>
          {Number.isFinite(resultado.interesCalculado) && (
            <div style={{ margin: "12px 0", padding: 13, background: C.successBg, borderRadius: 8, fontSize: 13.5, color: C.navy }}>
              <strong>{resultado.operacion === "credito" ? "Intereses totales (I)" : "Ganancia neta / intereses (I)"}:</strong> {formatCurrencyCO(resultado.interesCalculado, moneda, masDecimales ? 10 : 2)}
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
                Total entradas nominales: {formatCurrencyCO(resultado.totalEntradas, moneda, masDecimales ? 10 : 2)} · Total salidas nominales: {formatCurrencyCO(resultado.totalSalidas, moneda, masDecimales ? 10 : 2)}.
              </div>
              {Number.isFinite(resultado.interesConocido) && (
                <div style={{ fontSize: 11.5, marginTop: 4, color: Math.abs(resultado.interesConocido - resultado.interesCalculado) < 0.01 ? C.success : C.danger }}>
                  I ingresado: {formatCurrencyCO(resultado.interesConocido, moneda, masDecimales ? 10 : 2)} · diferencia frente al I calculado: {formatCurrencyCO(resultado.interesCalculado - resultado.interesConocido, moneda, masDecimales ? 10 : 2)}.
                </div>
              )}
            </div>
          )}
          <Verificacion ok={resultado.verifOk} residual={resultado.residual} />
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Tipo de operación", content: resultado.operacion === "credito" ? "Crédito" : "Inversión" },
              { label: "Convención de signos", content: resultado.operacion === "credito" ? "Desde el cliente: entrada = dinero recibido del banco; salida = dinero pagado al banco." : "Desde el cliente: salida = dinero invertido/aportado; entrada = dinero recibido/retirado." },
              { label: "Régimen", content: resultado.regimen },
              ...resultado.pasosConversion,
              ...(resultado.pasosEcuacion || []),
              { label: "Objetivo", content: String(resultado.target) },
              { label: "Incógnita", content: resultado.etiquetaIncognita || (resultado.tipo === "tasa" ? "Tasa de interés" : "—") },
              { label: "Resultado sin redondear", content: String(resultado.valor) },
              ...(Number.isFinite(resultado.interesCalculado) ? [{ label: "I — interés / ganancia neta", content: resultado.operacion === "credito" ? `I = salidas − entradas = ${formatCurrencyCO(resultado.interesCalculado, moneda, masDecimales ? 10 : 2)}` : `I = entradas − salidas = ${formatCurrencyCO(resultado.interesCalculado, moneda, masDecimales ? 10 : 2)}` }] : []),
              { label: "Comprobación final", content: `Residual = ${resultado.residual.toExponential(3)}` },
            ]} />
          </Acordeon>
        </Tarjeta>
      )}
    </div>
  );
}

/* ============================================================
   SIMULAR — CALCULADORA DE TASAS Y SIMULADOR DE ANUALIDADES
   Reutilizan el mismo motor de conversión (convertirTasa).
   ============================================================ */
function EditorTasa({ titulo, valor, onChange, conValor = true, opcionesPeriodo = OPC_PERIODOS_TASA, etiquetaValor = "Valor de la tasa (%)" }) {
  const set = (k) => (e) => onChange({ ...valor, [k]: e.target.value });
  return (
    <div>
      {titulo && <Etiqueta>{titulo}</Etiqueta>}
      {conValor && <Campo label={etiquetaValor}><Entrada value={valor.tasa} onChange={set("tasa")} placeholder="24" /></Campo>}
      <Campo label="Tipo de tasa"><Selector value={valor.tipo} onChange={set("tipo")} options={OPC_TIPO_TASA} /></Campo>
      <Campo label="Modalidad"><Selector value={valor.modalidad} onChange={set("modalidad")} options={OPC_MODALIDAD} /></Campo>
      <Campo label={valor.tipo === "nominal" ? "Período de capitalización" : "Período de la tasa"}>
        <Selector value={valor.periodo} onChange={set("periodo")} options={opcionesPeriodo} />
        {valor.periodo === "personalizado_meses" && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 12.5, color: C.slate }}>¿Cada cuántos meses?</span>
            <Entrada value={valor.meses} onChange={set("meses")} placeholder="5" />
          </div>
        )}
      </Campo>
    </div>
  );
}

function CalculadoraTasas({ moneda, onGuardarHistorial }) {
  const [ent, setEnt] = useState({ tasa: "30", tipo: "nominal", modalidad: "anticipada", periodo: "mensual", meses: "5" });
  const [sal, setSal] = useState({ tipo: "efectiva", modalidad: "vencida", periodo: "mensual", meses: "5" });
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  function calcular() {
    setError(""); setRes(null);
    const t = parseNumCO(ent.tasa);
    if (!Number.isFinite(t)) { setError("La tasa ingresada debe ser numérica y no puede estar vacía."); return; }
    try {
      const r = convertirTasa({
        tasaPct: t, tipoEntrada: ent.tipo, modalidadEntrada: ent.modalidad, periodoEntrada: ent.periodo, mesesEntradaPersonalizados: parseNumCO(ent.meses),
        tipoSalida: sal.tipo, modalidadSalida: sal.modalidad, periodoSalida: sal.periodo, mesesSalidaPersonalizados: parseNumCO(sal.meses),
      });
      setRes({ ...r, entrada: descripcionTasa({ tasaPct: t, tipo: ent.tipo, modalidad: ent.modalidad, periodo: ent.periodo, meses: ent.meses }),
        salida: descripcionTasa({ tasaPct: r.resultadoPorcentaje, tipo: sal.tipo, modalidad: sal.modalidad, periodo: sal.periodo, meses: sal.meses }) });
      if (onGuardarHistorial) {
        onGuardarHistorial({
          tipo: "tasas",
          regimen: "conversión",
          operacion: "conversión de tasas",
          incognita: "tasa",
          resultado: r.resultadoDecimal,
          resultadoTipo: "tasa",
          moneda,
          fecha: new Date().toISOString(),
        });
      }
    } catch (e) { setError(e.message || "No fue posible convertir la tasa."); }
  }
  function ejemplo() {
    setEnt({ tasa: "30", tipo: "nominal", modalidad: "anticipada", periodo: "mensual", meses: "5" });
    setSal({ tipo: "efectiva", modalidad: "vencida", periodo: "mensual", meses: "5" });
  }

  return (
    <div>
      <Tarjeta>
        <div style={{ fontSize: 13.5, color: C.slate, marginBottom: 16 }}>
          Convierte cualquier tasa en cualquier otra: nominal o efectiva, vencida o anticipada, con cualquier periodo. Año = 365 días = 52 semanas; quincenal = {QUINCENAS_ANIO} veces al año.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 26 }}>
          <EditorTasa titulo="A · Tasa que tiene" valor={ent} onChange={setEnt} />
          <EditorTasa titulo="B · Tasa que quiere obtener" valor={sal} onChange={setSal} conValor={false} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <Boton variant="gold" onClick={calcular}>Convertir</Boton>
          <Boton variant="outline" onClick={ejemplo}>Cargar ejemplo (30 % NAMA → EM vencida)</Boton>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: C.danger }}>{error}</div>}
      </Tarjeta>
      {res && (
        <Tarjeta style={{ marginTop: 18 }}>
          <Etiqueta>Tasa obtenida</Etiqueta>
          <div style={{ fontFamily: F_MONO, fontSize: 30, color: C.navy, fontWeight: 700, marginBottom: 6 }}>{formatPercentCO(res.resultadoDecimal, 4)}</div>
          <div style={{ fontSize: 13.5, color: C.ink }}><strong>Tasa que tenía:</strong> {res.entrada}</div>
          <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 6 }}><strong>Tasa obtenida:</strong> {res.salida}</div>
          <div style={{ fontSize: 13.5, color: C.slate }}>Efectiva anual intermedia: {formatPercentCO(res.tasaEfectivaAnualIntermedia, 4)}. Es la misma tasa contada de otra forma: el dinero no cambia.</div>
          <Acordeon title="Ver procedimiento completo" defaultOpen><FichaProcedimiento pasos={res.pasosProcedimiento} /></Acordeon>
        </Tarjeta>
      )}
    </div>
  );
}

const OPC_CALCULO_ANUALIDAD = [
  { value: "VP", label: "Valor presente (VP)" },
  { value: "VF", label: "Valor futuro (VF)" },
  { value: "A_desde_VP", label: "Cuota desde VP" },
  { value: "A_desde_VF", label: "Cuota desde VF" },
  { value: "VP_extras", label: "VP con pagos adicionales" },
  { value: "VF_extras", label: "VF con pagos adicionales" },
  { value: "extra_desconocido", label: "Pago adicional desconocido" },
  { value: "A_extras_VP", label: "Cuota con pagos adicionales desde VP" },
  { value: "A_extras_VF", label: "Cuota con pagos adicionales desde VF" },
];

function formulasAnualidad(mod, tipo) {
  const FORMULAS_ANUALIDADES = {
    vencida: {
      VP: "VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]",
      VF: "VF = A × [ ((1 + i)^n − 1) / i ]",
      A_desde_VP: "A = VP / [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]",
      A_desde_VF: "A = VF × [ i / ((1 + i)^n − 1) ]",
      VP_extras: "VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      VF_extras: "VF = A × [ ((1 + i)^n − 1) / i ] + Vp1 × (1 + i)^(n − n1)",
      extra_desconocido: "VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      A_extras_VP: "VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      A_extras_VF: "VF = A × [ ((1 + i)^n − 1) / i ] + Vp1 × (1 + i)^(n − n1)",
    },
    anticipada: {
      VP: "VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]",
      VF: "VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ]",
      A_desde_VP: "A = VP / { (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] }",
      A_desde_VF: "A = VF × [ i / ((1 + i)^n − 1) ] / (1 + i)",
      VP_extras: "VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      VF_extras: "VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ] + Vp1 × (1 + i)^(n − n1)",
      extra_desconocido: "VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      A_extras_VP: "VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Vf1 / (1 + i)^n1",
      A_extras_VF: "VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ] + Vp1 × (1 + i)^(n − n1)",
    },
  };
  return FORMULAS_ANUALIDADES[mod]?.[tipo] || "—";
}

function SimuladorAnualidades({ moneda, onGuardarHistorial }) {
  const [modalidad, setModalidad] = useState("vencida");
  const [tipoCalculo, setTipoCalculo] = useState("A_desde_VP");
  const [baseObj, setBaseObj] = useState("VP");
  const [A, setA] = useState("");
  const [VP, setVP] = useState("30000000");
  const [VF, setVF] = useState("");
  const [nTxt, setNTxt] = useState("24");
  const [periodoCuotas, setPeriodoCuotas] = useState("mensual");
  const [mesesCuotas, setMesesCuotas] = useState("5");
  const [tasaIn, setTasaIn] = useState({ tasa: "30", tipo: "nominal", modalidad: "vencida", periodo: "mensual", meses: "5" });
  const [extras, setExtras] = useState([]);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  const usaExtras = ["VP_extras", "VF_extras", "extra_desconocido", "A_extras_VP", "A_extras_VF"].includes(tipoCalculo);
  const muestraA = ["VP", "VF", "VP_extras", "VF_extras", "extra_desconocido"].includes(tipoCalculo);
  const muestraVP = ["A_desde_VP", "A_extras_VP"].includes(tipoCalculo) || (tipoCalculo === "extra_desconocido" && baseObj === "VP");
  const muestraVF = ["A_desde_VF", "A_extras_VF"].includes(tipoCalculo) || (tipoCalculo === "extra_desconocido" && baseObj === "VF");

  const nuevoExtra = () => ({ id: `${Date.now()}-${Math.random()}`, monto: "", momento: "6", direccion: "salida", desconocido: false });
  const setExtra = (id, patch) => setExtras((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  function calcular() {
    setError(""); setRes(null);
    try {
      const n = parseNumCO(nTxt);
      if (!Number.isInteger(n) || n <= 0) throw new Error("El número de cuotas n debe ser un entero mayor que 0.");
      const t = parseNumCO(tasaIn.tasa);
      if (!Number.isFinite(t)) throw new Error("La tasa ingresada debe ser numérica y no puede estar vacía.");
      const conv = convertirTasaAPeriodoOperacion({
        tasaPct: t, tipoEntrada: tasaIn.tipo, modalidadEntrada: tasaIn.modalidad, periodoEntrada: tasaIn.periodo, mesesEntradaPersonalizados: parseNumCO(tasaIn.meses),
        periodoOperacion: periodoCuotas, mesesOperacionPersonalizados: parseNumCO(mesesCuotas),
      });
      const i = conv.iEfectivaVencida;
      const pagosExtra = extras.map((e) => ({ monto: e.desconocido ? NaN : parseNumCO(e.monto), momento: parseNumCO(e.momento), direccion: e.direccion, desconocido: e.desconocido }));
      const a = parseNumCO(A), vp = parseNumCO(VP), vf = parseNumCO(VF);
      const r = calcularAnualidad({ modalidadAnualidad: modalidad, tipoCalculo, A: a, VP: vp, VF: vf, n, i, pagosExtra, baseObjetivo: baseObj });

      const m = (x) => formatCurrencyCO(x, moneda);
      const m4 = (x) => formatCurrencyCO(x, moneda, 4);
      const f6 = (x) => formatNumberCO(x, 6, 6);
      const perTxt = nombrePeriodoTasa(periodoCuotas, mesesCuotas);
      const etiquetaRes = tipoCalculo === "extra_desconocido" ? "X" : r.etiqueta;
      const iTxt = formatNumberCO(i, 8, 12);
      const tasaLectura = formatPercentCO(i, 4);
      const tasaExacta = formatPercentCO(i, 8);
      const nTxtFormula = formatNumberCO(n, 0, 0);
      const potenciaN = `(1 + ${iTxt})^${nTxtFormula}`;
      const factorVPTexto = modalidad === "anticipada"
        ? `(1 + ${iTxt}) × [((1 + ${iTxt})^${nTxtFormula} − 1) / (${iTxt} × (1 + ${iTxt})^${nTxtFormula})]`
        : `[((1 + ${iTxt})^${nTxtFormula} − 1) / (${iTxt} × (1 + ${iTxt})^${nTxtFormula})]`;
      const factorVFTexto = modalidad === "anticipada"
        ? `[((1 + ${iTxt})^(${nTxtFormula}+1) − (1 + ${iTxt})) / ${iTxt}]`
        : `[((1 + ${iTxt})^${nTxtFormula} − 1) / ${iTxt}]`;
      const factorADesdeVFTexto = modalidad === "anticipada"
        ? `[${iTxt} / ((1 + ${iTxt})^${nTxtFormula} − 1)] / (1 + ${iTxt})`
        : `[${iTxt} / ((1 + ${iTxt})^${nTxtFormula} − 1)]`;
      const signoTxt = (e, primero = false) => {
        if (e.signo < 0) return primero ? "− " : " − ";
        return primero ? "" : " + ";
      };
      const extrasVPFormula = r.trasl.map((e, idx) => `${signoTxt(e, idx === 0)}${m(e.monto)} / (1 + ${iTxt})^${formatNumberCO(e.momento, 0, 6)}`).join("");
      const extrasVFFormula = r.trasl.map((e, idx) => `${signoTxt(e, idx === 0)}${m(e.monto)} × (1 + ${iTxt})^(${nTxtFormula} − ${formatNumberCO(e.momento, 0, 6)})`).join("");
      const extrasVPValores = r.trasl.map((e, idx) => `${signoTxt(e, idx === 0)}${m(Math.abs(e.valor))}`).join("") || "0";
      const objetivoTxt = r.base === "VP" ? m(vp) : m(vf);
      const extrasVPConSigno = extrasVPFormula ? (extrasVPFormula.trimStart().startsWith("−") ? ` ${extrasVPFormula}` : ` + ${extrasVPFormula}`) : "";
      const extrasVFConSigno = extrasVFFormula ? (extrasVFFormula.trimStart().startsWith("−") ? ` ${extrasVFFormula}` : ` + ${extrasVFFormula}`) : "";
      const formulaVisible = tipoCalculo === "extra_desconocido"
        ? formulasAnualidad(modalidad, r.base === "VP" ? "VP_extras" : "VF_extras")
        : tipoCalculo === "A_extras_VP"
          ? formulasAnualidad(modalidad, "VP_extras")
          : tipoCalculo === "A_extras_VF"
            ? formulasAnualidad(modalidad, "VF_extras")
            : formulasAnualidad(modalidad, tipoCalculo);
      const sust = {
        VP: `VP = ${m(a)} × ${factorVPTexto} = ${m(r.valor)}`,
        VF: `VF = ${m(a)} × ${factorVFTexto} = ${m(r.valor)}`,
        A_desde_VP: `A = ${m(vp)} / ${factorVPTexto} = ${m(r.valor)}`,
        A_desde_VF: `A = ${m(vf)} × ${factorADesdeVFTexto} = ${m(r.valor)}`,
        VP_extras: `VP = ${m(a)} × ${factorVPTexto}${extrasVPConSigno} = ${m(r.valor)}`,
        VF_extras: `VF = ${m(a)} × ${factorVFTexto}${extrasVFConSigno} = ${m(r.valor)}`,
        extra_desconocido: r.base === "VP"
          ? `${objetivoTxt} = ${m(a)} × ${factorVPTexto}${extrasVPConSigno} + X × ${f6(r.coef)}  →  X = ${m(r.valor)}`
          : `${objetivoTxt} = ${m(a)} × ${factorVFTexto}${extrasVFConSigno} + X × ${f6(r.coef)}  →  X = ${m(r.valor)}`,
        A_extras_VP: `${m(vp)} = A × ${factorVPTexto}${extrasVPConSigno}  →  A = (${m(vp)} − (${extrasVPValores})) / ${factorVPTexto} = ${m(r.valor)}`,
        A_extras_VF: `${m(vf)} = A × ${factorVFTexto}${extrasVFConSigno}  →  A = (${m(vf)} − (${r.trasl.map((e, idx) => `${signoTxt(e, idx === 0)}${m(Math.abs(e.valor))}`).join("") || "0"})) / ${factorVFTexto} = ${m(r.valor)}`,
      }[tipoCalculo];
      const interp = {
        VP: `Hoy, las ${n} cuotas ${modalidad === "anticipada" ? "anticipadas" : "vencidas"} de ${m(a)} valen ${m(r.valor)}.`,
        VF: `Al final, las ${n} cuotas de ${m(a)} acumulan ${m(r.valor)}.`,
        A_desde_VP: `Para pagar ${m(vp)} en ${n} cuotas, cada cuota debe ser de ${m(r.valor)}. En total se pagan ${m(r.valor * n)}.`,
        A_desde_VF: `Para juntar ${m(vf)} con ${n} cuotas, cada cuota debe ser de ${m(r.valor)}.`,
        VP_extras: `Cuotas más pagos adicionales, todo traído a hoy, valen ${m(r.valor)}.`,
        VF_extras: `Cuotas más pagos adicionales, todo llevado al final, valen ${m(r.valor)}.`,
        extra_desconocido: `Para que la ecuación de valor cuadre en ${r.base === "VP" ? "hoy" : "el final"}, el pago adicional desconocido debe ser de ${m(r.valor)} (en su propio momento).`,
        A_extras_VP: `Con los pagos adicionales ya incluidos, la cuota debe ser de ${m(r.valor)}.`,
        A_extras_VF: `Con los pagos adicionales ya incluidos, la cuota debe ser de ${m(r.valor)}.`,
      }[tipoCalculo];

      const pasos = [
        { label: "1. Tipo de anualidad", content: modalidad === "anticipada" ? "Anticipada (cuota al inicio del periodo)" : "Vencida (cuota al final del periodo)" },
        { label: "2. Qué se calcula", content: r.etiqueta },
        { label: "3. Tasa ingresada", content: descripcionTasa({ tasaPct: t, tipo: tasaIn.tipo, modalidad: tasaIn.modalidad, periodo: tasaIn.periodo, meses: tasaIn.meses }) },
        ...conv.pasos.slice(1).map((p, k) => ({ label: `4.${k + 1} Conversión — ${p.label}`, content: p.content })),
        { label: "5. Tasa efectiva vencida final usada (i)", content: `i = ${tasaExacta} efectiva ${perTxt} vencida (periodo de las cuotas).` },
        { label: "5.1 Precisión del cálculo", content: `Para facilitar la lectura, la tasa puede verse redondeada como ${tasaLectura}. Sin embargo, Numeris calcula con la tasa completa: ${tasaExacta}. Por eso, si se repite el cálculo manualmente con la tasa redondeada, puede aparecer una pequeña diferencia numérica.` },
        { label: "Datos", content: `n = ${n} cuotas (${perTxt})${Number.isFinite(a) && muestraA ? ` · A = ${m(a)}` : ""}${muestraVP ? ` · VP = ${m(vp)}` : ""}${muestraVF ? ` · VF = ${m(vf)}` : ""}` },
        { label: "6. Fórmula usada", content: formulaVisible },
        { label: "7. Sustitución", content: sust },
        { label: "8. Resultado", content: `${etiquetaRes} = ${m4(r.valor)}` },
      ];
      r.trasl.forEach((e, k) => pasos.push({
        label: `10.${k + 1} Pago adicional ${k + 1} (${e.direccion})`,
        content: r.base === "VP"
          ? `${e.signo < 0 ? "−" : "+"} Vf1 / (1 + i)^n1 = ${m(e.monto)} / (1 + ${iTxt})^${formatNumberCO(e.momento, 0, 6)} = ${m(e.valor)} (traído a hoy)`
          : `${e.signo < 0 ? "−" : "+"} Vp1 × (1 + i)^(n − n1) = ${m(e.monto)} × (1 + ${iTxt})^(${nTxtFormula} − ${formatNumberCO(e.momento, 0, 6)}) = ${m(e.valor)} (llevado al final)`,
      }));
      pasos.push({ label: "9. Interpretación", content: interp });
      setRes({ r, pasos, interp, i, etiquetaRes });
      if (onGuardarHistorial) {
        onGuardarHistorial({
          tipo: "anualidad",
          regimen: modalidad,
          operacion: tipoCalculo,
          incognita: etiquetaRes,
          resultado: r.valor,
          resultadoTipo: "moneda",
          moneda,
          fecha: new Date().toISOString(),
        });
      }
    } catch (e) { setError(e.message || "No fue posible calcular."); }
  }

  const ok = res ? Math.abs(res.r.residual) < Math.max(1, Math.abs(res.r.valor)) * 1e-6 : true;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(340px,1.3fr)", gap: 26, alignItems: "start" }}>
      <Tarjeta>
        <Etiqueta>Configuración</Etiqueta>
        <div style={{ padding: 12, background: C.paperDark, borderRadius: 8, fontSize: 12.5, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
          Las anualidades se calculan con interés compuesto porque cada cuota está ubicada en un día diferente del tiempo y se traslada usando factores como (1+i)^n. La tasa que entra a las fórmulas siempre es la efectiva vencida del periodo de las cuotas; la herramienta la convierte sola.
        </div>
        <Campo label="Tipo de anualidad"><Selector value={modalidad} onChange={(e) => setModalidad(e.target.value)} options={[{ value: "vencida", label: "Vencida" }, { value: "anticipada", label: "Anticipada" }]} /></Campo>
        <Campo label="¿Qué desea calcular?"><Selector value={tipoCalculo} onChange={(e) => setTipoCalculo(e.target.value)} options={OPC_CALCULO_ANUALIDAD} /></Campo>
        {tipoCalculo === "extra_desconocido" && (
          <Campo label="Fecha focal de la ecuación" help="Elige si conoces el VP (hoy) o el VF (final).">
            <Selector value={baseObj} onChange={(e) => setBaseObj(e.target.value)} options={[{ value: "VP", label: "Conozco el VP (fecha focal hoy)" }, { value: "VF", label: "Conozco el VF (fecha focal final)" }]} />
          </Campo>
        )}
        {muestraA && <Campo label={`Cuota (A) — ${moneda}`}><Entrada value={A} onChange={(e) => setA(e.target.value)} placeholder="1.000.000" /></Campo>}
        {muestraVP && <Campo label={`Valor presente (VP) — ${moneda}`}><Entrada value={VP} onChange={(e) => setVP(e.target.value)} placeholder="30.000.000" /></Campo>}
        {muestraVF && <Campo label={`Valor futuro (VF) — ${moneda}`}><Entrada value={VF} onChange={(e) => setVF(e.target.value)} placeholder="150.000.000" /></Campo>}
        <Campo label="Número de cuotas (n)"><Entrada value={nTxt} onChange={(e) => setNTxt(e.target.value)} placeholder="24" /></Campo>
        <Campo label="Periodo de las cuotas">
          <Selector value={periodoCuotas} onChange={(e) => setPeriodoCuotas(e.target.value)} options={OPC_PERIODOS_CUOTAS} />
          {periodoCuotas === "personalizado_meses" && (
            <div style={{ marginTop: 8 }}><span style={{ fontSize: 12.5, color: C.slate }}>¿Cada cuántos meses se paga una cuota?</span><Entrada value={mesesCuotas} onChange={(e) => setMesesCuotas(e.target.value)} placeholder="5" /></div>
          )}
        </Campo>
        <EditorTasa titulo="Tasa ingresada" valor={tasaIn} onChange={setTasaIn} />

        {usaExtras && (
          <div style={{ marginTop: 6 }}>
            <Etiqueta>Pagos adicionales</Etiqueta>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
              El momento se mide en periodos de las cuotas (0 = hoy). Las cuotas se toman como salidas: un pago adicional de salida suma y uno de entrada resta.
            </div>
            {extras.map((e, k) => (
              <div key={e.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 10, background: C.paper }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Pago adicional {k + 1}</div>
                {!e.desconocido && <Campo label={`Monto — ${moneda}`}><Entrada value={e.monto} onChange={(ev) => setExtra(e.id, { monto: ev.target.value })} placeholder="5.000.000" /></Campo>}
                <Campo label="Momento (en periodos de las cuotas)"><Entrada value={e.momento} onChange={(ev) => setExtra(e.id, { momento: ev.target.value })} placeholder="6" /></Campo>
                <Campo label="Dirección"><Selector value={e.direccion} onChange={(ev) => setExtra(e.id, { direccion: ev.target.value })} options={[{ value: "salida", label: "Salida" }, { value: "entrada", label: "Entrada" }]} /></Campo>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, marginBottom: 8 }}>
                  <input type="checkbox" checked={e.desconocido} onChange={(ev) => setExtra(e.id, { desconocido: ev.target.checked })} /> Valor desconocido
                </label>
                <Boton small variant="danger" onClick={() => setExtras((xs) => xs.filter((x) => x.id !== e.id))}><Trash2 size={13} /> Quitar</Boton>
              </div>
            ))}
            <Boton small variant="outline" onClick={() => setExtras((xs) => [...xs, nuevoExtra()])}><Plus size={13} /> Agregar pago adicional</Boton>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}><Boton variant="gold" onClick={calcular}>Calcular</Boton></div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: C.danger }}>{error}</div>}
      </Tarjeta>

      <div>
        {!res && !error && <Tarjeta style={{ color: C.slate, fontSize: 14, textAlign: "center", padding: 40 }}>Completa los datos y presiona <strong>Calcular</strong>. Verás la conversión de la tasa, la fórmula, la sustitución y la interpretación.</Tarjeta>}
        {res && (
          <Tarjeta>
            <div style={{ fontSize: 13, color: C.slate, marginBottom: 4 }}>Anualidad {modalidad} · interés compuesto</div>
            <Etiqueta>{res.r.etiqueta}</Etiqueta>
            <div style={{ fontFamily: F_MONO, fontSize: 30, color: C.navy, fontWeight: 700, marginBottom: 6 }}>{formatCurrencyCO(res.r.valor, moneda, 4)}</div>
            <div style={{ fontSize: 13.5, color: C.ink, marginBottom: 8 }}>
              Tasa efectiva vencida usada: <strong>{formatPercentCO(res.i, 8)}</strong> por periodo de cuota.
              <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
                Para lectura puede verse redondeada como {formatPercentCO(res.i, 4)}, pero el cálculo usa la tasa completa.
              </div>
            </div>
            <div style={{ marginTop: 8, padding: 13, background: C.successBg, borderRadius: 8, color: C.navy, fontSize: 13.5 }}><strong>Interpretación:</strong> {res.interp}</div>
            <Verificacion ok={ok} residual={res.r.residual} />
            <Acordeon title="Ver procedimiento completo" defaultOpen><FichaProcedimiento pasos={res.pasos} /></Acordeon>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SIMULAR — CONTENEDOR + HISTORIAL
   (Un único sistema de historial, persistido en localStorage,
   compartido entre el modo básico y el modo avanzado.)
   ============================================================ */
function Simular({ moneda }) {
  const [modo, setModo] = useState("basico");
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const cargar = useCallback(async () => {
    const datos = await cargarHistorial();
    setHistorial(datos);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(entry) {
    await guardarHistorial(entry);
    cargar();
  }

  async function limpiar() {
    await borrarHistorial();
    setHistorial([]);
  }

  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Simulación</Etiqueta>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: 0 }}>Simulador</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Boton small variant={modo === "basico" ? "gold" : "outline"} onClick={() => setModo("basico")}>Interés básico</Boton>
          <Boton small variant={modo === "avanzado" ? "gold" : "outline"} onClick={() => setModo("avanzado")}>Flujos múltiples</Boton>
          <Boton small variant={modo === "tasas" ? "gold" : "outline"} onClick={() => setModo("tasas")}>Calculadora de tasas</Boton>
          <Boton small variant={modo === "anualidades" ? "gold" : "outline"} onClick={() => setModo("anualidades")}>Anualidades</Boton>
          <Boton small variant="ghost" onClick={() => setMostrarHistorial((v) => !v)}>{mostrarHistorial ? "Ocultar historial" : "Ver historial"}</Boton>
        </div>
      </div>

      {mostrarHistorial && (
        <Tarjeta style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Etiqueta>Historial (guardado en este navegador)</Etiqueta>
            {historial.length > 0 && <Boton small variant="danger" onClick={limpiar}><RotateCcw size={13} /> Borrar historial</Boton>}
          </div>
          {historial.length === 0 ? (
            <div style={{ fontSize: 13, color: C.slate }}>Aún no hay cálculos guardados.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {historial.map((h) => (
                <div key={h.id} style={{ fontSize: 12.5, color: C.ink, borderBottom: `1px solid ${C.line}`, paddingBottom: 6 }}>
                  <span style={{ color: C.slate }}>{new Date(h.fecha).toLocaleString("es-CO")}</span> · {h.tipo === "avanzado" ? "Modo avanzado" : h.tipo === "tasas" ? "Conversión de tasas" : h.tipo === "anualidad" ? "Anualidades" : "Modo básico"} · {h.regimen} · <strong>{formatearResultadoHistorial(h)}</strong>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      )}

      {modo === "basico" && <SimularBasico moneda={moneda} onGuardarHistorial={guardar} />}
      {modo === "avanzado" && <SimularAvanzado moneda={moneda} onGuardarHistorial={guardar} />}
      {modo === "tasas" && <CalculadoraTasas moneda={moneda} onGuardarHistorial={guardar} />}
      {modo === "anualidades" && <SimuladorAnualidades moneda={moneda} onGuardarHistorial={guardar} />}
    </Section>
  );
}

/* ============================================================
   COMPARAR
   ============================================================ */
function Comparar({ moneda }) {
  const [capital, setCapital] = useState(1000000);
  const [tasaPct, setTasaPct] = useState(3);
  const [periodos, setPeriodos] = useState(12);

  const datos = useMemo(() => {
    const i = tasaPct / 100;
    const arr = [];
    for (let n = 0; n <= periodos; n++) {
      arr.push({
        n,
        Simple: Math.round(futureValueSimple(capital, i, n)),
        Compuesto: Math.round(futureValueCompound(capital, i, n)),
        Continuo: Math.round(futureValueContinuous(capital, i, n)),
      });
    }
    return arr;
  }, [capital, tasaPct, periodos]);

  const final = datos[datos.length - 1];

  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Comparador</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: "0 0 20px" }}>¿Por qué cambian los resultados?</h1>

      <Tarjeta style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
          <Campo label={`Capital (VP) — ${moneda}`}><Entrada type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} /></Campo>
          <Campo label="Tasa del periodo para comparar (%)"><Entrada type="number" value={tasaPct} onChange={(e) => setTasaPct(Number(e.target.value) || 0)} /></Campo>
          <Campo label="Número de periodos"><Entrada type="number" value={periodos} onChange={(e) => setPeriodos(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></Campo>
        </div>
      </Tarjeta>

      <Tarjeta style={{ marginBottom: 20 }}>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={datos} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
            <XAxis dataKey="n" tick={{ fontSize: 11, fill: C.slate }} label={{ value: "Periodos", position: "insideBottom", offset: -4, fontSize: 11, fill: C.slate }} />
            <YAxis tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v) => formatNumberCO(v, 0, 0)} width={80} />
            <Tooltip formatter={(v) => formatCurrencyCO(v, moneda, 0)} labelFormatter={(l) => `Periodo ${l}`} />
            <Legend />
            <Line type="linear" dataKey="Simple" stroke={C.slate} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Compuesto" stroke={C.navy} strokeWidth={2.4} dot={false} />
            <Line type="monotone" dataKey="Continuo" stroke={C.gold} strokeWidth={2.4} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Tarjeta>

      {final && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 20 }}>
          {[["Simple", final.Simple, C.slate], ["Compuesto", final.Compuesto, C.navy], ["Continuo", final.Continuo, C.gold]].map(([nombre, val, color]) => (
            <Tarjeta key={nombre}>
              <div style={{ fontSize: 12, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{nombre}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 19, color: C.navy, marginTop: 6 }}>{formatCurrencyCO(val, moneda, 0)}</div>
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>Intereses: {formatCurrencyCO(val - capital, moneda, 0)}</div>
            </Tarjeta>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, marginBottom: 16 }}>
        El interés <strong>simple</strong> crece linealmente porque siempre calcula sobre el capital inicial. El interés <strong>compuesto</strong> puede crecer más rápido que el simple porque cada periodo capitaliza sobre el saldo anterior. El interés <strong>continuo</strong> es el límite del compuesto cuando la capitalización ocurre en cada instante, por lo que supera ligeramente al compuesto discreto para la misma tasa nominal.
      </div>
      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 12, color: C.slate }}>
        Esta comparación es educativa y usa una misma tasa del periodo para observar cómo cambian los resultados entre interés simple, compuesto y continuo. La conversión automática de tasas se realiza en el simulador de interés compuesto, en la calculadora de tasas y en el simulador de anualidades.
      </div>
    </Section>
  );
}

/* ============================================================
   GLOSARIO
   ============================================================ */
function Glosario() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Glosario</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: "0 0 22px" }}>Términos clave</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {GLOSARIO.map((g) => (
          <Tarjeta key={g.t}>
            <div style={{ fontFamily: F_MONO, fontWeight: 700, color: C.gold, fontSize: 15, marginBottom: 6 }}>{g.t}</div>
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{g.d}</div>
          </Tarjeta>
        ))}
      </div>
    </Section>
  );
}

/* ============================================================
   INTERACCIONES
   ============================================================ */

const INTERACCIONES_DATA = [
  {
    n: 1,
    titulo: "Diseño inicial y corrección de la lógica financiera",
    prompt: `Estoy construyendo una página que cumpla con los requerimientos del documento que te acabo de enviar, pero necesito que me hagas un prompt para poder subirlo a la aplicación y poder cumplir con todo lo que el documento dice que el trabajo debe tener.`,
    respuesta: `La IA revisó el documento completo del proyecto y generó un prompt detallado para construir Numeris en Emergent. El prompt definió las tres secciones principales: Educación Financiera, Simulación/Cotización e Interacciones con IA.

También especificó las principales capacidades financieras requeridas: interés simple, compuesto y continuo; selección entre crédito e inversión; COP, USD y EUR; cálculo de VP, VF, tasa y tiempo; múltiples flujos de dinero; coeficientes; momento de un flujo desconocido; periodicidades configurables; conversión del tiempo a períodos; ganancia neta; ecuaciones de valor; procedimientos paso a paso; formato numérico colombiano y requisitos técnicos.

La IA señaló además que Numeris no debía limitarse a una calculadora básica y debía poder resolver ejercicios similares a los trabajados durante el primer corte.`,
    problema: `Al probar en Emergent la primera versión de Numeris, identificamos que la periodicidad de la tasa no era suficientemente clara; no se distinguían adecuadamente n y t; la interfaz de interés continuo se parecía demasiado a la de simple y compuesto; y las explicaciones de los ejercicios eran demasiado básicas.
Además, al intentar incorporar todas las mejoras que necesitábamos, encontramos limitaciones en la versión gratuita de Emergent, que no nos permitía completar e integrar los cambios que teníamos planeados. Por esta razón, decidimos buscar otra forma de continuar con el desarrollo de la herramienta.`,
    correccion: `Se envió un video de la primera versión de Numeris a la IA para que analizara visualmente la herramienta y se utilizó un nuevo prompt especificando los problemas detectados. Sin embargo, debido a las limitaciones que encontramos en Emergent, decidimos comenzar nuevamente el desarrollo de Numeris con ayuda de ChatGPT Business y Claude.
Elegimos estas herramientas porque nos permitían trabajar con mayor flexibilidad tanto en la parte financiera como en la programación. ChatGPT Business nos ayudó a revisar las indicaciones del proyecto, organizar las mejoras, comprobar procedimientos y mejorar las explicaciones. Por su parte, Claude nos permitió trabajar directamente sobre el código, revisar archivos extensos, identificar errores y realizar ajustes en la aplicación.
A partir de este proceso se retomaron los problemas identificados en la primera versión y se comenzó a construir una herramienta que respondiera mejor a las necesidades del proyecto.`,
    resultado: `Numeris pasó a diferenciar de manera mucho más clara los tres regímenes de interés y a explicar cómo se relacionan la tasa, el tiempo y los períodos. En interés simple y compuesto utiliza i y n, mientras que en interés continuo utiliza r y t, expresando siempre t en años. También se mejoró la selección de periodicidades y se incorporó una explicación más completa de los procedimientos.`,
    trazabilidad: `En Simulación, al seleccionar interés continuo, las variables disponibles cambian automáticamente: el tiempo se expresa mediante t y la tasa continua mediante r. En interés simple y compuesto se utilizan i y n. También es posible seleccionar claramente la periodicidad y, después de calcular, aparece el botón “Ver procedimiento completo”. En interés continuo, el procedimiento aclara que t siempre se expresa en años.`,
    link: "https://chatgpt.com/share/e/6a91ed48-54c0-8012-a31d-ad9105eb4d9b",
      },
  {
    n: 2,
    titulo: "Crédito, inversión, entradas, salidas y ganancia neta I",
    prompt: `Pero en el codigo no se incluye explicacion de cuando es entrada y salida, ni da la opcion de seleccionar si es credito o inversión. Además debe poder tener la opcion de ingresar I osea la ganancia neta y en los resultados debe aparecer cuanto es este valor, tanto para la simulación avanzada como la basica,  además en la explicación basica debe tener la terminologia o las variables vistas en clase para que sea mucho mas facil remplazar. Estos son algunos de los ejercicios vistos para que te des una idea de que aprendimos en clase.

Te voy adjuntar todo el codigo de app y si quieres cambialo para poder copiar y pegar`,
    respuesta: `La IA analizó el archivo completo App.jsx y los ejercicios de clase proporcionados como referencia. Produjo una nueva versión del código que incorporó selector entre Crédito e Inversión; I como interés o ganancia neta; posibilidad de calcular I o utilizarlo como dato conocido; presentación conjunta de VP, VF e I; interpretación de I según el tipo de operación; uso consistente de VP, VF, i, n, r, t e I; explicación de entradas y salidas; y mejora del sistema de coeficientes entre flujos.

Además detectó que el código anterior permitía escribir coeficientes, pero no manejaba correctamente situaciones donde varios flujos dependían de la misma incógnita X.`,
    problema: `La versión anterior no diferenciaba claramente entre crédito e inversión; no explicaba cuándo un flujo debía considerarse entrada o salida; no incorporaba I como variable visible; no utilizaba consistentemente las variables vistas en clase; y no manejaba correctamente relaciones como X y 1,4X entre varios flujos desconocidos.`,
    correccion: `Se proporcionó a ChatGPT el archivo completo App.jsx para trabajar directamente sobre el código existente. La nueva versión incorporó el selector Crédito/Inversión, Entrada/Salida por flujo, la explicación de la convención desde la perspectiva del cliente, I en modo básico y avanzado, el uso de las variables empleadas en clase y la posibilidad de asociar varios flujos a una misma incógnita X mediante coeficientes.

En inversión: I = Entradas − Salidas.
En crédito: I = Salidas − Entradas.`,
    resultado: `Numeris puede distinguir entre operaciones de crédito e inversión, interpretar correctamente entradas y salidas y mostrar el valor de I tanto en simulaciones básicas como avanzadas. También puede trabajar con relaciones entre flujos como VP₁ = X y VP₂ = 1,4X sin que el usuario tenga que realizar previamente el álgebra.`,
    trazabilidad: `En Simulación aparece un selector para indicar si la operación corresponde a una inversión o a un crédito. En el modo avanzado aparece una explicación sobre cómo interpretar Entradas y Salidas. Además, en los resultados de los modos básico y avanzado se muestra el valor de I y durante la explicación se utilizan variables como VP, VF, i, n, r, t e I.`,
    link: "https://chatgpt.com/share/e/6a91ed48-54c0-8012-a31d-ad9105eb4d9b",
  },
  {
    n: 3,
    titulo: "Procedimientos adaptados al método utilizado en clase",
    prompt: `Los procedimientos son un poco diferentes a como lo desarrollamos en clase. Entonces, para asegurarme o asegurar que la plataforma muestre procedimientos similares a los que vimos en clase, te voy a mandar algunos ejemplos y adécuala a eso, sin alterar nada más, solamente esa parte de la explicación, que sean los procedimientos completos, como los que se vieron en clase.`,
    respuesta: `Se proporcionaron a la IA ejercicios reales de interés sobre interés e interés continuo desarrollados durante la clase. Después de analizarlos, la IA modificó únicamente la sección encargada de mostrar los procedimientos.

Identificó que el método utilizado en clase seguía principalmente esta secuencia: Datos → conversión del tiempo → identificación de períodos/años → fórmula → despeje → sustitución → operaciones → resultado.

En problemas con varios flujos, también identificó que primero se lleva cada valor a un mismo momento focal y después se construye la ecuación de valor.`,
    problema: `Los procedimientos anteriores podían llegar a resultados matemáticamente correctos, pero su desarrollo no se parecía suficientemente a la forma en que los ejercicios eran solucionados durante la clase. Debían mostrar claramente la organización de datos, conversión del tiempo, determinación de n o t, selección de fórmula, despeje, sustitución, traslado de flujos, ecuación de valor, operaciones y resultado final.`,
    correccion: `Se enviaron ejercicios reales de clase como referencia y la IA modificó únicamente la presentación de los procedimientos.

En modo básico se implementó: Datos → conversión del tiempo → fórmula general → despeje algebraico → sustitución de valores → operaciones intermedias → resultado.

En modo avanzado: Datos → momento focal → traslado individual de cada flujo → fórmula correspondiente → sustitución → ecuación de valor → agrupación de términos → despeje → resultado.

Cuando existen relaciones como X y 1,4X, el procedimiento muestra también cómo se obtiene el valor individual de cada flujo después de encontrar X.`,
    resultado: `Los procedimientos de Numeris se asemejan mucho más a los desarrollados manualmente durante la asignatura y siguen el orden utilizado en clase. Esto facilita relacionar lo que aparece en la herramienta con la forma tradicional de solucionar los ejercicios en papel.`,
    trazabilidad: `En Simulación, después de resolver un ejercicio, el usuario puede seleccionar “Ver procedimiento completo”. Este botón despliega un procedimiento detallado utilizando la misma estructura general empleada durante las clases de Matemáticas Financieras.`,
    link: "https://chatgpt.com/share/e/6a91ed48-54c0-8012-a31d-ad9105eb4d9b",
  },
  {
    n: 4,
    titulo: "Precisión decimal y prevención de redondeos intermedios",
    prompt: `Me di cuenta que algunos ejercicios no muestran todos los decimales y esta redondeando inecesariamente, afectando los resultados. Entonces agrega un botón en donde se pueda mostrar más decimales para cada solución sin redindear hasta el resultado final. Sin alterar nada más`,
    respuesta: `La IA modificó el código para separar el valor utilizado internamente para calcular del valor mostrado visualmente al usuario. También agregó el botón “Mostrar más decimales”.

La modificación permitió conservar una mayor precisión durante las operaciones y cambiar únicamente la forma en que se presenta el resultado. La IA indicó que el botón funcionaría tanto en el modo básico como en el avanzado y podría aplicarse a I, VP, VF, tasas, tiempos y flujos desconocidos como X o 1,4X.`,
    problema: `El problema no estaba en las fórmulas financieras utilizadas, sino en el manejo de la precisión numérica. Algunos resultados se mostraban con pocos decimales y existía el riesgo de utilizar aproximaciones demasiado temprano. Además, no existía una forma de observar una mayor cantidad de decimales para comparar la respuesta de Numeris con un procedimiento manual.`,
    correccion: `Se separaron el valor interno utilizado para calcular y el valor formateado mostrado al usuario. El cálculo conserva la mayor precisión posible y el formato convencional se utiliza únicamente para presentar el resultado final. También se agregó el botón “Mostrar más decimales” para inspeccionar una mayor precisión cuando sea necesario.`,
    resultado: `Numeris conserva la precisión durante los cálculos y permite visualizar una mayor cantidad de decimales sin modificar el valor interno. Esto facilita comparar resultados con procedimientos manuales y detectar diferencias producidas únicamente por aproximaciones numéricas.`,
    trazabilidad: `En los resultados del Simulador, tanto en modo básico como avanzado, aparece el botón “Mostrar más decimales”. Al seleccionarlo, el usuario puede visualizar una mayor cantidad de decimales del resultado.`,
    link: "https://chatgpt.com/share/e/6a91ed48-54c0-8012-a31d-ad9105eb4d9b",
  },
  {
    n: 5,
    titulo: "Error numérico detectado: residuo computacional",
    esError: true,
    prompt: `Ya que es un error interno debido al procesador o a la herramienta, quiero que menciones que hay un pequeño error residual cuando se encuentre al momento de calcular cada operación.`,
    respuesta: `La IA analizó el mecanismo de verificación matemática del código y determinó que la función encargada de mostrar la comprobación debía distinguir entre un error financiero real y una diferencia numérica extremadamente pequeña producida por la precisión computacional.

Identificó que debía modificarse la función Verificacion y propuso agregar una detección automática de pequeñas diferencias producidas durante operaciones como potencias, logaritmos y métodos iterativos.`,
    problema: `El cálculo podía ser financieramente correcto, pero en determinados ejercicios aparecían diferencias extremadamente pequeñas frente al resultado esperado. Esto podía hacer parecer que Numeris había cometido un error matemático cuando, en realidad, la diferencia provenía de la precisión numérica del sistema.

El error se evidenció con una inversión al 3 % bimestral: $4.000.000 hoy, un segundo aporte de $2.000.000 en un momento desconocido y un valor final de $9.578.199,98640851 a los 3 años.`,
    valorIncorrecto: "6.99999999997788997 períodos (error residual: -1.73e-5)",
    valorCorrecto: "7 períodos",
    razonError: `La diferencia es extremadamente pequeña y proviene de la precisión numérica interna utilizada por el sistema al realizar operaciones como potencias, logaritmos o métodos iterativos. No representa un cambio significativo en la interpretación financiera del resultado.`,
    correccion: `Se mejoró la función de verificación incorporando un margen de tolerancia para identificar diferencias extremadamente pequeñas. La plataforma conserva el valor calculado, pero cuando detecta una diferencia de este tipo informa al usuario que puede tratarse de un pequeño error residual producido por la precisión numérica interna del sistema.`,
    resultado: `Numeris realiza una verificación adicional después del cálculo y puede informar cuándo existe un pequeño error residual. Esto permite distinguir entre una diferencia computacional mínima y un verdadero error en el planteamiento financiero.`,
    trazabilidad: `Después de realizar un cálculo en Simulación aparece una tarjeta de “Verificación matemática”. Cuando corresponde, esta sección muestra el error residual de la operación y explica que una pequeña diferencia puede ser consecuencia de la precisión numérica utilizada internamente por el sistema.`,
    link: "https://chatgpt.com/share/e/6a91ed48-54c0-8012-a31d-ad9105eb4d9b",
  },

   {
    n: 6,
    titulo: "Diagnóstico de Numeris para el segundo corte",
    prompt: `Estoy trabajando en un proyecto de matemáticas financieras llamado Numeris, que es el link que te envié. Es una herramienta web de educación financiera que desarrollamos para el primer corte y ahora debemos evolucionarlo para el segundo corte, dependiendo de las indicaciones del documento de segundo corte que te mandé. La idea no es crear una calculadora solamente, sino una herramienta que permita que una persona sin conocimientos financieros entienda los conceptos y pueda tomar decisiones.`,
    respuesta: `La IA revisó el enfoque del segundo corte y explicó que Numeris no debía evolucionar solamente agregando botones o fórmulas, sino pasando de ser un simulador financiero a una herramienta que traduzca situaciones financieras reales en decisiones comprensibles. Identificó tres bloques principales para el segundo corte: conversión de tasas, anualidades y educación financiera. También señaló que cada concepto debía explicar qué significa, cómo funciona, por qué importa, fórmula, variables, ejemplo colombiano y diferencias con conceptos relacionados.`,
    problema: `La primera respuesta era útil como visión general, pero todavía era muy amplia. Faltaba aterrizarla a la herramienta real y revisar qué partes de Numeris podían parecer solo una calculadora y cuáles mostraban comprensión financiera.`,
    correccion: `Se le pidió a la IA que analizara la herramienta como si fuera un profesor evaluando el proyecto según la rúbrica, indicandole aquellos aspectos que el profesor esperaba que se mejoraran en la versión de este corte tales como la comprensión de los conceptos .`,
    resultado: `A partir de esta interacción, Numeris se orientó más hacia una herramienta educativa y no solo una calculadora. La página debía mostrar por qué se usa una fórmula, qué significa el resultado y qué decisión financiera permite entender.`,
    trazabilidad: `Esta interacción se refleja en la estructura general de Numeris: Educación financiera, Simulación y Comparación. También se conecta con los procedimientos paso a paso, donde la herramienta muestra la tasa ingresada, la conversión, la fórmula aplicada, el resultado y la interpretación.`,
    link: "https://chatgpt.com/share/6ac29da2-c960-83e9-8f61-55e943f3151f",
  },

  {
    n: 7,
    titulo: "Actualización de las descripciones de Aprender, Simular y Comparar",
    prompt: `Teniendo en cuenta la información de la página web que te compartí y el proyecto, así como de la rúbrica para este corte, quiero que me ayudes a cambiar la descripción que se tiene sobre qué se puede hacer en cada sección, ya que en aprender aparece entender los tres tipos de interés: simple, compuesto y continuo con explicaciones sencillas y matemáticas. En simular aparece calcular créditos e inversiones con incógnitas de valor, tasa, tiempo, flujo y momento, y en comparar observar cómo cambia el resultado según el régimen utilizado. Sin embargo, para este corte tenemos que añadir el tema de conversión de tasas, anualidades vencidas y anualidades anticipadas. Entonces es importante actualizar la plataforma.`,
    respuesta: `La IA explicó que no era necesario cambiar la estructura de las secciones Aprender, Simular y Comparar, porque seguían funcionando bien. Sin embargo, propuso ampliar sus descripciones para que reflejaran los nuevos contenidos del segundo corte: conversión de tasas, tasas nominales y efectivas, tasas anticipadas y vencidas, anualidades vencidas y anticipadas, cuotas y pagos extraordinarios.`,
    problema: `La primera propuesta todavía mencionaba demasiado el enfoque académico del proyecto y podía sonar como una lista de temas de clase. Además, el usuario final de Numeris no necesitaba saber qué era del primer corte o del segundo corte, sino entender qué podía hacer con la herramienta.`,
    correccion: `Se le pidió a la IA que eliminara la referencia al primer corte, porque Numeris debía presentarse como una herramienta para una persona externa que quiere aprender matemáticas financieras, no como una entrega académica dividida por cortes.`,
    resultado: `Las secciones quedaron así: Aprender para comprender conceptos con explicaciones, ejemplos y fórmulas; Simular para explorar créditos, ahorros e inversiones, convertir tasas, calcular cuotas y valores; y Comparar para analizar tasas, formas de pago y escenarios financieros.`,
    trazabilidad: `Esta interacción se refleja directamente en las tres tarjetas o secciones iniciales de la plataforma: Aprender, Simular y Comparar. La descripción dejó de enfocarse solo en interés simple, compuesto y continuo, y pasó a incluir intereses, tasas, anualidades, conversión de tasas, cuotas, valores y pagos extraordinarios.`,
    link: "https://chatgpt.com/share/6ac29da2-c960-83e9-8f61-55e943f3151f",
  },

   {
    n: 8,
    titulo: "Revisión del código y corrección de conceptos financieros",
    prompt: `Este es el código de la app Numeris que estoy trabajando. quiero que busques errores en temas de redacción o información que se pueda dejar más clara y me des un ejemplo de cómo ponerla.`,
    respuesta: `La IA revisó directamente el contenido del archivo App.jsx y encontró varios aspectos por corregir antes de entregar. Identificó errores de redacción, expresiones demasiado infantiles para una herramienta universitaria y explicaciones que podían generar confusión financiera, especialmente en conversión de tasas y anualidades.`,
    problema: `La IA encontró varios problemas concretos. Por ejemplo, señaló que “Conceptos de platas fundamentales” y “Educación de plata” eran expresiones poco adecuadas. También indicó que “interés sobre interés” funcionaba como explicación, pero no debía reemplazar el término interés compuesto. Además, advirtió que la explicación de tasa nominal podía hacer pensar que la tasa nominal era falsa, y que decir “la tasa efectiva es el número de verdad” era financieramente impreciso.`,
    correccion: `La IA propuso mantener el lenguaje sencillo, pero usando primero los conceptos financieros correctos. Por ejemplo, recomendó explicar la tasa nominal como una tasa anual expresada junto con una frecuencia de capitalización, y la tasa efectiva como el crecimiento o costo correspondiente a un periodo determinado teniendo en cuenta la capitalización.`,
    resultado: `Después de aplicar esas correcciones, se revisó una nueva versión del código. La IA confirmó que la versión estaba bastante mejor: ya aparecía “Conceptos fundamentales de matemáticas financieras”, la tasa nominal ya no se explicaba como una tasa falsa, y el interés compuesto aparecía como término técnico acompañado de la explicación sencilla “interés sobre interés”.`,
    trazabilidad: `Esta interacción se refleja en Educación financiera, especialmente en las secciones de conceptos fundamentales, interés compuesto, tasas, conversión de tasas, anualidades vencidas y anualidades anticipadas. También se refleja en el simulador, porque se reforzó que la tasa usada en anualidades debe estar en el periodo correcto y que los conceptos VP, VF, A y periodo deben explicarse con mayor precisión.`,
    link: "https://chatgpt.com/share/6ac29da2-c960-83e9-8f61-55e943f3151f",
  },
  {
    n: 9,
    titulo: "Corrección del ingreso de meses en el simulador",
    prompt: `Estoy desarrollando una página web que se llama Numeris, la cual es un simulador financiero. Sin embargo, me di cuenta que en la parte de simulación, en tiempo, no me deja escribir, por ejemplo, 36 meses o un valor de meses que sea mayor a 11. Y quiero corregir esto ya que muchas veces los problemas dan el tiempo en meses y no en años. Entonces necesito que el simulador convierta directamente esos meses adicionales a años o que los acepte para poder operar. Te voy a enviar el código y necesito que me indiques qué parte actualizar para que esto sea posible.`,
    respuesta: `La IA revisó el problema dentro del código y encontró que la restricción no estaba en todo el simulador, sino en un punto específico: la función calcular() del componente SimularBasico.
La IA explicó que el resto del código ya podía trabajar correctamente con meses mayores a 11, porque las funciones de conversión ya usaban el total de meses. Por ejemplo, para interés simple y compuesto se usa la lógica de años por 12 más meses, y para interés continuo se convierte el tiempo a años decimales.
También indicó que el modo avanzado no tenía ese límite.`,
    problema: `El problema era que el simulador básico no permitía ingresar valores como 36 meses, aunque matemáticamente sí son válidos. Esto podía afectar ejercicios reales, porque muchas veces los enunciados dan el tiempo directamente en meses y no en años.
Además, el campo decía “Meses (0–11)”, lo que obligaba al usuario a convertir manualmente, por ejemplo, 36 meses en 3 años. Eso hacía la herramienta menos práctica y menos intuitiva.`,
    correccion: `La IA indicó que debía eliminarse la validación que bloqueaba meses mayores o iguales a 12. Antes, el código mostraba un error cuando el usuario escribía 12 meses o más. Recomendó cambiar el texto del campo de entrada de “Meses (0–11)” a simplemente “Meses”, para que el usuario entendiera que podía escribir cualquier cantidad de meses. Como mejora adicional, sugirió que el procedimiento mostrara la equivalencia. Por ejemplo, si el usuario escribe 0 años y 36 meses, el procedimiento puede mostrar que eso equivale a 36 meses, es decir, 3 años y 0 meses.`,
    resultado: `Después de la corrección, el simulador puede aceptar meses mayores a 11. Por ejemplo, el usuario puede escribir 0 años y 36 meses, y Numeris los interpreta correctamente como 36 meses o 3 años, dependiendo del tipo de cálculo.`,
    trazabilidad: `Esta interacción se refleja en Simulación, específicamente en el campo de tiempo del simulador básico. El campo de meses ahora puede aceptar valores como 12, 24 o 36 meses. Se refleja en el procedimiento paso a paso, porque Numeris puede mostrar la conversión del tiempo total a periodos. Por ejemplo: 0 años y 36 meses = 36 meses = 3 años y 0 meses.`,
    link: "https://claude.ai/share/430c6dc8-6cbf-408f-96d3-e30d3c66ca2a",
  },
  {
    n: 10,
    titulo: "Error numérico detectado: tasa redondeada en anualidades",
    esError: true,
    prompt: `Estoy revisando la sección de anualidades de Numeris.

En el simulador de anualidades, la herramienta convierte automáticamente la tasa ingresada al periodo correcto de las cuotas. Sin embargo, veo que en el procedimiento visible la tasa aparece redondeada, mientras que el cálculo interno puede estar usando más decimales.

Quiero revisar si esto puede generar una diferencia numérica en el resultado cuando el usuario intenta repetir el cálculo con la tasa que ve en pantalla.

Usa este caso:

Modalidad: anualidad anticipada
Tipo de cálculo: cuota desde VF
VF = COP 150.000.000
n = 36 pagos trimestrales
Tasa = 30 % NAMA

En la pantalla aparece que la tasa es 7.8912%

Calcula:
1. La cuota usando la tasa redondeada.
2. La cuota usando la tasa exacta.
3. La diferencia entre ambos resultados.
4. Explica por qué esto puede ser un error de comunicación en la herramienta.
5. Propón cómo corregirlo en Numeris.`,
    respuesta: `La IA revisó el funcionamiento del simulador de anualidades y confirmó que sí podía aparecer una diferencia numérica, aunque pequeña, entre calcular con la tasa redondeada visible y calcular con la tasa exacta utilizada internamente.

Primero explicó que la tasa 30 % NAMA se convierte así:

30 % / 12 = 2,5 % mensual anticipada.

Luego se pasa de anticipada a vencida:

i = 0,025 / (1 − 0,025)
i = 0,0256410256 mensual vencida.

Después se convierte a tasa efectiva trimestral vencida:

i = (1 + 0,0256410256)^3 − 1
i = 0,0789123215.

La IA explicó que Numeris podía mostrar esa tasa como 7,8912 %, pero internamente podía calcular con más decimales.`,
    problema: `El cálculo financiero de Numeris podía estar correcto, pero el procedimiento visible podía generar confusión en el usuario.

El problema estaba en que la pantalla mostraba una tasa redondeada. Si el usuario copiaba exactamente esa tasa visible y repetía manualmente el cálculo, podía obtener una cuota ligeramente diferente a la que mostraba Numeris.

Esto podía hacer parecer que la herramienta tenía un error matemático, cuando en realidad el problema era de comunicación numérica: la tasa mostrada para lectura no tenía la misma precisión que la tasa usada internamente en el cálculo.`,
    valorIncorrecto: "A = COP 761.923,43 usando la tasa redondeada visible i = 0,078912",
    valorCorrecto: "A = COP 761.917,56 usando la tasa exacta interna i = 0,0789123215",
    razonError: `La diferencia aparece porque la fórmula de anualidad anticipada desde VF usa la tasa dentro de una potencia:

A = VF × [ i / ((1 + i)^n − 1) ] / (1 + i)

Como la tasa aparece en (1 + i)^n, incluso un redondeo pequeño puede generar una diferencia en el resultado final. En este caso, la diferencia fue de aproximadamente COP 5,86 por cuota.

El error no estaba en la fórmula financiera, sino en mostrar una tasa redondeada sin aclarar que el cálculo interno usaba más decimales.`,
    correccion: `Se corrigió la sección de anualidades para diferenciar entre la tasa redondeada para lectura y la tasa exacta usada en el cálculo.

La mejora implementada fue mostrar con más precisión la tasa efectiva vencida utilizada y agregar una aclaración indicando que Numeris calcula con la tasa completa, aunque algunos valores visibles puedan aparecer redondeados para facilitar la lectura.

Además, se ajustó la respuesta principal de anualidades para que se muestre con 4 decimales, aumentando la precisión visible del resultado.`,
    resultado: `Numeris ahora comunica mejor la tasa utilizada en las anualidades. La herramienta conserva el cálculo con todos los decimales internos, pero deja claro que la tasa visible puede estar redondeada para lectura.

Esto permite que el usuario entienda por qué puede aparecer una pequeña diferencia si repite manualmente el procedimiento usando solo la tasa redondeada que ve en pantalla.`,
    trazabilidad: `Esta interacción se refleja en Simulación > Anualidades > Resultado, donde se muestra la tasa efectiva vencida usada con mayor precisión.

También se refleja en Simulación > Anualidades > Ver procedimiento completo, donde aparece la aclaración sobre la precisión de la tasa y el uso de decimales internos.

Además, la respuesta principal de anualidades ahora se presenta con 4 decimales.`,
    link: "https://chatgpt.com/share/6ac2fbeb-8358-83e9-8321-4264610c170d",
  },
];

function BloqueInteraccion({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{label}</div>
      <div style={{
        background: C.paper,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: "11px 13px",
        fontSize: 13,
        color: C.ink,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}>
        {children}
      </div>
    </div>
  );
}

function TarjetaInteraccion({ item }) {
  return (
    <Tarjeta style={{ marginBottom: 16, borderColor: item.esError ? C.danger + "55" : C.line }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 18, color: C.navy }}>
          Interacción {item.n} — {item.titulo}
        </div>
        {item.esError && (
          <span style={{
            fontSize: 10.5,
            background: C.dangerBg,
            color: C.danger,
            padding: "4px 9px",
            borderRadius: 20,
            fontFamily: F_MONO,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}>
            Error numérico detectado y corregido
          </span>
        )}
      </div>

      <details>
        <summary style={{
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          color: C.goldDeep,
          marginBottom: 12,
          userSelect: "none",
        }}>
          Ver documentación completa
        </summary>

        <BloqueInteraccion label="1. Prompt o instrucción dada a la IA">
          {item.prompt}
        </BloqueInteraccion>

        <BloqueInteraccion label="2. Lo que produjo inicialmente la IA">
          {item.respuesta}
        </BloqueInteraccion>

        <BloqueInteraccion label="3. Qué estaba mal, incompleto o podía mejorarse">
          {item.problema}
        </BloqueInteraccion>

        {item.esError && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14 }}>
              <BloqueInteraccion label="Valor incorrecto">
                {item.valorIncorrecto}
              </BloqueInteraccion>
              <BloqueInteraccion label="Valor correcto">
                {item.valorCorrecto}
              </BloqueInteraccion>
            </div>
            <BloqueInteraccion label="Por qué estaba mal">
              {item.razonError}
            </BloqueInteraccion>
          </>
        )}

        <BloqueInteraccion label="4. Cómo se corrigió o mejoró">
          {item.correccion}
        </BloqueInteraccion>

        <BloqueInteraccion label="5. Resultado final">
          {item.resultado}
        </BloqueInteraccion>

        <BloqueInteraccion label="6. Parte concreta y visible de la herramienta (trazabilidad)">
          {item.trazabilidad}
        </BloqueInteraccion>

        <BloqueInteraccion label="7. Enlace compartible de la conversación original">
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            style={{ color: C.navy, fontWeight: 700, textDecoration: "underline", overflowWrap: "anywhere" }}
          >
            {item.link}
          </a>
        </BloqueInteraccion>
      </details>
    </Tarjeta>
  );
}

function Interacciones() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Interacciones</Etiqueta>
<h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: "0 0 10px" }}>
  Interacciones · segundo corte
</h1>
<p style={{ fontSize: 13.5, color: C.slate, marginBottom: 24, maxWidth: 760 }}>
  Desde la interacción 6 se documentan las interacciones correspondientes al segundo corte. Estas muestran cómo se revisó y mejoró Numeris a partir de la rúbrica, especialmente en conversión de tasas, anualidades vencidas, anualidades anticipadas, claridad conceptual, funcionamiento del simulador y corrección de errores detectados durante el desarrollo.
</p>

      {INTERACCIONES_DATA.map((item) => (
        <TarjetaInteraccion key={item.n} item={item} />
      ))}
    </Section>
  );
}

/* ============================================================
   APP RAÍZ
   ============================================================ */
export default function App() {
  const [seccion, setSeccion] = useState("inicio");
  const [moneda, setMoneda] = useState("COP");

  return (
    <div style={{ fontFamily: F_BODY, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <Nav activa={seccion} setActiva={setSeccion} moneda={moneda} setMoneda={setMoneda} />
      {seccion === "inicio" && <Inicio ir={setSeccion} />}
      {seccion === "aprender" && <Aprender />}
      {seccion === "simular" && <Simular moneda={moneda} />}
      {seccion === "comparar" && <Comparar moneda={moneda} />}
      {seccion === "glosario" && <Glosario />}
      {seccion === "interacciones" && <Interacciones />}
      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 20 }}>
        <Section style={{ padding: "22px 20px", fontSize: 11.5, color: C.slate, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>Numeris · Proyecto académico · Matemáticas Financieras · Segundo Corte 2026-2</span>
          <span>Desarrollado con asistencia de Replit Agent, ChatGPT Business y Claude</span>
        </Section>
      </div>
    </div>
  );
}
