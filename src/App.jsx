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
  { t: "VP", d: "Valor Presente: cuánto vale hoy una cantidad de dinero que vas a recibir o pagar más adelante." },
  { t: "VF", d: "Valor Futuro: cuánto valdrá un dinero de hoy cuando pase el tiempo, ya sumados los intereses." },
  { t: "i", d: "Tasa de interés de un periodo. Dice cuánto crece o cuánto cuesta el dinero en cada periodo (cada mes, cada trimestre, etc.)." },
  { t: "n", d: "Cantidad de periodos que dura la operación. En una anualidad es lo mismo que el número de cuotas." },
  { t: "r", d: "Tasa que se usa en el interés continuo, donde el dinero crece sin parar en lugar de crecer a saltos." },
  { t: "t", d: "Tiempo medido siempre en años. Se usa en el interés continuo." },
  { t: "Capital", d: "Dinero con el que empiezas: lo que prestas, lo que invierte o lo que ahorras al comienzo." },
  { t: "Interés", d: "Lo que cuesta usar dinero ajeno (si pides un préstamo) o lo que ganas por prestar el tuyo (si inviertes)." },
  { t: "Periodo", d: "Cada intervalo de tiempo al que corresponde una tasa: un mes, dos meses, un trimestre, un año." },
  { t: "Periodicidad", d: "Cada cuánto tiempo se repite un pago o se cobra una tasa. Por ejemplo, mensual o trimestral." },
  { t: "Flujo", d: "Un movimiento de dinero que entra o sale en un momento concreto." },
  { t: "Momento", d: "Lugar de la línea de tiempo donde ocurre un flujo. El momento 0 es hoy." },
  { t: "Línea de tiempo", d: "Dibujo que ordena los pagos y cobros desde hoy (momento 0) hasta el final. Ayuda a ver cuándo cae cada flujo." },
  { t: "Momento focal", d: "Fecha elegida para comparar varios flujos. Todos los valores se trasladan a esa fecha para poder sumarlos." },
  { t: "Fecha focal", d: "Es lo mismo que el momento focal: el día al que se llevan todos los pagos para compararlos." },
  { t: "Ecuación de valor", d: "Igualdad que se arma cuando todos los flujos se trasladan a la misma fecha focal. Sirve para despejar lo que no se sabe." },
  { t: "Coeficiente", d: "Número que dice cuántas veces un flujo contiene a otro. Por ejemplo, si el flujo 2 es 1,4 × flujo 1, el coeficiente es 1,4." },
  { t: "Capitalización", d: "Llevar un valor hacia el futuro sumándole los intereses que gana en ese tiempo." },
  { t: "Descuento", d: "Traer un valor desde el futuro hacia hoy, quitándole los intereses. El valor resultante es menor." },
  { t: "Tasa nominal", d: "Tasa de referencia que se expresa para el año completo, pero que se cobra por partes (cada mes, cada trimestre...). No muestra el crecimiento real." },
  { t: "Tasa efectiva", d: "Tasa que muestra el crecimiento o el costo real del dinero en un periodo, contando los intereses que generan más intereses." },
  { t: "Anualidad", d: "Serie de pagos iguales que se hacen cada cierto tiempo. Aunque diga \"anual\", los pagos pueden ser mensuales, trimestrales, etc." },
  { t: "Anualidad vencida", d: "Anualidad en la que cada cuota se paga al final del periodo. La primera cuota cae en el momento 1, no en el 0." },
  { t: "Cuota (A)", d: "Valor que se paga en cada periodo dentro de una anualidad. Todas las cuotas valen lo mismo." },
  { t: "Pago periódico", d: "Pago que se repite cada cierto tiempo fijo, por ejemplo cada mes." },
  { t: "Valor presente de una anualidad", d: "Lo que valen hoy todas las cuotas juntas. Es el valor del crédito el día que se otorga." },
  { t: "Valor futuro de una anualidad", d: "Lo que valen todas las cuotas juntas al final del plazo, contando los intereses que ganaron." },
  { t: "Pago extra", d: "Pago adicional que no hace parte de las cuotas iguales, como una prima, un abono o una cuota inicial. Se calcula aparte y se suma." },
  { t: "Pago extraordinario", d: "Otro nombre para el pago extra: un pago que se sale de la serie de cuotas iguales." },
  { t: "Anualidad anticipada", d: "Serie de pagos iguales donde cada cuota se paga al inicio del periodo." },
  { t: "Tasa anticipada", d: "Tasa en la que los intereses se cobran al inicio del periodo." },
  { t: "Cuota anticipada", d: "Pago que se hace al comienzo del periodo." },
  { t: "Valor presente de una anualidad anticipada", d: "Valor de hoy de varias cuotas que se pagan al inicio de cada periodo." },
  { t: "Valor futuro de una anualidad anticipada", d: "Valor final de varias cuotas que se pagan al inicio de cada periodo." },
  { t: "NAMA", d: "Nominal anual con capitalización mensual anticipada." },
  { t: "NACA", d: "Nominal anual con capitalización cuatrimestral anticipada." },
  { t: "NATA", d: "Nominal anual con capitalización trimestral anticipada." },
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
        <Etiqueta>Caso aplicado · Matemáticas Financieras · Primer corte 2026-2</Etiqueta>
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
        Esta herramienta tiene fines educativos y de simulación. No constituye asesoría financiera personalizada.
      </div>

      <div style={{ marginTop: 30, fontSize: 11.5, color: C.slate, lineHeight: 1.7 }}>
        Proyecto académico · Matemáticas Financieras · Primer Corte 2026-2<br />
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

Convertir una tasa es solamente cambiar la forma de contarla. El dinero no cambia, solo cambiamos cómo lo decimos.`}


      </NivelCinco>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · Las tasas tienen nombre y apellido" defaultOpen>
        <p>Piensa en una tasa como si fuera una persona: tiene un <strong>nombre</strong> y dos <strong>apellidos</strong>. Si conoces los tres, ya sabes todo lo que necesitas saber de esa tasa.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Nombre">
            Te dice si es <strong>Nominal</strong> o <strong>Efectiva</strong>. Es como preguntar: ¿es el número "de mentiritas" (nominal) o es el número "de verdad-verdad" (efectiva)?
          </TarjetaMini>
          <TarjetaMini titulo="Primer apellido">
            Te dice cada cuánto tiempo se cobran los intereses. Por ejemplo: cada mes, cada tres meses, cada seis meses.
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
        <p><strong>¿Qué es?</strong> La tasa nominal es como el precio que ves pegado en la vitrina de la tienda. Te dice más o menos cuánto es, pero no es lo que pagas de verdad. Es un número para mirar, no el número final.</p>
        <p style={{ color: C.slate }}><strong>¿Cuándo se usa?</strong> Los bancos casi siempre te muestran este número primero, porque se ve chiquito y bonito. Pero ojo: no es lo que de verdad te va a costar el dinero.</p>
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
        <p><strong>¿Qué es?</strong> La tasa efectiva es el número de VERDAD. Te dice cuánto creció o cuánto costó el dinero de verdad, contando también las moneditas que nacieron de otras moneditas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <TarjetaMini titulo="Nominal">Es el precio de la vitrina. Da una idea, pero no es el número final.</TarjetaMini>
          <TarjetaMini titulo="Efectiva">Es lo que pagas de verdad en la caja. El número real.</TarjetaMini>
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
              { label: "Interpretación", content: "El 2 % de cada mes se ve chiquito, pero cada mes se suma al anterior y las moneditas nuevas hacen más moneditas. Por eso, al final del año, crece más que 24 %." },
            ]} />
          </Acordeon>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Capitalización (cuando el interés hace más interés)">
        <p>Capitalizar es como una alcancía mágica: metes moneditas y aparecen moneditas nuevas. Y esas moneditas nuevas también hacen aparecer más moneditas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Mensual">La alcancía mágica hace moneditas nuevas 12 veces al año (una vez por mes).</TarjetaMini>
          <TarjetaMini titulo="Trimestral">La alcancía mágica hace moneditas nuevas 4 veces al año (cada tres meses).</TarjetaMini>
          <TarjetaMini titulo="Semestral">La alcancía mágica hace moneditas nuevas 2 veces al año (cada seis meses).</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>Mientras más seguido aparezcan moneditas nuevas, más rápido crece la alcancía.</p>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Tasa vencida y tasa anticipada (¿cuándo se paga?)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Vencida">
            Pagas el interés AL FINAL. Como en el restaurante: primero comes y después pagas.
          </TarjetaMini>
          <TarjetaMini titulo="Anticipada">
            Pagas el interés AL PRINCIPIO. Como en el cine: primero pagas la boleta y después ves la película.
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
              Te cobran el interés de una vez, así que solo te dan $9.500.000. Pero igual devuelves $10.000.000. Como te dieron menos plata, el interés real es un poquito más grande: 5,26 %.
            </TarjetaMini>
          </div>
          <p style={{ color: C.slate }}>La tasa "cambia" solo porque cambia el momento en que te cobran: antes o después.</p>
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

      <NivelCinco titulo="🧸 Nivel 7 años">
        {`Imagina que quieres una bicicleta que cuesta mucha plata y no tienes toda hoy.
Tu mamá te dice: "Te la compro hoy y tú me la vas pagando: cada mes me das la misma cantidad de plata".

Supongamos que cada mes le das 3 billetes. Ni uno más, ni uno menos. Todos los meses, igual. Esa fila de pagos iguales, uno detrás de otro, se llama ANUALIDAD.

Ojo: aunque diga "anual", no significa que se pague una vez al año. Puede ser cada mes, cada dos meses, cada tres meses... Lo importante es que los pagos sean iguales y que pase el mismo tiempo entre uno y otro.

¿Y qué quiere decir "vencida"? Es como en un restaurante: primero comes y al final pagas la cuenta. Aquí primero pasa el mes y al final del mes pagas. Por eso el primer pago no es hoy: es cuando termina el primer mes.

Ahora viene lo más importante: el dinero cambia de valor con el tiempo. Si te dan a escoger entre un billete hoy o el mismo billete dentro de un año, escoges hoy, porque ese billete lo puedes guardar y ganar intereses. Un billete de hoy vale más que el mismo billete de dentro de un año.

Por eso con la misma fila de pagos podemos hacer dos preguntas:
— Valor presente (VP): ¿cuánto valen HOY todos los pagos juntos? Es lo que costó la bicicleta.
— Valor futuro (VF): ¿cuánto valen AL FINAL todos los pagos juntos? Es lo que tendrías si, en vez de pagar, hubieras guardado cada pago en una alcancía que gana intereses.

Es la misma fila de pagos vista desde dos días distintos: hoy o el último día.

