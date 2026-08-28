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
  { t: "VP", d: "Valor Presente: dinero equivalente en el momento inicial." },
  { t: "VF", d: "Valor Futuro: valor que tendrá o tendría una cantidad en un momento futuro." },
  { t: "i", d: "Tasa de interés por periodo, usada en interés simple y compuesto." },
  { t: "n", d: "Número de periodos de la tasa (simple y compuesto)." },
  { t: "r", d: "Tasa usada en interés continuo." },
  { t: "t", d: "Tiempo expresado siempre en años, usado en interés continuo." },
  { t: "Capital", d: "Monto de dinero sobre el cual se calculan los intereses." },
  { t: "Interés", d: "Costo o rendimiento del dinero en el tiempo." },
  { t: "Periodo", d: "Intervalo de tiempo al que corresponde la tasa (mes, bimestre, trimestre...)." },
  { t: "Flujo", d: "Movimiento de dinero (entrada o salida) en un momento determinado." },
  { t: "Momento", d: "Instante en el tiempo en que ocurre un flujo, medido en periodos o años." },
  { t: "Momento focal", d: "Instante elegido para comparar varios flujos que ocurren en momentos distintos." },
  { t: "Ecuación de valor", d: "Igualdad que resulta de trasladar todos los flujos a un mismo momento focal." },
  { t: "Coeficiente", d: "Relación proporcional entre el valor de un flujo y otro (ej. Flujo 2 = 1,4 × Flujo 1)." },
  { t: "Capitalización", d: "Trasladar un valor hacia el futuro sumando los intereses generados." },
  { t: "Descuento", d: "Trasladar un valor hacia el pasado, restando el efecto del interés." },
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
            { t: "Aprender", d: "Entender los tres tipos de interés: simple, compuesto y continuo, con explicaciones sencillas y matemáticas.", i: BookOpen },
            { t: "Simular", d: "Calcular créditos e inversiones, con incógnitas de valor, tasa, tiempo, flujo y momento.", i: Calculator },
            { t: "Comparar", d: "Observar cómo cambia un resultado según el régimen de interés utilizado.", i: BarChart3 },
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
function BloqueRegimen({ nombre, formula, despejes, sencilla, usoCasos, diferencia, ejemploTexto, pasosEjemplo, notaEspecial }) {
  const [modo, setModo] = useState("sencilla");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Boton small variant={modo === "sencilla" ? "gold" : "outline"} onClick={() => setModo("sencilla")}>Explicación sencilla</Boton>
        <Boton small variant={modo === "matematica" ? "gold" : "outline"} onClick={() => setModo("matematica")}>Explicación matemática</Boton>
      </div>
      {modo === "sencilla" ? (
        <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.65 }}>
          <p>{sencilla}</p>
          {usoCasos && <p style={{ color: C.slate }}><strong>¿En qué casos se usa?</strong> {usoCasos}</p>}
          {diferencia && <p style={{ color: C.slate }}>{diferencia}</p>}
        </div>
      ) : (
        <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.7 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 20, background: C.paper, padding: "14px 18px", borderRadius: 8, margin: "6px 0 14px", color: C.navy }}>{formula}</div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Despejes:</div>
          <ul style={{ fontFamily: F_MONO, fontSize: 14, paddingLeft: 18, margin: 0 }}>
            {despejes.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d}</li>)}
          </ul>
        </div>
      )}
      {notaEspecial && (
        <div style={{ marginTop: 14, padding: 12, background: `${C.gold}1a`, borderRadius: 6, fontSize: 13, color: C.goldDeep, fontWeight: 600 }}>
          {notaEspecial}
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Ejemplo práctico</div>
        <p style={{ fontSize: 14, color: C.ink }}>{ejemploTexto}</p>
        <Acordeon title="Ver procedimiento completo">
          <FichaProcedimiento pasos={pasosEjemplo} />
        </Acordeon>
      </div>
    </div>
  );
}

