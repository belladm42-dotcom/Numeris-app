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
   PERSISTENCIA — historial local (window.storage, no localStorage)
   ============================================================ */
async function guardarHistorial(entry) {
  try {
    const key = `historial:${Date.now()}`;
    await window.storage.set(key, JSON.stringify(entry), false);
  } catch (e) { /* almacenamiento best-effort */ }
}
async function cargarHistorial() {
  try {
    const listado = await window.storage.list("historial:", false);
    if (!listado || !listado.keys) return [];
    const items = await Promise.all(
      listado.keys.slice(-30).reverse().map(async (k) => {
        try { const r = await window.storage.get(k, false); return r ? { key: k, ...JSON.parse(r.value) } : null; }
        catch { return null; }
      })
    );
    return items.filter(Boolean);
  } catch (e) { return []; }
}
async function borrarHistorial(items) {
  try { await Promise.all(items.map((it) => window.storage.delete(it.key, false).catch(() => {}))); }
  catch (e) { /* noop */ }
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
  const [tasaPct, setTasaPct] = useState("2");
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [nPersonalizado, setNPersonalizado] = useState("3");
  const [anios, setAnios] = useState("1");
  const [meses, setMeses] = useState("0");
  const [masDecimales, setMasDecimales] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  const incognitasDisponibles = regimen === "continuo"
    ? [{ value: "VF", label: "Valor Futuro (VF)" }, { value: "VP", label: "Valor Presente (VP)" }, { value: "r", label: "Tasa continua (r)" }, { value: "t", label: "Tiempo (t)" }]
    : [{ value: "VF", label: "Valor Futuro (VF)" }, { value: "VP", label: "Valor Presente (VP)" }, { value: "i", label: "Tasa de interés (i)" }, { value: "n", label: "Tiempo / periodos (n)" }];

  function cargarEjemplo() {
    const ej = EJEMPLOS[regimen];
    setOperacion(ej.operacion); setVP(ej.VP); setTasaPct(ej.tasa); setAnios(ej.anios); setMeses(ej.meses);
    setIncognita(ej.incognita); setVF(ej.VF || "");
    if (regimen !== "continuo") setPeriodicidad(ej.periodicidad);
  }

  function calcular() {
    setError(""); setResultado(null);
    const vp = parseFloat(String(VP).replace(",", "."));
    const vf = parseFloat(String(VF).replace(",", "."));
    const tasa = parseFloat(String(tasaPct).replace(",", ".")) / 100;
    const a = parseFloat(anios) || 0, m = parseFloat(meses) || 0;

    if (a < 0 || m < 0) { setError("El tiempo no puede ser negativo."); return; }

    let mesesPorPeriodo = 1;
    if (regimen !== "continuo") {
      const perio = PERIODICIDADES.find((p) => p.value === periodicidad);
      mesesPorPeriodo = periodicidad === "personalizada" ? parseFloat(nPersonalizado) : perio.meses;
      if (!mesesPorPeriodo || mesesPorPeriodo <= 0) { setError("Ingresa cuántos meses tiene el periodo personalizado."); return; }
    }

    const pasos = [];
    let valorFinal, etiquetaFinal, datosUsados;
    try {
      if (regimen === "continuo") {
        const t = incognita === "t" ? null : yearsMonthsToDecimalYears(a, m);
        pasos.push({ label: "Conversión temporal", content: incognita === "t" ? "El tiempo es la incógnita" : `t = ${a} + ${m}/12 = ${formatNumberCO(t, 2, 4)} años` });
        if (incognita === "VF") {
          if (!validateSolution(vp) || vp <= 0) throw new Error("Ingresa un Valor Presente válido para continuar.");
          valorFinal = futureValueContinuous(vp, tasa, t);
          pasos.push({ label: "Fórmula", content: "VF = VP · e^(r·t)" }, { label: "Sustitución", content: `VF = ${formatNumberCO(vp)} × e^(${formatNumberCO(tasa, 4, 6)} × ${formatNumberCO(t, 2, 4)})` });
          etiquetaFinal = "Valor Futuro (VF)";
        } else if (incognita === "VP") {
          valorFinal = presentValueContinuous(vf, tasa, t);
          pasos.push({ label: "Fórmula", content: "VP = VF · e^(−r·t)" });
          etiquetaFinal = "Valor Presente (VP)";
        } else if (incognita === "r") {
          valorFinal = solveRateContinuous(vp, vf, t);
          pasos.push({ label: "Fórmula", content: "r = ln(VF/VP) / t" });
          etiquetaFinal = "Tasa continua (r)";
        } else if (incognita === "t") {
          valorFinal = solveTimeContinuous(vp, vf, tasa);
          etiquetaFinal = "Tiempo (t)";
        }
      } else {
        const n = incognita === "n" ? null : convertTimeToPeriods(a, m, mesesPorPeriodo);
        if (incognita !== "n") pasos.push({ label: "Conversión temporal", content: `${a} años y ${m} meses = ${a * 12 + m} meses → n = ${a * 12 + m}/${mesesPorPeriodo} = ${formatNumberCO(n, 2, 6)} periodos` });
        if (regimen === "simple") {
          if (incognita === "VF") { valorFinal = futureValueSimple(vp, tasa, n); pasos.push({ label: "Fórmula", content: "VF = VP · (1 + i·n)" }); etiquetaFinal = "Valor Futuro (VF)"; }
          else if (incognita === "VP") { valorFinal = presentValueSimple(vf, tasa, n); pasos.push({ label: "Fórmula", content: "VP = VF / (1 + i·n)" }); etiquetaFinal = "Valor Presente (VP)"; }
          else if (incognita === "i") { valorFinal = solveRateSimple(vp, vf, n); pasos.push({ label: "Fórmula", content: "i = (VF/VP − 1) / n" }); etiquetaFinal = "Tasa de interés (i)"; }
          else if (incognita === "n") { valorFinal = solveTimeSimple(vp, vf, tasa); etiquetaFinal = "Tiempo (n)"; }
        } else {
          if (incognita === "VF") { valorFinal = futureValueCompound(vp, tasa, n); pasos.push({ label: "Fórmula", content: "VF = VP · (1+i)ⁿ" }); etiquetaFinal = "Valor Futuro (VF)"; }
          else if (incognita === "VP") { valorFinal = presentValueCompound(vf, tasa, n); pasos.push({ label: "Fórmula", content: "VP = VF / (1+i)ⁿ" }); etiquetaFinal = "Valor Presente (VP)"; }
          else if (incognita === "i") { valorFinal = solveRateCompound(vp, vf, n); pasos.push({ label: "Fórmula", content: "i = (VF/VP)^(1/n) − 1" }); etiquetaFinal = "Tasa de interés (i)"; }
          else if (incognita === "n") { valorFinal = solveTimeCompound(vp, vf, tasa); etiquetaFinal = "Tiempo (n)"; }
        }
      }
    } catch (e) { setError(e.message || "No fue posible calcular con estos datos."); return; }

    if (!validateSolution(valorFinal)) {
      setError("Con los datos ingresados no encontramos una solución financiera válida. Revisa los valores, la tasa y los momentos de los flujos.");
      return;
    }

    // Verificación por sustitución
    let residual = 0, verifOk = true;
    try {
      if (regimen === "continuo") {
        const t = incognita === "t" ? valorFinal : yearsMonthsToDecimalYears(a, m);
        const vpUsar = incognita === "VP" ? valorFinal : vp;
        const vfUsar = incognita === "VF" ? valorFinal : vf;
        const rUsar = incognita === "r" ? valorFinal : tasa;
        residual = vfUsar - futureValueContinuous(vpUsar, rUsar, t);
      } else {
        const n = incognita === "n" ? valorFinal : convertTimeToPeriods(a, m, mesesPorPeriodo);
        const vpUsar = incognita === "VP" ? valorFinal : vp;
        const vfUsar = incognita === "VF" ? valorFinal : vf;
        const iUsar = incognita === "i" ? valorFinal : tasa;
        const vfCalc = regimen === "simple" ? futureValueSimple(vpUsar, iUsar, n) : futureValueCompound(vpUsar, iUsar, n);
        residual = vfUsar - vfCalc;
      }
      verifOk = Math.abs(residual) < Math.max(1, Math.abs(valorFinal)) * 1e-6;
    } catch { verifOk = false; }

    const esTiempo = incognita === "n" || incognita === "t";
    let equivalenciaTemporal = null;
    if (incognita === "n") equivalenciaTemporal = periodsToYearsMonths(valorFinal, mesesPorPeriodo);

    const res = {
      etiquetaFinal, valorFinal, esTiempo, equivalenciaTemporal, pasos, residual, verifOk, incognita, regimen, operacion,
      datos: { vp: incognita === "VP" ? null : vp, vf: incognita === "VF" ? null : vf, tasa: incognita === "i" || incognita === "r" ? null : tasa, periodicidad: regimen !== "continuo" ? periodicidad : null },
    };
    setResultado(res);
    onGuardarHistorial({ tipo: "basico", regimen, operacion, incognita, resultado: valorFinal, fecha: new Date().toISOString(), moneda });
  }

  const gananciaNeta = resultado && !resultado.esTiempo && resultado.incognita !== "i" && resultado.incognita !== "r"
    ? (resultado.incognita === "VF" ? resultado.valorFinal - (resultado.datos.vp ?? 0) : (resultado.datos.vf ?? 0) - resultado.valorFinal)
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(320px,1.3fr)", gap: 26, alignItems: "start" }}>
      <Tarjeta>
        <Etiqueta>Configuración</Etiqueta>
        <Campo label="Tipo de operación">
          <Selector value={operacion} onChange={(e) => setOperacion(e.target.value)}
            options={[{ value: "credito", label: "Crédito" }, { value: "inversion", label: "Inversión" }]} />
        </Campo>
        <Campo label="Tipo de interés">
          <Selector value={regimen} onChange={(e) => { setRegimen(e.target.value); setIncognita("VF"); }}
            options={[{ value: "simple", label: "Simple" }, { value: "compuesto", label: "Compuesto" }, { value: "continuo", label: "Continuo" }]} />
        </Campo>
        <Campo label="Incógnita a calcular">
          <Selector value={incognita} onChange={(e) => setIncognita(e.target.value)} options={incognitasDisponibles} />
        </Campo>

        {incognita !== "VP" && <Campo label={`Valor Presente (VP) — ${moneda}`}><Entrada value={VP} onChange={(e) => setVP(e.target.value)} placeholder="1.000.000" /></Campo>}
        {incognita !== "VF" && <Campo label={`Valor Futuro (VF) — ${moneda}`}><Entrada value={VF} onChange={(e) => setVF(e.target.value)} placeholder="1.200.000" /></Campo>}
        {(regimen === "continuo" ? incognita !== "r" : incognita !== "i") && (
          <Campo label={regimen === "continuo" ? "Tasa continua (r) % anual" : "Tasa de interés (i) % por periodo"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} placeholder="2,00" />
          </Campo>
        )}

        {regimen !== "continuo" && (
          <Campo label="Periodicidad de la tasa">
            <Selector value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}
              options={PERIODICIDADES.map((p) => ({ value: p.value, label: p.label }))} />
            {periodicidad === "personalizada" && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12.5, color: C.slate }}>¿Cada cuántos meses se aplica la tasa?</span>
                <Entrada value={nPersonalizado} onChange={(e) => setNPersonalizado(e.target.value)} placeholder="5" style={{ marginTop: 4 }} />
              </div>
            )}
          </Campo>
        )}

        {(regimen === "continuo" ? incognita !== "t" : incognita !== "n") && (
          <Campo label="Tiempo total">
            <div style={{ display: "flex", gap: 8 }}>
              <Entrada value={anios} onChange={(e) => setAnios(e.target.value)} placeholder="Años" />
              <Entrada value={meses} onChange={(e) => setMeses(e.target.value)} placeholder="Meses" />
            </div>
          </Campo>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Boton variant="gold" onClick={calcular}>Calcular</Boton>
          <Boton variant="outline" onClick={cargarEjemplo}>Cargar ejemplo</Boton>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: C.danger }}>{error}</div>}
      </Tarjeta>

      <div>
        {!resultado && !error && (
          <Tarjeta style={{ color: C.slate, fontSize: 14, textAlign: "center", padding: 40 }}>
            Completa los datos y presiona <strong>Calcular</strong> para ver el resultado y el procedimiento completo.
          </Tarjeta>
        )}
        {resultado && (
          <Tarjeta>
            <div style={{ fontSize: 13, color: C.slate, marginBottom: 4 }}>
              Vas a calcular {resultado.etiquetaFinal.toLowerCase()} de {resultado.operacion === "credito" ? "un crédito" : "una inversión"} con interés {resultado.regimen}.
            </div>
            <Etiqueta>{resultado.etiquetaFinal}</Etiqueta>
            <div style={{ fontFamily: F_MONO, fontSize: 30, color: C.navy, fontWeight: 700, marginBottom: 6 }}>
              {resultado.esTiempo ? (
                resultado.incognita === "n"
                  ? `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 6 : 2)} periodos`
                  : `${formatNumberCO(resultado.valorFinal, 2, masDecimales ? 6 : 2)} años`
              ) : formatCurrencyCO(resultado.valorFinal, moneda, 2)}
            </div>
            {resultado.incognita === "n" && resultado.equivalenciaTemporal && (
              <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>
                Equivalencia temporal: {resultado.equivalenciaTemporal.anios} años y {formatNumberCO(resultado.equivalenciaTemporal.meses, 1, 2)} meses
              </div>
            )}
            {(resultado.incognita === "i" || resultado.incognita === "r") && (
              <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>≈ {formatPercentCO(resultado.valorFinal, masDecimales ? 6 : 2)}</div>
            )}
            <button onClick={() => setMasDecimales(!masDecimales)} style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>
              {masDecimales ? "Mostrar menos decimales" : "Mostrar más decimales"}
            </button>

            {gananciaNeta !== null && Number.isFinite(gananciaNeta) && (
              <div style={{ fontSize: 13.5, color: C.navy, marginTop: 6 }}>
                <strong>Ganancia neta / intereses:</strong> {formatCurrencyCO(gananciaNeta, moneda)}
              </div>
            )}

            <div style={{ fontSize: 13.5, color: C.ink, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
              <strong>Interpretación financiera:</strong> {resultado.operacion === "credito"
                ? `Bajo estas condiciones, el valor equivalente de la obligación sería ${resultado.esTiempo ? "el tiempo indicado arriba." : formatCurrencyCO(resultado.valorFinal, moneda)}.`
                : `Bajo estas condiciones, el capital ${resultado.esTiempo ? "alcanzaría el valor objetivo en el tiempo indicado arriba." : `alcanzaría un valor de ${formatCurrencyCO(resultado.valorFinal, moneda)}.`}`}
            </div>

            <Verificacion ok={resultado.verifOk} residual={resultado.residual} />

            <Acordeon title="Ver procedimiento completo">
              <FichaProcedimiento pasos={[
                { label: "Tipo de operación", content: resultado.operacion === "credito" ? "Crédito" : "Inversión" },
                { label: "Régimen", content: resultado.regimen },
                { label: "Incógnita", content: resultado.etiquetaFinal },
                ...resultado.pasos,
                { label: "Resultado sin redondear", content: String(resultado.valorFinal) },
                { label: "Resultado presentado", content: resultado.esTiempo ? formatNumberCO(resultado.valorFinal, 2, 4) : formatCurrencyCO(resultado.valorFinal, moneda) },
              ]} />
            </Acordeon>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SIMULAR — MODO AVANZADO (múltiples flujos)
   ============================================================ */
let flujoIdSeq = 1;
function nuevoFlujo(overrides) {
  return { id: flujoIdSeq++, descripcion: "", monto: "", momento: "0", direccion: "entrada", esIncognitaMonto: false, esIncognitaMomento: false, coeficiente: "1", ...overrides };
}

function SimularAvanzado({ moneda, onGuardarHistorial }) {
  const [regimen, setRegimen] = useState("compuesto");
  const [tasaPct, setTasaPct] = useState("3");
  const [momentoFocal, setMomentoFocal] = useState("6");
  const [objetivo, setObjetivo] = useState("0");
  const [tipoIncognita, setTipoIncognita] = useState("monto"); // monto | momento | tasa
  const [flujos, setFlujos] = useState([
    nuevoFlujo({ descripcion: "Desembolso inicial", monto: "10000000", momento: "0", direccion: "salida" }),
    nuevoFlujo({ descripcion: "Pago único", monto: "", momento: "6", direccion: "entrada", esIncognitaMonto: true }),
  ]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  function actualizar(id, campo, valor) {
    setFlujos((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }
  function agregarFlujo() { setFlujos((fs) => [...fs, nuevoFlujo({ momento: String(fs.length) })]); }
  function eliminarFlujo(id) { setFlujos((fs) => fs.filter((f) => f.id !== id)); }

  function resolver() {
    setError(""); setResultado(null);
    const tasa = parseFloat(String(tasaPct).replace(",", ".")) / 100;
    const focal = parseFloat(momentoFocal);
    const target = parseFloat(String(objetivo).replace(",", ".")) || 0;

    const marcadosMonto = flujos.filter((f) => f.esIncognitaMonto);
    const marcadosMomento = flujos.filter((f) => f.esIncognitaMomento);
    const totalIncognitas = (tipoIncognita === "monto" ? marcadosMonto.length : 0) + (tipoIncognita === "momento" ? marcadosMomento.length : 0) + (tipoIncognita === "tasa" ? 1 : 0);

    if (tipoIncognita === "monto" && marcadosMonto.length !== 1) { setError("Marca exactamente un flujo con monto desconocido."); return; }
    if (tipoIncognita === "momento" && marcadosMomento.length !== 1) { setError("Marca exactamente un flujo con momento desconocido."); return; }
    for (const f of flujos) {
      if (f.momento === "" && !f.esIncognitaMomento) { setError("Todos los flujos deben tener un momento (excepto el marcado como desconocido)."); return; }
    }

    const flowsBase = flujos.map((f) => ({
      monto: parseFloat(String(f.monto).replace(",", ".")) || 0,
      momento: parseFloat(f.momento) || 0,
      signo: f.direccion === "entrada" ? 1 : -1,
      esIncognita: tipoIncognita === "monto" && f.esIncognitaMonto,
      coeficiente: parseFloat(String(f.coeficiente).replace(",", ".")) || 1,
    }));

    try {
      if (tipoIncognita === "monto") {
        const sol = solveUnknownCashFlow(flowsBase, focal, regimen, tasa, target);
        if (!sol.ok || !validateSolution(sol.value)) throw new Error("Con los datos ingresados no encontramos una solución financiera válida. Revisa los valores, la tasa y los momentos de los flujos.");
        // verificación
        let total = 0;
        for (const f of flowsBase) total += f.signo * (f.esIncognita ? f.coeficiente * sol.value : f.monto) * trasladoFlujo(1, f.momento, focal, regimen, tasa);
        const residual = total - target;
        setResultado({ tipo: "monto", valor: sol.value, residual, verifOk: Math.abs(residual) < Math.max(1, Math.abs(sol.value)) * 1e-5, focal, tasa, regimen, target, flowsBase });
      } else if (tipoIncognita === "momento") {
        const idx = flujos.findIndex((f) => f.esIncognitaMomento);
        const sol = solveUnknownCashFlowTime(flowsBase, focal, regimen, tasa, target, idx);
        if (!sol.ok) throw new Error("Con los datos ingresados no encontramos una solución financiera válida. Revisa los valores, la tasa y los montos de los flujos.");
        setResultado({ tipo: "momento", valor: sol.value, residual: sol.residual, verifOk: Math.abs(sol.residual) < 1e-4, focal, tasa, regimen, target, flowsBase });
      } else {
        const sol = solveUnknownRateMultiFlow(flowsBase, focal, regimen, target);
        if (!sol.ok) throw new Error("Con los datos ingresados no encontramos una tasa que satisfaga la ecuación de valor. Revisa los montos y momentos.");
        setResultado({ tipo: "tasa", valor: sol.value, residual: sol.residual, verifOk: Math.abs(sol.residual) < 1, focal, regimen, target, flowsBase });
      }
      onGuardarHistorial({ tipo: "avanzado", regimen, incognita: tipoIncognita, fecha: new Date().toISOString(), moneda });
    } catch (e) {
      setError(e.message);
    }
  }

  const maxMomento = Math.max(focalSafe(momentoFocal), ...flujos.map((f) => parseFloat(f.momento) || 0), 1);
  function focalSafe(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 1; }

  return (
    <div>
      <Tarjeta style={{ marginBottom: 20 }}>
        <Etiqueta>Motor general de ecuaciones de valor</Etiqueta>
        <p style={{ fontSize: 13.5, color: C.slate, margin: "0 0 16px" }}>
          Para comparar cantidades de dinero ubicadas en momentos diferentes, las llevamos a un mismo momento focal y construimos una ecuación de valor.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
          <Campo label="Régimen">
            <Selector value={regimen} onChange={(e) => setRegimen(e.target.value)} options={[{ value: "simple", label: "Simple" }, { value: "compuesto", label: "Compuesto" }, { value: "continuo", label: "Continuo" }]} />
          </Campo>
          <Campo label={regimen === "continuo" ? "Tasa continua r (% anual)" : "Tasa i (% por periodo)"}>
            <Entrada value={tasaPct} onChange={(e) => setTasaPct(e.target.value)} disabled={tipoIncognita === "tasa"} />
          </Campo>
          <Campo label="Momento focal">
            <Entrada value={momentoFocal} onChange={(e) => setMomentoFocal(e.target.value)} />
          </Campo>
          <Campo label="Valor objetivo en el momento focal" help="0 = equilibrio (entradas = salidas)">
            <Entrada value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
          </Campo>
          <Campo label="Incógnita">
            <Selector value={tipoIncognita} onChange={(e) => setTipoIncognita(e.target.value)}
              options={[{ value: "monto", label: "Valor de un flujo" }, { value: "momento", label: "Momento de un flujo" }, { value: "tasa", label: "Tasa de interés" }]} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta style={{ marginBottom: 20 }}>
        <Etiqueta>Flujos de dinero</Etiqueta>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.slate, fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: 6 }}>Descripción</th><th style={{ padding: 6 }}>Monto</th><th style={{ padding: 6 }}>Momento</th>
                <th style={{ padding: 6 }}>Dirección</th><th style={{ padding: 6 }}>Coef. (×flujo)</th><th style={{ padding: 6 }}>¿Desconocido?</th><th />
              </tr>
            </thead>
            <tbody>
              {flujos.map((f) => (
                <tr key={f.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: 6 }}><Entrada value={f.descripcion} onChange={(e) => actualizar(f.id, "descripcion", e.target.value)} style={{ minWidth: 110 }} /></td>
                  <td style={{ padding: 6 }}>
                    {(tipoIncognita === "monto" && f.esIncognitaMonto) ? <span style={{ fontFamily: F_MONO, color: C.gold }}>{f.coeficiente}·X</span>
                      : <Entrada value={f.monto} onChange={(e) => actualizar(f.id, "monto", e.target.value)} style={{ minWidth: 100 }} />}
                  </td>
                  <td style={{ padding: 6 }}>
                    {(tipoIncognita === "momento" && f.esIncognitaMomento) ? <span style={{ fontFamily: F_MONO, color: C.gold }}>?</span>
                      : <Entrada value={f.momento} onChange={(e) => actualizar(f.id, "momento", e.target.value)} style={{ minWidth: 70 }} />}
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

        {/* Línea de tiempo visual */}
        <div style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Línea de tiempo</div>
          <div style={{ position: "relative", height: 70, background: C.paper, borderRadius: 8 }}>
            <div style={{ position: "absolute", left: 20, right: 20, top: 35, height: 2, background: C.line }} />
            {flujos.map((f) => {
              const m = parseFloat(f.momento) || 0;
              const pct = 20 + (m / maxMomento) * 60;
              const esIn = f.direccion === "entrada";
              return (
                <div key={f.id} title={`${f.descripcion || "Flujo"} · momento ${m}`} style={{ position: "absolute", left: `${pct}%`, top: esIn ? 6 : 38, transform: "translateX(-50%)", textAlign: "center" }}>
                  {esIn ? <ArrowUp size={16} color={C.success} /> : <ArrowDown size={16} color={C.danger} />}
                  <div style={{ fontSize: 10, color: C.slate, whiteSpace: "nowrap" }}>{m}</div>
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
          <Etiqueta>Resultado</Etiqueta>
          <div style={{ fontFamily: F_MONO, fontSize: 28, color: C.navy, fontWeight: 700, marginBottom: 8 }}>
            {resultado.tipo === "monto" && formatCurrencyCO(resultado.valor, moneda)}
            {resultado.tipo === "momento" && `${formatNumberCO(resultado.valor, 2, 4)} (unidad del régimen)`}
            {resultado.tipo === "tasa" && formatPercentCO(resultado.valor, 4)}
          </div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}>Momento focal utilizado: {resultado.focal}</div>
          <Verificacion ok={resultado.verifOk} residual={resultado.residual} />
          <Acordeon title="Ver procedimiento completo">
            <FichaProcedimiento pasos={[
              { label: "Régimen", content: resultado.regimen },
              { label: "Momento focal", content: String(resultado.focal) },
              { label: "Ecuación de valor", content: "Σ(entradas trasladadas) − Σ(salidas trasladadas) = Objetivo" },
              { label: "Objetivo", content: String(resultado.target) },
              { label: "Incógnita", content: resultado.tipo === "monto" ? "Valor de flujo" : resultado.tipo === "momento" ? "Momento de flujo" : "Tasa" },
              { label: "Resultado sin redondear", content: String(resultado.valor) },
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
   ============================================================ */
function Simular({ moneda }) {
  const [modo, setModo] = useState("basico");
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const cargar = useCallback(async () => setHistorial(await cargarHistorial()), []);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(entry) { await guardarHistorial(entry); cargar(); }
  async function limpiar() { await borrarHistorial(historial); setHistorial([]); }

  return (
    <Section style={{ paddingTop: 44, paddingBottom: 60 }}>
      <Etiqueta>Simulación / Cotización</Etiqueta>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        <h1 style={{ fontFamily: F_DISPLAY, fontSize: 30, color: C.navy, margin: 0 }}>Simula tu crédito o inversión</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant={modo === "basico" ? "gold" : "outline"} onClick={() => setModo("basico")}>Modo básico</Boton>
          <Boton small variant={modo === "avanzado" ? "gold" : "outline"} onClick={() => setModo("avanzado")}>Modo avanzado</Boton>
          <Boton small variant="ghost" onClick={() => setMostrarHistorial(!mostrarHistorial)}><RotateCcw size={13} /> Historial</Boton>
        </div>
      </div>

      {mostrarHistorial && (
        <Tarjeta style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Etiqueta>Historial local de simulaciones</Etiqueta>
            {historial.length > 0 && <Boton small variant="danger" onClick={limpiar}>Borrar historial</Boton>}
          </div>
          {historial.length === 0 ? <div style={{ fontSize: 13, color: C.slate }}>Aún no hay simulaciones guardadas.</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {historial.map((h, i) => (
                <div key={h.key || i} style={{ fontSize: 12.5, color: C.ink, display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.line}`, padding: "6px 0" }}>
                  <span>{new Date(h.fecha).toLocaleString("es-CO")} · {h.regimen} · {h.incognita}{h.resultado !== undefined ? ` · ${formatCurrencyCO(h.resultado, h.moneda)}` : ""}</span>
                </div>
              ))}
            </div>}
        </Tarjeta>
      )}

      {modo === "basico" ? <SimularBasico moneda={moneda} onGuardarHistorial={guardar} /> : <SimularAvanzado moneda={moneda} onGuardarHistorial={guardar} />}

      <div style={{ marginTop: 24, padding: 14, background: C.paperDark, borderRadius: 8, fontSize: 12, color: C.slate }}>
        En este primer corte convertimos el tiempo al número de periodos de la tasa; no convertimos tasas entre periodicidades.
      </div>
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