¿Y si un día tu abuela te da plata y tú pagas de una vez un valor más grande? Ese pago es diferente a los demás y no cabe en la fila de pagos iguales. Se llama PAGO EXTRA. Se calcula aparte y después se suma. Lo verás en la sección 9.`}
      </NivelCinco>

      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 13.5, color: C.slate, marginBottom: 14 }}>
        <strong style={{ color: C.navy }}>Dos cosas para no olvidar:</strong> (1) las anualidades usan interés <strong>compuesto</strong>, como la bola de nieve del módulo 2: el interés también gana interés. (2) La tasa tiene que estar contada en el mismo "tamaño" que las cuotas. Para eso sirve el módulo 4 de conversión de tasas.
      </div>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · De un solo pago a muchas cuotas" defaultOpen>
        <p>Hasta ahora, en interés simple, compuesto y continuo, siempre hablábamos de <strong>un solo pago</strong>: un valor presente (hoy) y un valor futuro (después). Era como una sola galleta que viaja en el tiempo.</p>
        <p>Con las anualidades todo cambia: ya no hay una galleta, hay <strong>una fila de galletas iguales</strong>. No miramos un solo movimiento de dinero, sino muchos pagos iguales, uno detrás de otro.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Antes: un solo pago" tono="azul">
            Prestas $1.000.000 hoy y recibes un solo valor dentro de un año. Un solo pago de ida y uno de vuelta.
          </TarjetaMini>
          <TarjetaMini titulo="Ahora: una fila de pagos" tono="azul">
            Pides un crédito hoy y lo pagas en 36 cuotas iguales. Son 36 pagos del mismo valor.
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate }}><strong>¿Por qué importa?</strong> Casi todo en la vida se paga en cuotas. Sin anualidades no podríamos calcular nada de eso.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "10px 0 6px" }}>Ejemplos reales en Colombia</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Crédito de carro">Cuotas mensuales iguales durante 36, 48 o 60 meses.</TarjetaMini>
          <TarjetaMini titulo="Crédito de vivienda">Cuotas mensuales iguales durante muchos años.</TarjetaMini>
          <TarjetaMini titulo="Aportes a un fondo">La misma plata que consignas cada mes para ahorrar.</TarjetaMini>
          <TarjetaMini titulo="Arriendo mensual">El mismo canon cada mes mientras dure el contrato.</TarjetaMini>
          <TarjetaMini titulo="Plataforma de streaming">La suscripción de cada mes, siempre por el mismo valor.</TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title="2 · ¿Qué es una anualidad? Las 4 condiciones">
        <p><strong>¿Qué es?</strong> Una anualidad es una fila de pagos iguales que se hacen cada cierto tiempo. "Anualidad" es solo el nombre bonito de "cuotas iguales".</p>
        <p>Para que sea una anualidad, la fila tiene que cumplir <strong>4 reglas a la vez</strong>, como las reglas de un juego.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="1. Todos los pagos iguales">Como tu mesada: siempre te dan las mismas monedas, nunca más ni menos.</TarjetaMini>
          <TarjetaMini titulo="2. Pagos periódicos">Llegan cada cierto tiempo fijo, como el bus que pasa cada 10 minutos.</TarjetaMini>
          <TarjetaMini titulo="3. Un pago por cada periodo">Si hay 24 meses, hay 24 cuotas. Ni una más, ni una menos.</TarjetaMini>
          <TarjetaMini titulo="4. La misma tasa">El mismo interés vale para todos los pagos de la fila.</TarjetaMini>
        </div>
        <BloqueFormula>Anualidad = pagos iguales + periódicos + uno por periodo + misma tasa</BloqueFormula>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <TarjetaMini titulo="Si una cuota cambia de valor" tono="alerta">
            Esa cuota se sale de la fila. La fórmula de anualidades solo sirve cuando todas valen lo mismo.
          </TarjetaMini>
          <TarjetaMini titulo="Si aparece un pago extra" tono="alerta">
            Es como una galleta grande que cae en la mesa fuera de la fila. No hace parte de la anualidad: se calcula aparte (lo veremos en la sección 9).
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Diferencia con lo que ya conoces:</strong> un pago único (como en el interés compuesto) es una sola galleta. Una anualidad es una fila de galletas iguales.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>¿Cuáles sí y cuáles no?</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <TarjetaMini titulo="SÍ es anualidad" tono="azul">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Arriendo mensual fijo.</li>
                <li>Cuota mensual fija de un crédito.</li>
                <li>Aporte mensual fijo a un fondo.</li>
                <li>Suscripción mensual fija.</li>
              </ul>
            </TarjetaMini>
          </div>
          <div style={{ flex: "1 1 260px" }}>
            <TarjetaMini titulo="NO es anualidad" tono="alerta">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Nómina variable según proyectos.</li>
                <li>Pago extra en un crédito.</li>
                <li>Abono adicional de diferente valor.</li>
                <li>Cuotas que cambian cada mes.</li>
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
        <p><strong>¿Qué es?</strong> En una anualidad vencida pagas <strong>al final</strong> de cada periodo. Primero pasa el tiempo y después pagas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Como el restaurante" tono="azul">Primero comes el almuerzo y al final pagas. Primero pasa el mes y al final pagas la cuota.</TarjetaMini>
          <TarjetaMini titulo="Crédito tradicional" tono="azul">Recibes la plata hoy y pagas la primera cuota cuando termina el primer mes.</TarjetaMini>
          <TarjetaMini titulo="Arriendo pagado al final del mes" tono="azul">Usas la casa todo el mes y cuando termina pagas el arriendo.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Ojo: vencida NO es atrasada" tono="alerta">
          "Vencida" no quiere decir que te atrasaste. Solo quiere decir que pagas al final.
        </TarjetaMini>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Más adelante:</strong> la anualidad anticipada es lo contrario. Es como el cine: primero pagas la boleta y después ves la película.</p>
        <Interpretacion>
          En una anualidad vencida nunca hay una cuota en el momento 0 (hoy). La primera cuota aparece cuando termina el primer periodo.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · La línea de tiempo de una anualidad vencida">
        <p>Una línea de tiempo es un dibujito del calendario. El <strong>0</strong> es hoy. Los números <strong>1, 2, 3... n</strong> son los finales de cada mes. Ahí caen los pagos.</p>
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
          <TarjetaMini titulo="i">La tasa del periodo: el "pedacito" de interés de cada mes (o de cada periodo).</TarjetaMini>
          <TarjetaMini titulo="n">Cuántos periodos hay, que es lo mismo que cuántas cuotas hay.</TarjetaMini>
          <TarjetaMini titulo="VP">Valor presente: cuánto valen todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="VF">Valor futuro: cuánto valen todas las cuotas al final.</TarjetaMini>
        </div>
        <Interpretacion>
          Todas las A son iguales porque todas las cuotas valen lo mismo. Lo único que cambia de una cuota a otra es el momento en que cae.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · Valor presente: cuánto valen hoy varias cuotas futuras">
        <p><strong>¿Qué es?</strong> El valor presente de una anualidad es <strong>cuánto valen hoy</strong> todas las cuotas que vas a pagar en el futuro.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Un billete que te dan mañana vale un poquito menos que uno que te dan hoy, porque el de hoy lo puedes guardar y hacerlo crecer. Entonces cada pago del futuro se "encoge" un poquito cuando lo traemos a hoy. Después sumamos todos los pagos encogidos.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Para qué sirve?</strong></p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>Para saber cuánto vale hoy un crédito (por ejemplo, 36 cuotas de un carro).</li>
          <li>Para saber cuánto vale hoy una inversión con pagos constantes.</li>
          <li>Para comparar pagos del futuro con plata de hoy.</li>
        </ul>
        <p style={{ color: C.slate }}><strong>Diferencia:</strong> en el interés compuesto traías UN valor futuro a hoy. Aquí traes una FILA de valores futuros y los sumas.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Primero la idea, como una suma</div>
        <BloqueFormula>VP = A/(1+i)^1 + A/(1+i)^2 + A/(1+i)^3 + ... + A/(1+i)^n</BloqueFormula>
        <p style={{ margin: "6px 0" }}>Cada cuota se trae a hoy y luego se suman todas.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Después, la fórmula "atajo"</div>
        <BloqueFormula>VP = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VP">El valor de todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa del periodo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>Este atajo hace toda la suma de una sola vez. Con 3 pagos ayuda, y con 360 pagos de una casa ayuda muchísimo.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 cuotas de COP 1.000 con una tasa del 5 % efectivo por periodo. ¿Cuánto valen hoy esas cuotas?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Sustitución", content: "VP = 1.000 × [((1 + 0,05)^3 − 1) / (0,05 × (1 + 0,05)^3)]" },
              { label: "Comprobación como suma", content: "1.000/1,05 + 1.000/1,05^2 + 1.000/1,05^3" },
              { label: "Resultado", content: "VP = COP 2.723,25" },
              { label: "Interpretación", content: "Esas tres cuotas futuras de COP 1.000 equivalen hoy a COP 2.723,25." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Pagarás COP 3.000 en total, pero hoy esas cuotas valen COP 2.723,25, porque el dinero que se paga más adelante vale menos que el de hoy.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Valor futuro: cuánto tendré al final si pago o ahorro lo mismo cada vez">
        <p><strong>¿Qué es?</strong> El valor futuro de una anualidad es <strong>cuánto valen todos los pagos al final</strong>, contando los intereses.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es la alcancía mágica: cada vez que metes las mismas monedas, ellas hacen moneditas nuevas. Las primeras tuvieron más tiempo para crecer y las últimas menos. Al final contamos todo lo que hay en la alcancía.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Ejemplo de la vida real:</strong> si ahorras COP 100.000 cada mes durante un año, el valor futuro te dice cuánto tendrás al final, con todo y los intereses.</p>
        <p style={{ color: C.slate }}><strong>Diferencia:</strong> el valor presente lleva las cuotas a HOY; el valor futuro las lleva al FINAL. Es la misma fila de cuotas mirada desde dos fechas distintas.</p>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 4 }}>Fórmula</div>
        <BloqueFormula>VF = A × [ ((1 + i)^n − 1) / i ]</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VF">El valor de todas las cuotas al final.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa del periodo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 cuotas de COP 1.000 con una tasa del 5 % efectivo por periodo. ¿Cuánto valen al final esas cuotas?</p>
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
            Pusiste COP 3.000 en total y al final tienes COP 3.152,50. Los COP 152,50 de más son los intereses que hicieron crecer tus cuotas.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · ¿De cuánto es la cuota? Hallar A desde VP o VF">
        <p>A veces ya sabemos cuánto cuesta lo que compramos (o cuánto queremos ahorrar) y lo que falta saber es: <strong>¿de cuánto es cada cuota?</strong></p>
        <p style={{ color: C.slate }}>Para eso usamos las mismas fórmulas de antes, pero "despejando" la A.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "14px 0 4px" }}>Caso 1 · Hallar A desde VP (pagar una deuda)</div>
        <BloqueFormula>A = VP / [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando ya sé cuánto vale el crédito hoy y quiero saber la cuota.</p>
        <p>Un crédito de COP 30.000.000 se paga en 24 cuotas mensuales con una tasa del 30 % NAM. ¿De cuánto es cada cuota?</p>
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
          En total pagarías unos COP 40,26 millones (24 × 1.677.384,61) por un crédito de COP 30 millones. Esa diferencia son los intereses.
        </Interpretacion>

        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Caso 2 · Hallar A desde VF (juntar una meta)</div>
        <BloqueFormula>A = VF × [ i / ((1 + i)^n − 1) ]</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando ya sé cuánta plata quiero tener al final y quiero saber cuánto debo pagar o ahorrar cada vez.</p>
        <p>Queremos juntar COP 150.000.000 con 36 cuotas trimestrales y una tasa del 30 % NAM. ¿De cuánto es cada cuota?</p>
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
        <p style={{ color: C.slate, marginTop: 10 }}><strong>Diferencia entre los dos casos:</strong> desde VP la cuota paga una deuda que existe hoy; desde VF la cuota construye un ahorro que existirá en el futuro.</p>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · El error más común: la tasa y las cuotas no hablan el mismo idioma">
        <div style={{ padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            La tasa y las cuotas tienen que ser del mismo "tamaño". Si las cuotas son por mes, la tasa tiene que ser por mes.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Cuotas mensuales">Tasa mensual.</TarjetaMini>
          <TarjetaMini titulo="Cuotas bimestrales">Tasa bimestral.</TarjetaMini>
          <TarjetaMini titulo="Cuotas trimestrales">Tasa trimestral.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Si tu amigo habla inglés y tú español, necesitan un traductor. Convertir tasas es ese traductor: cambia la tasa al "idioma" de tus cuotas.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>Cómo se conecta con el módulo 4:</strong> primero cortas la torta (repartes la tasa), y luego cambias su tamaño. Al final, la tasa que usas en la fórmula es siempre una tasa <strong>efectiva</strong> del mismo tamaño que tus cuotas.</p>
        <TarjetaMini titulo="Error común" tono="alerta">
          Usar directamente una tasa nominal anual en la fórmula de anualidades. Por ejemplo, usar 25 % NAT como si fuera una tasa mensual.
        </TarjetaMini>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo del procedimiento correcto</div>
          <p>Hallar el VP de una cuota mensual de $100 con una tasa del 25 % NAT (nominal anual, se cobra cada trimestre).</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Paso 1 — Repartir la nominal", content: "ET = 25 % / 4 = 6,25 % efectiva trimestral" },
              { label: "Paso 2 — Cambiar de tamaño (trimestre a mes)", content: "EM = (1 + 0,0625)^(4/12) − 1" },
              { label: "Resultado", content: `EM ≈ ${formatPercentCO(Math.pow(1.0625, 4 / 12) - 1, 2)} mensual` },
              { label: "Uso en la fórmula", content: "VP = 100 × [((1 + 0,0204)^1 − 1) / (0,0204 × (1 + 0,0204)^1)]" },
              { label: "Interpretación", content: "Si la anualidad es mensual, debo usar 2,04 % mensual, no 25 % anual." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Con 2,04 % mensual, una cuota de $100 que se paga dentro de un mes vale hoy unos $98. Si hubieras usado 25 %, te habría dado $80: un error enorme que viene solo de no traducir la tasa.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Anualidades + pagos extra: la galleta grande fuera de la fila">

        <NivelCinco titulo="🧸 Nivel 7 años">
          {`Imagina una fila de galletas IGUALES sobre la mesa. Esa fila es la anualidad: todas las galletas son del mismo tamaño y están una detrás de otra.