function Aprender() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Educación financiera</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 32, color: C.navy, margin: "0 0 26px" }}>Los tres regímenes de interés</h1>

      <Acordeon title="1 · Interés simple" defaultOpen>
        <BloqueRegimen
          formula="VF = VP · (1 + i · n)"
          despejes={["VP = VF / (1 + i·n)", "i = (VF/VP − 1) / n", "n = (VF/VP − 1) / i"]}
          sencilla="El interés simple calcula los intereses usando siempre como base el capital inicial. Por eso, si las demás condiciones no cambian, cada periodo agrega la misma cantidad de interés."
          usoCasos="Créditos de corto plazo, algunos descuentos comerciales y ejercicios donde el interés no se reinvierte."
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
        <BloqueRegimen
          formula="VF = VP · (1 + i)ⁿ"
          despejes={["VP = VF / (1+i)ⁿ", "i = (VF/VP)^(1/n) − 1", "n = ln(VF/VP) / ln(1+i)"]}
          sencilla="Los intereses se suman al saldo. Después, ese saldo mayor también genera intereses."
          diferencia="A diferencia del interés simple, la base de cálculo crece periodo a periodo porque los intereses se capitalizan."
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
        <BloqueRegimen
          formula="VF = VP · e^(r·t)"
          despejes={["VP = VF · e^(−r·t)", "r = ln(VF/VP) / t", "t = ln(VF/VP) / r"]}
          sencilla="Es el caso límite del interés compuesto cuando la capitalización ocurre en cada instante, sin esperar a que termine un periodo."
          usoCasos="Modelos financieros y de crecimiento continuo, valoración de instrumentos y contextos teóricos."
          notaEspecial="En interés continuo, t siempre se expresa en años. Ejemplo: 2 años y 6 meses = 2 + 6/12 = 2,5 años."
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
              {resultado.esTiempo ? (resultado.incognita === "n" ? `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 6 : 2)} períodos` : `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 6 : 2)} años`) : resultado.esTasa ? formatPercentCO(resultado.valorFinal, masDecimales ? 6 : 2) : formatCurrencyCO(resultado.valorFinal, moneda, 2)}
            </div>
            {resultado.incognita === "n" && resultado.equivalenciaTemporal && <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Equivalencia: {resultado.equivalenciaTemporal.anios} años y {formatNumberCO(resultado.equivalenciaTemporal.meses, 1, 2)} meses</div>}
            <button onClick={() => setMasDecimales(!masDecimales)} style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>{masDecimales ? "Mostrar menos decimales" : "Mostrar más decimales"}</button>

            {Number.isFinite(resultado.interesCalculado) && (
              <div style={{ marginTop: 8, padding: 13, background: C.successBg, borderRadius: 8, color: C.navy, fontSize: 13.5 }}>
                <strong>{resultado.operacion === "credito" ? "Intereses pagados (I)" : "Ganancia neta / intereses (I)"}:</strong> {formatCurrencyCO(resultado.interesCalculado, moneda)}
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>I = VF − VP = {formatCurrencyCO(resultado.vfFinal, moneda)} − {formatCurrencyCO(resultado.vpFinal, moneda)}</div>
              </div>
            )}

            <div style={{ fontSize: 13.5, color: C.ink, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
              <strong>Interpretación financiera:</strong> {resultado.operacion === "credito"
                ? `Desde la perspectiva del cliente, VP es el capital recibido y VF es el valor equivalente a pagar. I muestra cuánto corresponde a intereses.`
                : `VP es el capital invertido, VF es el valor alcanzado y I muestra únicamente la ganancia generada por intereses.`}
            </div>
            <Verificacion ok={resultado.verifOk} residual={resultado.residual} />
            <Acordeon title="Ver procedimiento completo — con variables de clase">
              <FichaProcedimiento pasos={[...resultado.pasos, { label: "Resultado sin redondear", content: String(resultado.valorFinal) }, { label: "Resultado presentado", content: resultado.esTiempo ? formatNumberCO(resultado.valorFinal, 2, 4) : resultado.esTasa ? formatPercentCO(resultado.valorFinal, 4) : formatCurrencyCO(resultado.valorFinal, moneda) }]} />
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
            {resultado.tipo === "monto" && formatCurrencyCO(resultado.valor, moneda)}
            {resultado.tipo === "momento" && (resultado.regimen === "continuo" ? `${formatNumberCO(resultado.valor, 2, 4)} años` : `${formatNumberCO(resultado.valor, 2, 4)} periodos`)}
            {resultado.tipo === "tasa" && formatPercentCO(resultado.valor, 4)}
          </div>
          {resultado.tipo === "monto" && Array.isArray(resultado.valoresIncognitas) && resultado.valoresIncognitas.length > 0 && (
            <div style={{ margin: "12px 0", display: "grid", gap: 8 }}>
              {resultado.valoresIncognitas.map((v, idx) => (
                <div key={`${v.etiqueta}-${idx}`} style={{ padding: 12, background: C.paperDark, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: C.slate }}>{v.etiqueta}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 17, color: C.navy, fontWeight: 700 }}>{formatCurrencyCO(v.valor, moneda)}</div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>{formatNumberCO(v.coeficiente, 0, 6)} × X</div>
                </div>
              ))}
            </div>
          )}
          {resultado.tipo === "momento" && resultado.equivalencia && (
            <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>
              Equivalencia: {resultado.equivalencia.anios} años y {formatNumberCO(resultado.equivalencia.meses, 1, 2)} meses
            </div>
          )}
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>
            Momento focal utilizado: {focalAnios} años y {focalMeses} meses ({formatNumberCO(resultado.focal, 2, 4)} {resultado.regimen === "continuo" ? "años (t)" : "períodos (n)"})
          </div>
          {Number.isFinite(resultado.interesCalculado) && (
            <div style={{ margin: "12px 0", padding: 13, background: C.successBg, borderRadius: 8, fontSize: 13.5, color: C.navy }}>
              <strong>{resultado.operacion === "credito" ? "Intereses totales (I)" : "Ganancia neta / intereses (I)"}:</strong> {formatCurrencyCO(resultado.interesCalculado, moneda)}
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
                Total entradas nominales: {formatCurrencyCO(resultado.totalEntradas, moneda)} · Total salidas nominales: {formatCurrencyCO(resultado.totalSalidas, moneda)}.
              </div>
              {Number.isFinite(resultado.interesConocido) && (
                <div style={{ fontSize: 11.5, marginTop: 4, color: Math.abs(resultado.interesConocido - resultado.interesCalculado) < 0.01 ? C.success : C.danger }}>
                  I ingresado: {formatCurrencyCO(resultado.interesConocido, moneda)} · diferencia frente al I calculado: {formatCurrencyCO(resultado.interesCalculado - resultado.interesConocido, moneda)}.
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
              ...(Number.isFinite(resultado.interesCalculado) ? [{ label: "I — interés / ganancia neta", content: resultado.operacion === "credito" ? `I = salidas − entradas = ${formatCurrencyCO(resultado.interesCalculado, moneda)}` : `I = entradas − salidas = ${formatCurrencyCO(resultado.interesCalculado, moneda)}` }] : []),
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
function TarjetaInteraccion({ n, titulo, esError }) {
  return (
    <Tarjeta style={{ marginBottom: 16, borderColor: esError ? C.danger + "55" : C.line }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: 18, color: C.navy }}>Interacción {n} — {titulo}</div>
        <span style={{ fontSize: 10.5, background: C.paperDark, color: C.slate, padding: "3px 8px", borderRadius: 20, fontFamily: F_MONO }}>Plantilla — reemplazar antes de entregar</span>
      </div>
      <Campo label="1. Prompt dado a la IA"><textarea rows={2} placeholder="Pega aquí el prompt exacto..." style={{ ...inputStyle, resize: "vertical" }} /></Campo>
      <Campo label="2. Respuesta inicial de la IA"><textarea rows={2} placeholder="Pega aquí la respuesta inicial..." style={{ ...inputStyle, resize: "vertical" }} /></Campo>
      <Campo label="3. Qué estaba mal o incompleto"><Entrada placeholder="Describe el error o vacío detectado" /></Campo>
      {esError && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Campo label="Valor incorrecto"><Entrada placeholder="Ej: $0,00" /></Campo>
          <Campo label="Valor correcto"><Entrada placeholder="Ej: $0,00" /></Campo>
        </div>
      )}
      <Campo label="4. Cómo se corrigió"><Entrada placeholder="Describe la corrección aplicada" /></Campo>
      <Campo label="5. Resultado final"><Entrada placeholder="Describe el resultado final" /></Campo>
      <Campo label="6. Parte visible de la herramienta (trazabilidad)"><Entrada placeholder="Ej: Visible en Simulación → Modo avanzado → ..." /></Campo>
      <Campo label="7. Enlace original de la conversación"><Entrada placeholder="https://..." /></Campo>
    </Tarjeta>
  );
}

function Interacciones() {
  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Interacciones</Etiqueta>
      <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: "0 0 10px" }}>Interacciones</h1>
      <p style={{ fontSize: 13.5, color: C.slate, marginBottom: 24, maxWidth: 640 }}>
        Documentamos aquí el proceso real de trabajo con inteligencia artificial durante el desarrollo. Estas tres tarjetas son plantillas: el equipo debe reemplazarlas con interacciones reales antes de la entrega, incluyendo al menos un error numérico o conceptual real.
      </p>
      <TarjetaInteraccion n={1} titulo="Diseño del motor financiero" />
      <TarjetaInteraccion n={2} titulo="Error numérico real detectado" esError />
      <TarjetaInteraccion n={3} titulo="Ajuste de interfaz / usabilidad" />
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
          <span>Desarrollado con asistencia de Replit Agent y herramientas de inteligencia artificial.</span>
        </Section>
      </div>
    </div>
  );
}