Un día llega una galleta GRANDE, diferente a las demás. No puedes meterla en la fila, porque la fila es solo de galletas iguales. Entonces la dejas aparte.

Pero cuando quieres saber cuánto hay en total, tienes que contar la fila Y la galleta grande.

Aquí está el truco: una galleta de hoy no vale lo mismo que una galleta de dentro de un año, porque el dinero cambia de valor con el tiempo. Por eso, antes de sumar, todos tienen que pararse en la MISMA línea, como cuando sacan una foto de grupo.

Esa línea es un día que tú eliges. Se llama fecha focal:
— Si quieres saber cuánto valen todos HOY, la foto es hoy.
— Si quieres saber cuánto valen todos AL FINAL, la foto es el último día.

Resumen para no olvidar:
1. La fila de pagos iguales se calcula con la fórmula de anualidades.
2. Cada pago extra se calcula aparte, moviéndolo hasta el día de la foto.
3. Al final se suma todo.`}
        </NivelCinco>

        <div style={{ fontWeight: 700, color: C.navy, margin: "4px 0 6px" }}>La definición, con las palabras de la clase</div>
        <TarjetaMini titulo="Anualidades + flujos adicionales" tono="azul">
          En un crédito podemos pagar valores adicionales a las cuotas o pagos permanentes. Estos pagos no los podemos incluir dentro de las fórmulas de anualidades, pero sí debemos sumarlos. Para poder sumarlos debemos entender si lo que quiero encontrar es un valor futuro o un valor presente. En otras palabras, debemos definir una <strong>fecha focal</strong> a la que debemos llegar.
        </TarjetaMini>

        <p style={{ marginTop: 14 }}><strong>¿Qué es un pago extra?</strong> Es cualquier pago que NO es una de las cuotas iguales. Por ejemplo: un abono grande que haces un mes para pagar más rápido.</p>
        <BloqueFormula>Cuotas iguales → fórmula de anualidades · Pagos distintos → se calculan aparte y se suman</BloqueFormula>

        {/* PASO 0 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 0 · Elegir la fecha focal</div>
        <p>La fecha focal depende de lo que quieres encontrar. Solo hay dos casos:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Quiero un valor presente (VP)" tono="azul">La fecha focal es hoy (momento 0). Todo se trae a hoy.</TarjetaMini>
          <TarjetaMini titulo="Quiero un valor futuro (VF)" tono="azul">La fecha focal es el final (momento n). Todo se lleva al final.</TarjetaMini>
        </div>

        {/* PASO 1 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 1 · La fórmula completa</div>
        <p>La idea es siempre la misma: <strong>fórmula de la anualidad + cada pago extra movido hasta la fecha focal.</strong></p>

        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Valor presente + pagos extra (la fecha focal es hoy)</div>
        <BloqueFormula>VP total = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + P1 / (1 + i)^n1 + P2 / (1 + i)^n2 + ...</BloqueFormula>

        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Valor futuro + pagos extra (la fecha focal es el final)</div>
        <BloqueFormula>VF total = A × [ ((1 + i)^n − 1) / i ] + P1 × (1 + i)^(n − n1) + P2 × (1 + i)^(n − n2) + ...</BloqueFormula>

        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Las dos fórmulas con el signo de suma (para cualquier cantidad de pagos extra)</div>
        <BloqueFormula>VP total = A × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Σ Pk / (1 + i)^nk</BloqueFormula>
        <BloqueFormula>VF total = A × [ ((1 + i)^n − 1) / i ] + Σ Pk × (1 + i)^(n − nk)</BloqueFormula>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <TarjetaMini titulo="A">El valor de la cuota igual.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva del periodo, del mismo tamaño que las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">El número total de cuotas (de periodos).</TarjetaMini>
          <TarjetaMini titulo="P1, P2, ...">El valor de cada pago extra.</TarjetaMini>
          <TarjetaMini titulo="n1, n2, ...">El periodo en que cae cada pago extra.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>En los apuntes de clase estos pagos extra aparecen como <strong>Vf1</strong> (en la fórmula de VP) y <strong>Vp1</strong> (en la fórmula de VF). Son el mismo pago extra, el valor que se paga en el periodo n1.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Cómo se mueve cada pago extra (la regla para no enredarse)</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="El pago está DESPUÉS de la fecha focal" tono="azul">
            Hay que traerlo hacia atrás, así que se <strong>divide</strong> entre (1 + i) elevado al número de periodos que lo separan. Pasa en el VP: el pago extra está en el futuro y se trae a hoy.
          </TarjetaMini>
          <TarjetaMini titulo="El pago está ANTES de la fecha focal" tono="azul">
            Hay que llevarlo hacia adelante, así que se <strong>multiplica</strong> por (1 + i) elevado al número de periodos que lo separan. Pasa en el VF: el pago extra se lleva hasta el final.
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 10 }}>Un pago extra es un solo pago, no una fila. Por eso se mueve con las fórmulas del interés compuesto (módulo 2), no con la fórmula de anualidades.</p>

        {/* PASO 2 */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Paso 2 · Receta en 4 pasos</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="1. Elige la fecha focal">¿Quiero VP o VF? Hoy o el final.</TarjetaMini>
          <TarjetaMini titulo="2. Calcula la anualidad">Usa la fórmula de VP o de VF solo con las cuotas iguales.</TarjetaMini>
          <TarjetaMini titulo="3. Mueve cada pago extra">Divide o multiplica según esté después o antes de la fecha focal.</TarjetaMini>
          <TarjetaMini titulo="4. Suma todo">Anualidad + todos los pagos extra ya movidos.</TarjetaMini>
        </div>

        {/* EJEMPLO */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Ejemplo: Camila compra una moto a crédito</div>
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
          <PasoLinea etiqueta="Momento" momento="6" pago="A + P1" />
          <PasoLinea etiqueta="Momento" momento="..." pago="..." />
          <PasoLinea etiqueta="Momento" momento="12" pago="A + P2" />
        </div>
        <TarjetaMini titulo="Ojo con el mes 12" tono="alerta">
          En el mes 12 caen dos pagos el mismo día: la cuota número 12 y el pago extra. Aun así no se mezclan. La cuota va dentro de la fórmula de la anualidad; el pago extra se calcula aparte.
        </TarjetaMini>

        <Acordeon title="(a) Ver procedimiento: valor presente total (la fecha focal es hoy)">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Fecha focal", content: "Hoy (momento 0), porque queremos saber cuánto vale todo hoy." },
            { label: "Datos", content: "A = 400.000 · i = 2 % = 0,02 · n = 12 · P1 = 1.000.000 en n1 = 6 · P2 = 1.500.000 en n2 = 12" },
            { label: "Fórmula", content: "VP total = A × [((1 + i)^n − 1) / (i × (1 + i)^n)] + P1/(1 + i)^n1 + P2/(1 + i)^n2" },
            { label: "Paso 2 — Las 12 cuotas (anualidad)", content: `VP cuotas = 400.000 × [((1,02)^12 − 1) / (0,02 × (1,02)^12)] = 400.000 × ${formatNumberCO(mFactorVP, 6, 6)} = COP ${formatNumberCO(mVPcuotas, 2, 2)}` },
            { label: "Paso 3a — Pago extra del mes 6 (se divide)", content: `VP P1 = 1.000.000 / (1,02)^6 = COP ${formatNumberCO(mVPe1, 2, 2)}` },
            { label: "Paso 3b — Pago extra del mes 12 (se divide)", content: `VP P2 = 1.500.000 / (1,02)^12 = COP ${formatNumberCO(mVPe2, 2, 2)}` },
            { label: "Paso 4 — Sumar todo", content: `VP total = ${formatNumberCO(mVPcuotas, 2, 2)} + ${formatNumberCO(mVPe1, 2, 2)} + ${formatNumberCO(mVPe2, 2, 2)}` },
            { label: "Resultado", content: `VP total ≈ COP ${formatNumberCO(mVPtotal, 2, 2)}` },
            { label: "Interpretación", content: "Las 12 cuotas y los dos pagos extra, juntos, valen hoy ese valor. Es lo que costó la moto el día de la compra." },
          ]} />
        </Acordeon>

        <Acordeon title="(b) Ver procedimiento: valor futuro total (la fecha focal es el final)">
          <FichaProcedimiento pasos={[
            { label: "Paso 1 — Fecha focal", content: "El final (momento 12), porque queremos saber cuánto vale todo al terminar." },
            { label: "Datos", content: "A = 400.000 · i = 0,02 · n = 12 · P1 = 1.000.000 en n1 = 6 · P2 = 1.500.000 en n2 = 12" },
            { label: "Fórmula", content: "VF total = A × [((1 + i)^n − 1) / i] + P1 × (1 + i)^(n − n1) + P2 × (1 + i)^(n − n2)" },
            { label: "Paso 2 — Las 12 cuotas (anualidad)", content: `VF cuotas = 400.000 × [((1,02)^12 − 1) / 0,02] = 400.000 × ${formatNumberCO(mFactorVF, 6, 6)} = COP ${formatNumberCO(mVFcuotas, 2, 2)}` },
            { label: "Paso 3a — Pago extra del mes 6 (se multiplica)", content: `VF P1 = 1.000.000 × (1,02)^(12 − 6) = COP ${formatNumberCO(mVFe1, 2, 2)}` },
            { label: "Paso 3b — Pago extra del mes 12 (no se mueve)", content: `VF P2 = 1.500.000 × (1,02)^(12 − 12) = 1.500.000 × 1 = COP ${formatNumberCO(mVFe2, 2, 2)}` },
            { label: "Paso 4 — Sumar todo", content: `VF total = ${formatNumberCO(mVFcuotas, 2, 2)} + ${formatNumberCO(mVFe1, 2, 2)} + ${formatNumberCO(mVFe2, 2, 2)}` },
            { label: "Resultado", content: `VF total ≈ COP ${formatNumberCO(mVFtotal, 2, 2)}` },
            { label: "Comprobación", content: `El VP llevado al final debe dar lo mismo: ${formatNumberCO(mVPtotal, 2, 2)} × (1,02)^12 = ${formatNumberCO(mVPtotal * Math.pow(1 + mi, mn), 2, 2)}` },
          ]} />
        </Acordeon>

        <Interpretacion>
          Camila paga en total COP {formatNumberCO(mA * mn + mP1 + mP2, 0, 0)} (12 × 400.000 + 1.000.000 + 1.500.000). Pero ese dinero se paga en momentos distintos: hoy todo vale COP {formatNumberCO(mVPtotal, 2, 2)}, y al final del año todo vale COP {formatNumberCO(mVFtotal, 2, 2)}. Es la misma operación mirada desde dos fechas. Por eso siempre hay que decir en qué fecha estamos mirando.
        </Interpretacion>

        {/* INCÓGNITAS */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Cuando lo que no sabemos es el pago extra o la cuota</div>
        <p>Es el mismo plan de siempre: la incógnita se deja como una letra y se despeja. Estas son las tres más usadas:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Hallar un pago extra P (con VP)" tono="azul">
            <div style={{ fontFamily: F_MONO, fontSize: 13 }}>P = (VP − VP de la anualidad) / (1/(1+i)^n1 + 1/(1+i)^n2 + ...)</div>
          </TarjetaMini>
          <TarjetaMini titulo="Hallar la cuota A (con VP y extras conocidos)" tono="azul">
            <div style={{ fontFamily: F_MONO, fontSize: 13 }}>A = (VP − VP de los extras) / [((1+i)^n − 1) / (i × (1+i)^n)]</div>
          </TarjetaMini>
          <TarjetaMini titulo="Hallar la cuota A (con VF y extras conocidos)" tono="azul">
            <div style={{ fontFamily: F_MONO, fontSize: 13 }}>A = (VF − VF de los extras) / [((1+i)^n − 1) / i]</div>
          </TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 10 }}>Con valor futuro es igual, pero se usa la fórmula de VF y los extras se multiplican en lugar de dividirse. En la sección 10 hay un ejemplo completo donde la incógnita es el pago extra.</p>

        {/* ERRORES */}
        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 8px" }}>Errores comunes con los pagos extra</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TarjetaMini titulo="1. Meter el pago extra dentro de la fórmula de anualidades" tono="alerta">
            La fórmula solo sirve para cuotas iguales. El pago extra siempre va aparte, sumado al final.
          </TarjetaMini>
          <TarjetaMini titulo="2. Dividir cuando había que multiplicar (o al revés)" tono="alerta">
            Pregúntate: ¿el pago está antes o después de la fecha focal? Después → se divide. Antes → se multiplica.
          </TarjetaMini>
          <TarjetaMini titulo="3. Usar mal el exponente" tono="alerta">
            Con VP el exponente es el periodo del pago (n1). Con VF el exponente es lo que falta para llegar al final (n − n1).
          </TarjetaMini>
          <TarjetaMini titulo="4. Mezclar fechas focales" tono="alerta">
            Todos los valores tienen que llegar a la misma fecha. No se puede sumar la anualidad llevada a hoy con un pago extra llevado al final.
          </TarjetaMini>
        </div>

        <div style={{ marginTop: 16 }}>
          <TarjetaMini titulo="Otro ejemplo de la vida real: el carro" tono="azul">
            Pagas 36 cuotas iguales de un carro y además haces un abono extra junto con la cuota 17. Las 36 cuotas forman la anualidad. El abono extra se calcula aparte, como pago suelto en el periodo 17, y se suma al total.
          </TarjetaMini>
        </div>
      </Acordeon>

      {/* SECCIÓN 10 */}
      <Acordeon title="10 · Ejemplo completo: la casa con dos pagos extra">
        <p>Una pareja compró una casa hoy por COP 720.000.000. Pagaron cuotas bimestrales de COP 8.927.479,48 durante 15 años. La tasa es 5,73 % NAC (nominal anual, se cobra cada cuatrimestre). Además hicieron 2 pagos extra, en los bimestres 20 y 40, ambos por el mismo valor. ¿De cuánto fue cada pago extra?</p>
        <TarjetaMini titulo="Qué es qué" tono="azul">
          La anualidad son las 90 cuotas iguales. Los pagos sueltos son los dos X. La fecha focal es hoy (momento 0), porque la casa se compró hoy por COP 720.000.000.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — ¿De qué tamaño son las cuotas?", content: "Son bimestrales (cada 2 meses). Necesitamos una tasa efectiva bimestral." },
          { label: "Paso 2a — Repartir la nominal", content: "Un año tiene 3 cuatrimestres: 5,73 % / 3 = 1,91 % efectiva cuatrimestral" },
          { label: "Paso 2b — Cambiar de tamaño", content: "EB = (1 + 0,0191)^(3/6) − 1 ≈ 0,95 % efectiva bimestral" },
          { label: "Paso 3a — ¿Cuántas cuotas hay?", content: "15 años = 180 meses. Como cada cuota es cada 2 meses: n = 180 / 2 = 90 cuotas" },
          { label: "Paso 3b — Traer las 90 cuotas a hoy", content: "VP = 8.927.479,48 × [((1 + 0,0095)^90 − 1) / (0,0095 × (1 + 0,0095)^90)]" },
          { label: "Resultado del paso 3", content: "VP de la anualidad ≈ COP 538.465.173,45" },
          { label: "Paso 4 — Armar la ecuación de valor", content: "720.000.000 = 538.465.173,45 + X/(1 + 0,0095)^20 + X/(1 + 0,0095)^40" },
          { label: "Paso 5 — Calcular los factores de cada pago extra", content: `1/(1,0095)^20 ≈ ${formatNumberCO(factor20, 4, 4)} · 1/(1,0095)^40 ≈ ${formatNumberCO(factor40, 4, 4)}` },
          { label: "Paso 6 — Agrupar los dos pagos extra", content: `720.000.000 = 538.465.173,45 + X × (${formatNumberCO(factor20, 4, 4)} + ${formatNumberCO(factor40, 4, 4)}) = 538.465.173,45 + X × ${formatNumberCO(factor20 + factor40, 4, 4)}` },
          { label: "Paso 7 — Pasar lo conocido al otro lado", content: "720.000.000 − 538.465.173,45 = 181.534.826,55" },
          { label: "Paso 8 — Despejar X", content: `X = 181.534.826,55 / ${formatNumberCO(factor20 + factor40, 4, 4)}` },
          { label: "Resultado", content: "X ≈ COP 120.000.000 (cada pago extra)" },
          { label: "Comprobación", content: `120.000.000 × ${formatNumberCO(factor20, 4, 4)} ≈ ${formatNumberCO(120000000 * factor20 / 1e6, 1, 1)} millones · 120.000.000 × ${formatNumberCO(factor40, 4, 4)} ≈ ${formatNumberCO(120000000 * factor40 / 1e6, 1, 1)} millones · cuotas 538,5 millones → total ≈ 720 millones` },
        ]} />
        <Interpretacion>
          Las 90 cuotas aportan COP 538,5 millones al valor de la casa de hoy. Los COP 181,5 millones que faltan los cubren los dos pagos extra: cada uno es de COP 120.000.000 cuando se paga, pero traídos a hoy valen menos (unos 99,3 millones y 82,2 millones), porque llegan más adelante. En clase los factores se redondean a 0,83 y 0,69 (suman 1,51); aquí usamos más decimales y el resultado sigue dando 120 millones.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Ejemplo del carro">
        <p>Hace 5 años compraste un carro. Debes pagar cuotas mensuales de COP 3.078.925,79 con una tasa del 0,71 % periódica mensual. ¿Cuánto costó el carro el día que lo compraron?</p>
        <TarjetaMini titulo="Pista" tono="azul">
          Queremos saber cuánto costó EL DÍA DE LA COMPRA, o sea hoy en la línea de tiempo. Eso es un valor presente.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Datos", content: "A = 3.078.925,79 · i = 0,71 % = 0,0071 · n = 5 años × 12 meses = 60 cuotas" },
          { label: "Fórmula", content: "VP = A × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
          { label: "Sustitución", content: "VP = 3.078.925,79 × [((1 + 0,0071)^60 − 1) / (0,0071 × (1 + 0,0071)^60)]" },
          { label: "Resultado", content: "VP ≈ COP 150.000.000,06" },
          { label: "Interpretación", content: "El carro costó aproximadamente COP 150.000.000 cuando lo compraron." },
        ]} />
        <Interpretacion>
          Pagaste 60 cuotas de unos COP 3,08 millones (cerca de COP 184,7 millones en total) por un carro que valía COP 150 millones el día de la compra. La diferencia son los intereses del crédito.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Cierre y preguntas de repaso">
        <div style={{ padding: 16, background: "#FDF3E7", border: `1px solid ${C.gold}55`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: C.navy, marginBottom: 8 }}>Antes de seguir, intenta responder sin mirar los apuntes:</div>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>¿Qué se requiere para que un pago sea considerado una anualidad?</li>
            <li>¿Un pago extra se puede considerar una cuota?</li>
            <li>¿Las cuotas y la tasa de interés tienen que tener la misma periodicidad?</li>
            <li>¿Qué diferencia hay entre valor presente y valor futuro?</li>
            <li>¿Qué significa que una anualidad sea vencida?</li>
            <li>¿Cómo se suma un pago extra a una anualidad y qué papel tiene la fecha focal?</li>
          </ol>
        </div>
        <Acordeon title="Ver respuestas esperadas">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>Debe tener pagos iguales, periódicos, mismo número de pagos y periodos, y misma tasa.</li>
            <li style={{ marginBottom: 6 }}>No. El pago extra se calcula aparte.</li>
            <li style={{ marginBottom: 6 }}>Sí. La tasa debe coincidir con el periodo de las cuotas.</li>
            <li style={{ marginBottom: 6 }}>El valor presente trae las cuotas a hoy; el valor futuro las lleva al final.</li>
            <li style={{ marginBottom: 6 }}>Que la cuota se paga al final de cada periodo.</li>
            <li>El pago extra se calcula aparte de la fórmula de anualidades: se mueve hasta la fecha focal (se divide si va para atrás, se multiplica si va para adelante) y se suma al valor de la anualidad. La fecha focal es hoy si quiero un VP y el final si quiero un VF.</li>
          </ol>
        </Acordeon>
        <p style={{ color: C.slate }}>Próximamente: ¿y si pagas todo al inicio del periodo? Eso será la anualidad anticipada.</p>
      </Acordeon>

    </div>
  );
}

/* ============================================================
   ANUALIDADES ANTICIPADAS — módulo educativo
   Clase interactiva: se conecta con Interés compuesto (módulo 2),
   Conversión de tasas (módulo 4) y Anualidades vencidas (módulo 5).
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
  // Factores de anualidad vencida (se usan en todo el módulo)
  const fVP = (i, n) => (Math.pow(1 + i, n) - 1) / (i * Math.pow(1 + i, n));
  const fVF = (i, n) => (Math.pow(1 + i, n) - 1) / i;

  // Ejemplo de clase: 3 cuotas de 1.000 al 5 % (secciones 5, 6 y 7)
  const eA = 1000, ei = 0.05, en = 3;
  const eVPv = eA * fVP(ei, en);
  const eVPa = eA * (1 + ei) * fVP(ei, en);
  const eVFv = eA * fVF(ei, en);
  const eVFa = eA * fVF(ei, en) * (1 + ei);
  const eVFaAlt = eA * ((Math.pow(1 + ei, en + 1) - (1 + ei)) / ei);
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
        {`Imagina que tu papá te lleva a la tienda de la esquina y te dice: "Hoy te compro una paleta cada semana. Pero ojo: primero pagas, y solo después te la comes".

Ese es el truco: la plata sale PRIMERO y la paleta llega DESPUÉS.

En una anualidad vencida pasaba al revés: primero pasaba el tiempo y al final pagabas, como en el restaurante, que primero comes y después pagas la cuenta.

En una anualidad anticipada es como el cine: primero pagas la boleta y después ves la película.

Y no, no es que te hayas puesto a pagar antes "por equivocación". Es que así se acordó desde el comienzo, como una regla del juego.

Lo demás se queda igual: sigue siendo una fila de pagos IGUALES, uno cada cierto tiempo, y siempre con el mismo interés. Lo único que se mueve es el momento del pago: ahora cae al comienzo de cada periodo.

Y otra vez, aunque diga "anualidad", los pagos no tienen que ser una vez al año. Pueden ser cada semana, cada mes, cada dos meses, cada tres meses...

Ejemplos de la vida real: el arriendo que pagas el día 1 y luego vives el mes, la matrícula que pagas antes de empezar clases, el seguro que pagas antes de quedar cubierto, el gimnasio que pagas antes de usarlo.

Un secreto para que lo recuerdes: como cada pago se hace un periodo ANTES, cada pago tiene un periodito más para ganar intereses o para valer más. Por eso una anualidad anticipada siempre vale un poquito más que una vencida.`}
      </NivelCinco>

      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 13.5, color: C.slate, marginBottom: 14 }}>
        <strong style={{ color: C.navy }}>Esta clase se apoya en tres módulos que ya viste:</strong> el módulo 2 (interés compuesto), el módulo 4 (conversión de tasas) y el módulo 5 (anualidades vencidas). Si algo no te suena, vuelve un momento a ellos: aquí los vamos a usar todo el tiempo.
      </div>

      {/* SECCIÓN 1 */}
      <Acordeon title="1 · ¿Qué cambia frente a una anualidad vencida?" defaultOpen>
        <p><strong>¿Qué es lo que NO cambia?</strong> Las 4 condiciones para que algo sea anualidad siguen siendo exactamente las mismas que ya conoces:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="1. Pagos iguales">Todas las cuotas valen lo mismo.</TarjetaMini>
          <TarjetaMini titulo="2. Pagos periódicos">Se pagan cada cierto tiempo fijo.</TarjetaMini>
          <TarjetaMini titulo="3. Un pago por periodo">Si hay 12 periodos, hay 12 cuotas.</TarjetaMini>
          <TarjetaMini titulo="4. La misma tasa">El mismo interés para todos los pagos.</TarjetaMini>
        </div>
        <p><strong>¿Qué es lo único que cambia?</strong> El momento del pago dentro de cada periodo.</p>
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
          Si hay n cuotas y la primera cae en el momento 0, la última cae en el momento n − 1. En el momento n ya no hay cuota: ahí termina el último periodo.
        </TarjetaMini>

        <TarjetaMini titulo="La frase para recordar" tono="azul">
          Vencida: primero pasa el tiempo y después pagas. Anticipada: primero pagas y después pasa el tiempo.
        </TarjetaMini>

        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>Ejemplos reales de pagos anticipados en Colombia</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Arriendo">Lo pagas el día 1 del mes y después vives en la casa todo el mes.</TarjetaMini>
          <TarjetaMini titulo="Seguro">Pagas la póliza antes de que empiece la cobertura.</TarjetaMini>
          <TarjetaMini titulo="Matrícula">Pagas antes de iniciar el semestre y después empiezan las clases.</TarjetaMini>
          <TarjetaMini titulo="Leasing">Muchos contratos de leasing piden la cuota al inicio de cada periodo.</TarjetaMini>
          <TarjetaMini titulo="Gimnasio">Pagas la mensualidad y después vas todo el mes.</TarjetaMini>
        </div>
        <Interpretacion>
          Fíjate que es la misma fila de cuotas iguales. Lo único que se corrió fue la fecha: cada cuota se movió un periodo hacia el comienzo. Esa pequeña diferencia es la que cambia todos los resultados.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 2 */}
      <Acordeon title={"2 · ¿Qué significa \"anticipada\"?"}>
        <p><strong>¿Qué es?</strong> Una anualidad anticipada es una fila de pagos iguales que haces <strong>al comienzo</strong> de cada periodo.</p>
        <p><strong>¿Cómo funciona?</strong> Al comienzo se pacta cuándo se paga. Si dice "se paga al empezar el mes", pagas ese día y después viene el mes.</p>
        <TarjetaMini titulo={"\"Anticipada\" NO significa error"} tono="alerta">
          No quiere decir que pagaste antes por equivocación. Quiere decir que así se acordó desde el principio, como una regla del juego.
        </TarjetaMini>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 8px" }}>Cuatro situaciones del día a día</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Arriendo" tono="azul">Pagas el arriendo el día 1 y luego vives el mes.</TarjetaMini>
          <TarjetaMini titulo="Matrícula" tono="azul">Pagas la matrícula antes de empezar clases.</TarjetaMini>
          <TarjetaMini titulo="Póliza" tono="azul">Pagas la póliza antes de recibir la cobertura.</TarjetaMini>
          <TarjetaMini titulo="Gimnasio" tono="azul">Pagas el gimnasio antes de usarlo durante el mes.</TarjetaMini>
        </div>
        <p style={{ marginTop: 12 }}><strong>¿Por qué importa?</strong> Porque pagar antes o después cambia cuánto vale la plata. Un billete de hoy no vale lo mismo que uno de dentro de un mes.</p>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 8px" }}>Diferencia con la anualidad vencida</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Anualidad vencida">Primero uso o pasa el periodo, luego pago.</TarjetaMini>
          <TarjetaMini titulo="Anualidad anticipada">Primero pago, luego uso o pasa el periodo.</TarjetaMini>
        </div>
        <Interpretacion>
          Para saber cuál es, pregúntate: ¿pago cuando termina el mes o cuando empieza? Si es cuando empieza, es anticipada.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 3 */}
      <Acordeon title="3 · No es lo mismo tasa anticipada que anualidad anticipada">
        <p>Estas dos palabras se parecen mucho y casi todos las confunden. Pero son cosas distintas.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Tarjeta 1 · Tasa anticipada" tono="azul">
            Habla del <strong>interés</strong>. Dice cuándo te cobran el interés: al comienzo.
          </TarjetaMini>
          <TarjetaMini titulo="Tarjeta 2 · Anualidad anticipada" tono="azul">
            Habla de la <strong>cuota</strong>. Dice cuándo pagas la cuota: al comienzo.
          </TarjetaMini>
        </div>
        <TarjetaMini titulo="Para entenderlo fácil" tono="neutral">
          Una cosa es CUÁNDO te cobran el interés. Otra cosa es CUÁNDO pagas la cuota. Se parecen, pero no son lo mismo, como un perro y un gato: los dos tienen cuatro patas, pero son distintos.
        </TarjetaMini>
        <div style={{ marginTop: 12, padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            No confundas la <strong>tasa anticipada</strong> con la <strong>anualidad anticipada</strong>. No son lo mismo. Y no se puede resolver una anualidad anticipada metiendo, sin más, una tasa anticipada dentro de la fórmula de las anualidades vencidas.
          </div>
        </div>
        <p style={{ marginTop: 14 }}><strong>¿Entonces qué tasa se usa?</strong> Para calcular anualidades anticipadas se usan tasas <strong>efectivas vencidas</strong> que coincidan con el periodo de pago de las cuotas. Si la tasa viene anticipada, primero se pasa a vencida con la fórmula del módulo 4:</p>
        <BloqueFormula>{"iv = ia / (1 − ia)"}</BloqueFormula>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 8px" }}>Las cuatro combinaciones que pueden aparecer</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Tasa vencida + cuota vencida">Ya la conoces: es el módulo 5.</TarjetaMini>
          <TarjetaMini titulo="Tasa vencida + cuota anticipada">Es la fórmula de este módulo.</TarjetaMini>
          <TarjetaMini titulo="Tasa anticipada + cuota vencida">Primero la tasa pasa a vencida; luego se usa la fórmula de vencidas.</TarjetaMini>
          <TarjetaMini titulo="Tasa anticipada + cuota anticipada">Primero la tasa pasa a vencida; luego se usa la fórmula de este módulo.</TarjetaMini>
        </div>
        <Interpretacion>
          Cada pregunta se resuelve por separado. Primero miras la tasa y la dejas como efectiva vencida del tamaño de las cuotas. Después miras la cuota y decides si usas la fórmula de vencida o la de anticipada.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 4 */}
      <Acordeon title="4 · Conexión con interés compuesto y conversión de tasas">
        <TarjetaMini titulo="Dicho claramente" tono="azul">
          Las anualidades se calculan con <strong>interés compuesto</strong>. Todas: las vencidas y las anticipadas. No se usa interés simple.
        </TarjetaMini>
        <p style={{ marginTop: 12 }}><strong>¿Por qué?</strong> Cada cuota cae en un momento distinto del tiempo. Para llevar una cuota hasta hoy o hasta el final, usamos factores de interés compuesto: la cuota se divide o se multiplica por (1 + i) elevado a los periodos que la separan de la fecha elegida.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Lo que aprendiste en el módulo 2</div>
        <BloqueFormula>{"VF = VP × (1 + i)^n"}</BloqueFormula>
        <p style={{ color: C.slate }}>Con una anualidad usamos la misma lógica, pero no con un solo pago: la aplicamos a muchas cuotas iguales y las sumamos. Las fórmulas de anualidades son simplemente ese resultado, ya resumido.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>Conexión con la conversión de tasas (módulo 4)</div>
        <p>Antes de usar cualquier fórmula de anualidad, la tasa debe estar en el mismo periodo que las cuotas:</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Cuotas mensuales">La tasa debe ser mensual.</TarjetaMini>
          <TarjetaMini titulo="Cuotas bimestrales">La tasa debe ser bimestral.</TarjetaMini>
          <TarjetaMini titulo="Cuotas trimestrales">La tasa debe ser trimestral.</TarjetaMini>
        </div>
        <div style={{ marginTop: 12 }}>
          <TarjetaMini titulo="Advertencia" tono="alerta">
            Si la tasa viene nominal o anticipada, primero se debe convertir a una tasa efectiva vencida del periodo correcto. Solo después entra a la fórmula.
          </TarjetaMini>
        </div>
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>El camino completo de la tasa</div>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Repartir la nominal", content: "ip = NA / nc  (nominal a periódica)" },
          { label: "Paso 2 — Si es anticipada, pasarla a vencida", content: "iv = ia / (1 − ia)" },
          { label: "Paso 3 — Cambiar de tamaño hasta el periodo de las cuotas", content: "(1 + iy)^(ny/nx) − 1 = ix" },
          { label: "Paso 4 — Usar la tasa en la fórmula", content: "Ahora sí: efectiva vencida del mismo tamaño que las cuotas." },
        ]} />
        <Interpretacion>
          La fórmula de anualidades solo entiende un tipo de tasa: efectiva vencida, del mismo tamaño que las cuotas. Todo lo demás se traduce primero con el módulo 4.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 5 */}
      <Acordeon title="5 · ¿Por qué el resultado cambia frente a una anualidad vencida?">
        <p><strong>¿Qué pasa?</strong> Con los mismos datos, la anticipada da un resultado distinto al de la vencida. Hay una sola razón: cada pago se hace un periodo ANTES.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Como cada pago se hace un periodo antes, cada pago tiene un periodito más para crecer. Es como si cada galleta de la fila se hubiera corrido un puestico hacia adelante.
        </TarjetaMini>
        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>La relación clave</div>
        <BloqueFormula>{"Valor de anualidad anticipada = valor de anualidad vencida × (1 + i)"}</BloqueFormula>
        <BloqueFormula>{"VP anticipada = VP vencida × (1 + i)"}</BloqueFormula>
        <BloqueFormula>{"VF anticipada = VF vencida × (1 + i)"}</BloqueFormula>
        <p>La anticipada está un periodo adelantada. Por eso se multiplica por (1 + i).</p>
        <div style={{ fontWeight: 700, color: C.navy, margin: "16px 0 6px" }}>¿En qué dirección cambia?</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Valor presente" tono="azul">Si la tasa es positiva, el VP de la anticipada es MAYOR que el VP de la vencida con los mismos datos.</TarjetaMini>
          <TarjetaMini titulo="Valor futuro" tono="azul">Si la tasa es positiva, el VF de la anticipada es MAYOR que el VF de la vencida con los mismos datos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>Diferencia con lo que ya conoces:</strong> en la vencida no se multiplica por nada extra. En la anticipada aparece un (1 + i) más. Si recuerdas ese (1 + i), ya sabes pasar de una a la otra.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico (con los números que usaremos en las secciones 6 y 7)</div>
          <p>3 cuotas de COP 1.000 con una tasa del 5 % efectivo por periodo. Vamos a ver las dos versiones lado a lado.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
            <TarjetaMini titulo="Vencida">VP = COP {formatMilesCO(eVPv)} · VF = COP {formatMilesCO(eVFv)}</TarjetaMini>
            <TarjetaMini titulo="Anticipada">VP = COP {formatMilesCO(eVPa)} · VF = COP {formatMilesCO(eVFa)}</TarjetaMini>
          </div>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Relación", content: "Anticipada = vencida × (1 + i) = vencida × 1,05" },
              { label: "Valor presente", content: `${formatMilesCO(eVPv)} × 1,05 = COP ${formatMilesCO(eVPa)}` },
              { label: "Valor futuro", content: `${formatMilesCO(eVFv)} × 1,05 = COP ${formatMilesCO(eVFa)}` },
              { label: "Interpretación", content: "Las dos versiones suben exactamente 5 %: justo el (1 + i) de un periodo." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Las cuotas anticipadas valen {formatPctMilesCO(eVPa / eVPv - 1, 0)} más que las vencidas, tanto hoy como al final. Ese 5 % no es casualidad: es la tasa de un periodo, porque cada cuota se adelantó un periodo.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 6 */}
      <Acordeon title="6 · Valor presente: cuánto valen hoy cuotas que se pagan al inicio">
        <p><strong>¿Qué es?</strong> El valor presente de una anualidad anticipada te dice <strong>cuánto valen hoy</strong> todos los pagos que haces al comienzo de cada periodo.</p>
        <p><strong>¿Cómo funciona?</strong> Empezamos con lo que ya sabes: el valor presente de la vencida. Como en la anticipada todo pasa un periodo antes, lo multiplicamos por (1 + i).</p>
        <p style={{ color: C.slate }}><strong>¿Por qué importa?</strong> Con este valor sabes cuánto costó de verdad un crédito con cuotas anticipadas, o cuánto vale hoy un contrato de arriendo o de leasing.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Primero, la relación con la vencida</div>
        <BloqueFormula>{"VP anticipada = VP vencida × (1 + i)"}</BloqueFormula>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Después, la fórmula completa</div>
        <BloqueFormula>{"VP = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ]"}</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VP">El valor de todas las cuotas hoy.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota o anualidad.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}>La parte entre corchetes es la fórmula de anualidad vencida, la misma del módulo 5. El factor (1 + i) aparece porque la anualidad anticipada está un periodo antes.</p>
        <p style={{ color: C.slate }}><strong>Diferencia con la vencida:</strong> la única diferencia en la fórmula es ese (1 + i) que multiplica.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 anualidades anticipadas de COP 1.000 a una tasa del 5 % efectivo periódico. ¿Cuál es el valor presente de las anualidades?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
              { label: "Sustitución", content: "VP = 1.000 × (1 + 0,05) × [((1 + 0,05)^3 − 1) / (0,05 × (1 + 0,05)^3)]" },
              { label: "Resultado", content: `VP = COP ${formatMilesCO(eVPa)}` },
              { label: "Comparación con vencida", content: `VP vencida = COP ${formatMilesCO(eVPv)}` },
              { label: "Relación", content: `VP anticipada = ${formatMilesCO(eVPv)} × (1 + 5 %) = COP ${formatMilesCO(eVPv * (1 + ei))}` },
              { label: "Comprobación como suma", content: `1.000 + 1.000/1,05 + 1.000/1,05^2 = COP ${formatMilesCO(eVPsuma)}  (la primera cuota no se descuenta: ya está en el momento 0)` },
              { label: "Interpretación", content: "Las cuotas anticipadas valen más hoy que las vencidas porque se pagan un periodo antes." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Pagarás COP 3.000 en total, pero hoy esas cuotas valen COP {formatMilesCO(eVPa)}. Con cuotas vencidas valían COP {formatMilesCO(eVPv)}. La diferencia de COP {formatMilesCO(eVPa - eVPv)} existe porque la primera cuota se paga hoy mismo y todas las demás se pagan un periodo antes.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 7 */}
      <Acordeon title="7 · Valor futuro: cuánto valen al final cuotas pagadas al inicio">
        <p><strong>¿Qué es?</strong> El valor futuro de una anualidad anticipada te dice <strong>cuánto tienes al final</strong> si pagaste o ahorraste lo mismo al comienzo de cada periodo.</p>
        <TarjetaMini titulo="Para entenderlo fácil" tono="azul">
          Es la alcancía mágica otra vez. Si metes las monedas al comienzo de cada mes, cada moneda alcanza a trabajar un mes más. Por eso al final hay más moneditas.
        </TarjetaMini>
        <p style={{ color: C.slate, marginTop: 12 }}><strong>¿Por qué importa?</strong> Sirve para saber cuánto vas a tener si ahorras al comienzo de cada periodo, por ejemplo en un fondo de pensiones voluntarias o un CDT con aportes mensuales.</p>

        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Primero, la relación con la vencida</div>
        <BloqueFormula>{"VF anticipada = VF vencida × (1 + i)"}</BloqueFormula>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Después, la fórmula clara</div>
        <BloqueFormula>{"VF = A × [ ((1 + i)^n − 1) / i ] × (1 + i)"}</BloqueFormula>
        <div style={{ fontSize: 13, color: C.slate, margin: "12px 0 4px" }}>Y la forma equivalente</div>
        <BloqueFormula>{"VF = A × [ ((1 + i)^(n+1) − (1 + i)) / i ]"}</BloqueFormula>
        <p style={{ color: C.slate }}>Las dos fórmulas significan exactamente lo mismo: dan el mismo resultado. Usa la que te resulte más cómoda.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0" }}>
          <TarjetaMini titulo="VF">El valor de todas las cuotas al final.</TarjetaMini>
          <TarjetaMini titulo="A">La cuota o anualidad.</TarjetaMini>
          <TarjetaMini titulo="i">La tasa efectiva vencida del periodo.</TarjetaMini>
          <TarjetaMini titulo="n">El número de pagos.</TarjetaMini>
        </div>
        <p style={{ color: C.slate }}><strong>Diferencia con la vencida:</strong> otra vez, es el mismo VF de la vencida multiplicado por (1 + i). El "final" de la anticipada es el momento n, un periodo después de la última cuota.</p>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
          <p>Vamos a pagar 3 anualidades anticipadas de COP 1.000 a una tasa del 5 % efectivo periódico. ¿Cuál es el valor futuro de las anualidades?</p>
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Datos", content: "A = 1.000 · i = 5 % = 0,05 · n = 3" },
              { label: "Fórmula", content: "VF = A × [((1 + i)^n − 1) / i] × (1 + i)" },
              { label: "Sustitución", content: "VF = 1.000 × [((1 + 0,05)^3 − 1) / 0,05] × (1 + 0,05)" },
              { label: "Resultado", content: `VF = COP ${formatMilesCO(eVFa)}` },
              { label: "Comparación con vencida", content: `VF vencida = COP ${formatMilesCO(eVFv)}` },
              { label: "Relación", content: `VF anticipada = ${formatMilesCO(eVFv)} × (1 + 5 %) = COP ${formatMilesCO(eVFv * (1 + ei))}` },
              { label: "Con la fórmula equivalente", content: `VF = 1.000 × [((1,05)^4 − 1,05) / 0,05] = COP ${formatMilesCO(eVFaAlt)}` },
              { label: "Comprobación como suma", content: `1.000 × 1,05^3 + 1.000 × 1,05^2 + 1.000 × 1,05 = COP ${formatMilesCO(eVFsuma)}` },
              { label: "Interpretación", content: "El valor futuro es mayor porque cada pago tuvo un periodo más para crecer." },
            ]} />
          </Acordeon>
          <Interpretacion>
            Pusiste COP 3.000 en total y al final tienes COP {formatMilesCO(eVFa)}. Con cuotas vencidas habrías tenido COP {formatMilesCO(eVFv)}. Cada cuota tuvo un periodo más para crecer, y por eso ganaste COP {formatMilesCO(eVFa - eVFv)} adicionales.
          </Interpretacion>
        </div>
      </Acordeon>

      {/* SECCIÓN 8 */}
      <Acordeon title="8 · Cómo hallar la cuota A desde VP o VF">
        <p>A veces ya sabemos cuánto cuesta lo que compramos o cuánta plata queremos juntar, y la pregunta es: <strong>¿de cuánto es cada cuota anticipada?</strong></p>
        <p style={{ color: C.slate }}>Para eso usamos las mismas fórmulas de antes, "despejando" la A.</p>

        <div style={{ fontWeight: 700, color: C.navy, margin: "14px 0 4px" }}>Caso 1 · Hallar A desde VP</div>
        <BloqueFormula>{"A = VP / { (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] }"}</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando conozco el valor presente del crédito o de la obligación y quiero hallar la cuota anticipada.</p>
        <p>Halle el valor de la anualidad anticipada de un crédito con 24 cuotas mensuales, valor presente de COP 30.000.000 y tasa de interés del 30 % NAMA.</p>
        <TarjetaMini titulo={"¿Qué significa \"30 % NAMA\"?"} tono="azul">
          Nominal Anual con capitalización Mensual Anticipada. Es una tasa nominal (se reparte), que se cobra cada mes (primer apellido) y al comienzo del mes (segundo apellido: anticipada).
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
            { label: "Interpretación", content: `Para pagar anticipadamente un crédito de COP 30.000.000 en 24 cuotas mensuales con esa tasa, cada cuota debe ser aproximadamente COP ${formatMilesCO(c1A)}.` },
          ]} />
        </Acordeon>
        <Interpretacion>
          En total pagarías unos COP {formatMilesCO(c1Total / 1e6, 2)} millones (24 × {formatMilesCO(c1A)}) por un crédito de COP 30 millones. La diferencia son los intereses. Además, cada cuota sale un poco menor que en una vencida con la misma tasa, porque la primera se paga hoy y baja la deuda desde el comienzo.
        </Interpretacion>

        <div style={{ fontWeight: 700, color: C.navy, margin: "22px 0 4px" }}>Caso 2 · Hallar A desde VF</div>
        <BloqueFormula>{"A = VF × [ i / ((1 + i)^n − 1) ] / (1 + i)"}</BloqueFormula>
        <p style={{ color: C.slate }}>Se usa cuando conozco el valor futuro que quiero alcanzar y quiero saber cuánto debe ser cada cuota anticipada.</p>
        <p>Halle el valor de la anualidad anticipada de 36 cuotas trimestrales, con valor futuro de COP 150.000.000 y tasa del 30 % NAMA.</p>
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
        <p style={{ color: C.slate, marginTop: 10 }}><strong>Diferencia entre los dos casos:</strong> desde VP la cuota paga una deuda que existe hoy; desde VF la cuota construye un ahorro que existirá en el futuro.</p>
      </Acordeon>

      {/* SECCIÓN 9 */}
      <Acordeon title="9 · Error común: usar una tasa nominal o anticipada directamente">
        <div style={{ padding: 16, background: C.dangerBg, border: `1px solid ${C.danger}55`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.danger, fontWeight: 700, marginBottom: 6 }}>
            Advertencia
          </div>
          <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
            En anualidades anticipadas NO basta con meter una tasa nominal o una tasa anticipada directamente en la fórmula. Las tasas que se deben usar son tasas efectivas vencidas que hagan "match" con el periodo de pago de las cuotas.
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
        <div style={{ fontSize: 13, color: C.slate, margin: "14px 0 6px" }}>El procedimiento correcto (25 % NATA es nominal anual, con capitalización trimestral anticipada)</div>
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
        <p><strong>¿Qué es?</strong> Igual que en las anualidades vencidas, en las anticipadas también puede haber pagos adicionales: dinero que se paga fuera de la fila de cuotas iguales.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <TarjetaMini titulo="Cuota inicial">Un pago grande al comienzo.</TarjetaMini>
          <TarjetaMini titulo="Abono extraordinario">Plata extra que pones al crédito.</TarjetaMini>
          <TarjetaMini titulo="Pago en una fecha específica">Por ejemplo la prima de junio o de diciembre.</TarjetaMini>
          <TarjetaMini titulo="Dos pagos iguales">El mismo valor en dos fechas distintas.</TarjetaMini>
        </div>
        <TarjetaMini titulo="Regla sencilla" tono="azul">
          Las cuotas iguales van en la fórmula de anualidad anticipada. Los pagos diferentes van por fuera, como flujos adicionales. No se pueden meter dentro de la fórmula porque no hacen parte de la fila de cuotas iguales.
        </TarjetaMini>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>La estructura</div>
        <BloqueFormula>{"VP total = VP de la anualidad anticipada + VP de pagos extra"}</BloqueFormula>
        <BloqueFormula>{"VF total = VF de la anualidad anticipada + VF de pagos extra"}</BloqueFormula>
        <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0 4px" }}>Con el signo de suma, para cualquier cantidad de pagos extra</div>
        <BloqueFormula>{"VP total = A × (1 + i) × [ ((1 + i)^n − 1) / (i × (1 + i)^n) ] + Σ Pk / (1 + i)^nk"}</BloqueFormula>
        <BloqueFormula>{"VF total = A × [ ((1 + i)^n − 1) / i ] × (1 + i) + Σ Pk × (1 + i)^(n − nk)"}</BloqueFormula>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
          <TarjetaMini titulo="A">La cuota anticipada igual.</TarjetaMini>
          <TarjetaMini titulo="i">Tasa efectiva vencida del mismo tamaño que las cuotas.</TarjetaMini>
          <TarjetaMini titulo="n">Número total de cuotas.</TarjetaMini>
          <TarjetaMini titulo="Pk">El valor de cada pago extra.</TarjetaMini>
          <TarjetaMini titulo="nk">El periodo en que cae cada pago extra.</TarjetaMini>
        </div>

        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>La fecha focal: todos en la misma foto</div>
        <p>Para sumar pagos que caen en momentos distintos, todos deben llevarse al mismo momento. Ese momento es la fecha focal.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="Si quiero valor presente" tono="azul">Traigo todo a hoy (momento 0). Los pagos extra se dividen entre (1 + i)^nk.</TarjetaMini>
          <TarjetaMini titulo="Si quiero valor futuro" tono="azul">Llevo todo al final (momento n). Los pagos extra se multiplican por (1 + i)^(n − nk).</TarjetaMini>
        </div>
        <div style={{ fontWeight: 700, color: C.navy, margin: "18px 0 4px" }}>Receta en 4 pasos</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <TarjetaMini titulo="1. Elige la fecha focal">¿Quiero VP o VF? Hoy o el final.</TarjetaMini>
          <TarjetaMini titulo="2. Calcula la anualidad anticipada">Usa la fórmula de este módulo solo con las cuotas iguales.</TarjetaMini>
          <TarjetaMini titulo="3. Mueve cada pago extra">Divide o multiplica según esté después o antes de la fecha focal.</TarjetaMini>
          <TarjetaMini titulo="4. Suma todo">Anualidad anticipada + pagos extra ya movidos.</TarjetaMini>
        </div>
        <div style={{ marginTop: 12 }}>
          <TarjetaMini titulo="Error común" tono="alerta">
            Meter el pago extra dentro de la fórmula de anualidades, o sumar la anualidad llevada a hoy con un pago extra llevado al final. Todo debe llegar a la misma fecha.
          </TarjetaMini>
        </div>
        <Interpretacion>
          Una anualidad anticipada con pagos extra es un rompecabezas de dos partes: la fila de cuotas iguales (con su (1 + i) extra) y las piezas sueltas. Cada parte se calcula con su propia fórmula, y solo al final se suman en la misma fecha.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 11 */}
      <Acordeon title="11 · Ejemplo completo con pagos adicionales: la casa">
        <p>Una pareja compró una casa hoy por COP 720.000.000. Pagaron cuotas bimestrales anticipadas de COP 8.906.829,51 durante 15 años. La tasa es 5,73 % NACA, es decir, nominal anual capitalizable cuatrimestral anticipada. Además, hicieron 2 pagos adicionales en los bimestres 20 y 40, ambos por el mismo valor. ¿Cuál fue el valor de esos desembolsos?</p>
        <TarjetaMini titulo="Qué es qué" tono="azul">
          La anualidad son las 90 cuotas anticipadas iguales. Los pagos sueltos son los dos X. La fecha focal es hoy (momento 0), porque la casa se compró hoy por COP 720.000.000.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Paso 1 — Identificar la periodicidad de las cuotas", content: "Las cuotas son bimestrales anticipadas. Necesitamos una tasa efectiva bimestral vencida para usar en la fórmula." },
          { label: "Paso 2 — Repartir la nominal anticipada", content: `5,73 % NACA: un año tiene 3 cuatrimestres. 5,73 % / 3 = ${formatPctMilesCO(h1ia, 2)} efectiva cuatrimestral anticipada` },
          { label: "Paso 3 — Anticipada a vencida", content: `${formatPctMilesCO(h1ia, 2)} / (1 − ${formatPctMilesCO(h1ia, 2)}) ≈ ${formatPctMilesCO(h2iv, 2)} efectiva cuatrimestral vencida` },
          { label: "Paso 4 — Cuatrimestral a bimestral", content: `EB = (1 + 0,0195)^(3/6) − 1 = ${formatPctMilesCO(h3EB, 4)} ≈ 0,97 % efectiva bimestral vencida` },
          { label: "Paso 5 — ¿Cuántas cuotas hay?", content: "15 años = 180 meses. Como las cuotas son bimestrales: n = 180 / 2 = 90 cuotas" },
          { label: "Paso 6 — Valor presente de las cuotas anticipadas", content: `VP anualidad = 8.906.829,51 × (1 + ${formatMilesCO(h3EB, 6)}) × [((1 + ${formatMilesCO(h3EB, 6)})^90 − 1) / (${formatMilesCO(h3EB, 6)} × (1 + ${formatMilesCO(h3EB, 6)})^90)]` },
          { label: "Resultado del paso 6", content: `VP anualidad ≈ COP ${formatMilesCO(hVPanual)}` },
          { label: "Paso 7 — Ecuación de valor", content: `720.000.000 = ${formatMilesCO(hVPanual)} + X/(1 + ${formatMilesCO(h3EB, 6)})^20 + X/(1 + ${formatMilesCO(h3EB, 6)})^40` },
          { label: "Paso 7b — Factores de cada pago extra", content: `1/(1 + i)^20 ≈ ${formatMilesCO(hF20, 4)} · 1/(1 + i)^40 ≈ ${formatMilesCO(hF40, 4)}` },
          { label: "Paso 8 — Agrupar los pagos extra", content: `720.000.000 = ${formatMilesCO(hVPanual)} + X × (${formatMilesCO(hF20, 4)} + ${formatMilesCO(hF40, 4)}) = ${formatMilesCO(hVPanual)} + X × ${formatMilesCO(hFsuma, 4)}` },
          { label: "Paso 9 — Pasar lo conocido al otro lado", content: `720.000.000 − ${formatMilesCO(hVPanual)} = ${formatMilesCO(hResto)}` },
          { label: "Paso 9b — Despejar X", content: `X = ${formatMilesCO(hResto)} / ${formatMilesCO(hFsuma, 4)}` },
          { label: "Resultado", content: `X ≈ COP ${formatMilesCO(hX)} (cada pago adicional)` },
        ]} />
        <Interpretacion>
          Cada pago adicional fue de aproximadamente COP {formatMilesCO(hX)}. Las 90 cuotas aportan COP {formatMilesCO(hVPanual / 1e6, 1)} millones al valor de la casa de hoy, y los COP {formatMilesCO(hResto / 1e6, 1)} millones que faltan los cubren los dos pagos extra, que traídos a hoy valen menos que cuando se pagaron. En clase los factores se redondean a 0,82 y 0,68 (suman unos 1,50); aquí usamos más decimales ({formatMilesCO(hFsuma, 4)}). Este ejemplo usa la tasa cuatrimestral redondeada a 1,95 %; si se conservan todos sus decimales, X sale cerca de COP {formatMilesCO(hXexacto, 2)}. Por eso conviene guardar todos los decimales de las tasas.
        </Interpretacion>
      </Acordeon>

      {/* SECCIÓN 12 */}
      <Acordeon title="12 · Ejemplo del carro">
        <p>Hace 5 años compraste un carro. Por este carro debes pagar cuotas mensuales anticipadas de COP 3.078.925,79 a una tasa del 0,71 % periódica mensual. ¿Cuánto costó el carro cuando lo compraron? ¿Cuánto cambió frente a anualidades vencidas?</p>
        <TarjetaMini titulo="Pista" tono="azul">
          Queremos saber cuánto costó el día de la compra, o sea hoy en la línea de tiempo. Eso es un valor presente.
        </TarjetaMini>
        <FichaProcedimiento pasos={[
          { label: "Datos", content: "A = 3.078.925,79 · i = 0,71 % = 0,0071 · n = 5 años × 12 meses = 60 cuotas" },
          { label: "Fórmula", content: "VP = A × (1 + i) × [((1 + i)^n − 1) / (i × (1 + i)^n)]" },
          { label: "Sustitución", content: "VP = 3.078.925,79 × (1 + 0,0071) × [((1 + 0,0071)^60 − 1) / (0,0071 × (1 + 0,0071)^60)]" },
          { label: "Resultado", content: `VP ≈ COP ${formatMilesCO(kVPa)}` },
          { label: "Comparación", content: `En anualidades vencidas el resultado era aproximadamente COP ${formatMilesCO(kVPv)}.` },
          { label: "Diferencia", content: `${formatMilesCO(kVPa)} − ${formatMilesCO(kVPv)} = COP ${formatMilesCO(kDif, 0)}` },
          { label: "Interpretación", content: "El valor presente de la anualidad anticipada es mayor porque cada cuota ocurre un periodo antes." },
        ]} />
        <Interpretacion>
          Con cuotas anticipadas el carro costó unos COP {formatMilesCO(kVPa / 1e6, 3)} millones el día de la compra; con cuotas vencidas habría costado COP {formatMilesCO(kVPv / 1e6, 3)} millones. La diferencia es de unos COP {formatMilesCO(kDif, 0)}, exactamente el 0,71 % de la cifra anterior: el (1 + i) de un periodo.
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
            <li>¿El valor presente de una anticipada es mayor o menor que el de una vencida con los mismos datos?</li>
            <li>¿El valor futuro de una anticipada es mayor o menor que el de una vencida con los mismos datos?</li>
            <li>¿Puede haber flujos adicionales en una anualidad anticipada?</li>
            <li>¿Las anualidades se calculan con interés simple o compuesto?</li>
          </ol>
        </div>
        <Acordeon title="Ver respuestas esperadas">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>Que la cuota se paga al inicio de cada periodo.</li>
            <li style={{ marginBottom: 6 }}>No. La tasa anticipada habla del interés; la anualidad anticipada habla del momento de pago de la cuota.</li>
            <li style={{ marginBottom: 6 }}>Una tasa efectiva vencida que coincida con el periodo de pago de las cuotas.</li>
            <li style={{ marginBottom: 6 }}>Porque cada cuota ocurre un periodo antes.</li>
            <li style={{ marginBottom: 6 }}>Mayor, si la tasa es positiva.</li>
            <li style={{ marginBottom: 6 }}>Mayor, si la tasa es positiva.</li>
            <li style={{ marginBottom: 6 }}>Sí, pero se calculan aparte como flujos adicionales.</li>
            <li>Se calculan con interés compuesto.</li>
          </ol>
        </Acordeon>
        <Interpretacion>
          Si recuerdas una sola cosa: la anticipada es la vencida corrida un periodo hacia el comienzo, y por eso su valor es el de la vencida multiplicado por (1 + i).
        </Interpretacion>
      </Acordeon>

    </div>
  );
}

function Aprender() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Educación financiera</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 32, color: C.navy, margin: "0 0 26px" }}> Conceptos financieros fundamentales </h1>

      <Acordeon title="1 · Interés simple" defaultOpen>
        <BloqueInteres
          queEs="El interés simple es la forma más fácil de ganar o pagar intereses. Siempre se calcula sobre el mismo numerito del principio. Ese numerito nunca cambia."
          analogia={`Imagina que le prestas tu bicicleta a un amigo.

Cada mes, tu amigo te regala UNA moneda de las gracias.
Pase el tiempo que pase, siempre te da la MISMA moneda.

¿Por qué? Porque siempre te está pagando por la MISMA bicicleta.

El interés simple es igual: siempre se calcula sobre el mismo numerito del principio, sin importar cuántos meses pasen.`}
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
            { label: "Interpretación", content: "Bajo estas condiciones, el capital alcanzaría un valor futuro de $ 1.200.000,00 COP." },
          ]}
        />
      </Acordeon>

      <Acordeon title="2 · Interés compuesto">
        <BloqueInteres
          queEs="El interés compuesto es cuando el interés que ganaste se junta con tu dinero. Y ese dinero más grande gana todavía más interés."
          analogia={`Imagina una bola de nieve.

La empujas cuesta abajo y empieza chiquitica.
Mientras rueda, se le va pegando más nieve.
Y esa nieve nueva hace que se le pegue TODAVÍA más nieve.

Cada vuelta, la bola es más grande que la vuelta de antes.

El dinero hace lo mismo: gana intereses, esos intereses se vuelven parte del dinero, y ese dinero más grande gana más intereses todavía.`}
          comoFunciona="Al final de cada mes, el interés se suma al dinero que ya tenías. Al mes siguiente, el interés se calcula sobre ese dinero más grande. Por eso crece cada vez más rápido."
          usoLabel="¿Por qué es diferente al interés simple?"
          usoRespuesta="En el simple, siempre pagas sobre el mismo numerito. En el compuesto, el numerito crece cada mes. Por eso el compuesto siempre da más dinero que el simple, con el mismo tiempo y la misma tasa."
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
            { label: "Interpretación", content: "El saldo crece más rápido que en interés simple porque cada trimestre genera interés sobre interés." },
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
          usoRespuesta="Se usa más en cuentas avanzadas de bancos y en estudios financieros, no tanto en la vida diaria. La diferencia con el compuesto es que el compuesto suma los intereses cada cierto tiempo (cada mes, por ejemplo), y el continuo los va sumando sin parar nunca."
          notaEspecial="En interés continuo, t siempre se expresa en años. Ejemplo: 2 años y 6 meses = 2 + 6/12 = 2,5 años."
          formula="VF = VP · e^(r·t)"
          despejes={["VP = VF · e^(−r·t)", "r = ln(VF/VP) / t", "t = ln(VF/VP) / r"]}
          ejemploTexto="Un capital de $ 850.000,00 COP se invierte al 8,95 % continuo durante 2 años y 6 meses (t = 2,5 años)."
          pasosEjemplo={[
            { label: "Datos", content: "VP = $850.000,00 · r = 8,95 % continua · tiempo = 2 años 6 meses" },
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
  }

  function calcular() {
    setError(""); setResultado(null);
    let vp = parseNum(VP), vf = parseNum(VF), interesDato = parseNum(I);
    const tasa = parseNum(tasaPct) / 100;
    const a = parseNum(anios) || 0, m = parseNum(meses) || 0;

    if (a < 0 || m < 0) { setError("El tiempo no puede ser negativo."); return; }
    if (m >= 12) { setError("En el campo Meses usa un valor entre 0 y 11. Si tienes 14 meses, escribe 1 año y 2 meses."); return; }

    let mesesPorPeriodo = 1;
    if (regimen !== "continuo") {
      const perio = PERIODICIDADES.find((p) => p.value === periodicidad);
      mesesPorPeriodo = periodicidad === "personalizada" ? parseNum(nPersonalizado) : perio?.meses;
      if (!mesesPorPeriodo || mesesPorPeriodo <= 0) { setError("Ingresa cuántos meses tiene el período personalizado."); return; }
    }

    const pasos = [];
    let valorFinal, etiquetaFinal;
    let vpFinal = vp, vfFinal = vf;

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
          content: `${a} años y ${m} meses = ${a * 12 + m} meses. Como la tasa es ${etiquetaPer} (1 período = ${mesesPorPeriodo} ${mesesPorPeriodo === 1 ? "mes" : "meses"}), n = ${a * 12 + m}/${mesesPorPeriodo} = ${formatNumberCO(n, 2, 6)} períodos.`,
        });
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
      interesCalculado, vpFinal, vfFinal, mesesPorPeriodo,
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
          <Campo label={regimen === "continuo" ? "Tasa continua (r) % anual" : "Tasa de interés (i) % por período"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} placeholder="2,00" />
          </Campo>
        )}

        {mostrarTasaTiempo && regimen !== "continuo" && (
          <Campo label={regimen === "compuesto" ? "Período de capitalización" : "Período de la tasa"} help={regimen === "compuesto" ? "En compuesto los intereses se agregan al capital en cada período." : "En simple la tasa tiene periodicidad, pero los intereses no se capitalizan."}>
            <Selector value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} options={PERIODICIDADES.map((p) => ({ value: p.value, label: p.label }))} />
            {periodicidad === "personalizada" && <div style={{ marginTop: 8 }}><span style={{ fontSize: 12.5, color: C.slate }}>¿Cada cuántos meses se aplica la tasa?</span><Entrada value={nPersonalizado} onChange={(e) => setNPersonalizado(e.target.value)} placeholder="5" style={{ marginTop: 4 }} /></div>}
            <div style={{ marginTop: 7, fontSize: 12, color: C.slate }}>
              {periodicidad === "personalizada" ? `La tasa se aplica ${nombrePeriodo}.` : `1 período ${periodicidad === "anual" ? "anual" : periodicidad} = ${mesesPeriodoVista} ${mesesPeriodoVista === 1 ? "mes" : "meses"}.`}
            </div>
          </Campo>
        )}

        {mostrarTasaTiempo && (regimen === "continuo" ? incognita !== "t" : incognita !== "n") && (
          <Campo label={regimen === "continuo" ? "Tiempo total → t (años)" : "Tiempo total → se convierte a n períodos"}>
            <div style={{ display: "flex", gap: 8 }}><Entrada value={anios} onChange={(e) => setAnios(e.target.value)} placeholder="Años" /><Entrada value={meses} onChange={(e) => setMeses(e.target.value)} placeholder="Meses (0–11)" /></div>
            <div style={{ marginTop: 7, fontSize: 12, color: C.slate }}>
              {regimen === "continuo" ? `t = años + meses/12. Aquí no usamos n.` : `n = meses totales ÷ ${mesesPeriodoVista || "meses por período"}. La tasa NO se convierte.`}
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
    const tasa = parseFloat(String(tasaPct).replace(",", ".")) / 100;
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
    // No muestra solo “sumatoria de entradas menos salidas”: enseña qué fórmula se aplica a cada flujo.
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
          Para comparar cantidades de dinero ubicadas en momentos diferentes (ej. Valor Presente 1, Valor Presente 2 y Valor Futuro) las llevamos a un mismo momento focal y construimos una ecuación de valor. La tasa y el tiempo deben quedar en la misma unidad de periodo: la herramienta no convierte tasas entre periodicidades.
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
          <Campo label={regimen === "continuo" ? "Tasa continua r (% anual)" : "Tasa i (% por periodo)"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} disabled={tipoIncognita === "tasa"} />
          </Campo>
          {regimen !== "continuo" && (
            <Campo label="Periodicidad de la tasa">
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
          <Boton small variant={modo === "basico" ? "gold" : "outline"} onClick={() => setModo("basico")}>Modo básico</Boton>
          <Boton small variant={modo === "avanzado" ? "gold" : "outline"} onClick={() => setModo("avanzado")}>Modo avanzado (varios flujos)</Boton>
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
                  <span style={{ color: C.slate }}>{new Date(h.fecha).toLocaleString("es-CO")}</span> · {h.tipo === "avanzado" ? "Modo avanzado" : "Modo básico"} · {h.regimen} · <strong>{formatearResultadoHistorial(h)}</strong>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      )}

      {modo === "basico" ? <SimularBasico moneda={moneda} onGuardarHistorial={guardar} /> : <SimularAvanzado moneda={moneda} onGuardarHistorial={guardar} />}
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
          <Campo label="Tasa por periodo (%)"><Entrada type="number" value={tasaPct} onChange={(e) => setTasaPct(Number(e.target.value) || 0)} /></Campo>
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
        El interés <strong>simple</strong> crece linealmente porque siempre calcula sobre el capital inicial. El interés <strong>compuesto</strong> crece más rápido porque cada periodo capitaliza sobre el saldo anterior. El interés <strong>continuo</strong> es el límite del compuesto cuando la capitalización ocurre en cada instante, por lo que supera ligeramente al compuesto discreto para la misma tasa nominal.
      </div>
      <div style={{ padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 12, color: C.slate }}>
        Esta comparación es educativa. Las tasas deben interpretarse según su unidad; la herramienta no convierte tasas entre periodicidades en este corte.
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
    problema: `Al probar en Emergent la primera versión construida a partir de este prompt, identificamos que la periodicidad de la tasa no era suficientemente clara; no se distinguían adecuadamente n y t; la interfaz de interés continuo se parecía demasiado a la de simple y compuesto; y las explicaciones de los ejercicios eran demasiado básicas.`,
    correccion: `Se envió un video de la primera versión de Numeris a la IA para que analizara visualmente la herramienta y se utilizó un nuevo prompt especificando los problemas detectados. A partir de esa revisión se reforzó la diferenciación entre los tres regímenes, el manejo de las periodicidades, las variables utilizadas y la explicación paso a paso de los ejercicios.`,
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
    respuesta: `Se proporcionaron a la IA ejercicios reales de interés compuesto e interés continuo desarrollados durante la clase. Después de analizarlos, la IA modificó únicamente la sección encargada de mostrar los procedimientos.

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
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: "0 0 10px" }}>Interacciones</h1>
      <p style={{ fontSize: 13.5, color: C.slate, marginBottom: 24, maxWidth: 760 }}>
        Documentamos aquí cinco interacciones reales con inteligencia artificial durante el desarrollo de Numeris. Cada registro muestra la instrucción utilizada, la respuesta inicial, el problema detectado, la corrección aplicada, el resultado final, la parte visible de la herramienta relacionada y el enlace de evidencia. La interacción 5 documenta específicamente un error numérico detectado y corregido.
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
          <span>Numeris · Proyecto académico · Matemáticas Financieras · Primer Corte 2026-2</span>
          <span>Desarrollado con asistencia de Replit Agent ChatGPT Business y Cloude </span>
        </Section>
      </div>
    </div>
  );
}
