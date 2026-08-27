import * as E from "./financialEngine.mjs";

let pass = 0, fail = 0;
const results = [];

function check(name, condition, detail) {
  if (condition) { pass++; results.push(`✓ PASS  ${name}`); }
  else { fail++; results.push(`✗ FAIL  ${name}  ${detail || ""}`); }
}
function close(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }

// ===================== SIMPLE =====================
{
  const VP = 1000000, i = 0.02, n = 10;
  const VF = E.futureValueSimple(VP, i, n);
  check("Simple: VF esperado", close(VF, 1200000), VF);
  check("Simple: VP round-trip", close(E.presentValueSimple(VF, i, n), VP));
  check("Simple: i round-trip", close(E.solveRateSimple(VP, VF, n), i));
  check("Simple: n round-trip", close(E.solveTimeSimple(VP, VF, i), n));
}

// ===================== COMPUESTO =====================
{
  const VP = 1000000, i = 0.03, n = 12;
  const VF = E.futureValueCompound(VP, i, n);
  check("Compuesto: VP round-trip", close(E.presentValueCompound(VF, i, n), VP));
  check("Compuesto: i round-trip", close(E.solveRateCompound(VP, VF, n), i));
  check("Compuesto: n round-trip", close(E.solveTimeCompound(VP, VF, i), n));
}

// ===================== CONTINUO =====================
{
  const VP = 1000000, r = 0.06, t = 3.75;
  const VF = E.futureValueContinuous(VP, r, t);
  check("Continuo: VP round-trip", close(E.presentValueContinuous(VF, r, t), VP));
  check("Continuo: r round-trip", close(E.solveRateContinuous(VP, VF, t), r));
  check("Continuo: t round-trip", close(E.solveTimeContinuous(VP, VF, r), t));
}

// ===================== CONVERSIÓN DE TIEMPO =====================
{
  // 2 años 4 meses, tasa bimestral (2 meses) -> n = 14
  const n = E.convertTimeToPeriods(2, 4, 2);
  check("Conversión tiempo: 2a4m bimestral = 14", close(n, 14), n);

  const back = E.periodsToYearsMonths(14, 2);
  check("periodsToYearsMonths inverso", back.anios === 2 && close(back.meses, 4), JSON.stringify(back));

  // Cada N meses, N=5 (quintumestral)
  const n5 = E.convertTimeToPeriods(3, 0, 5);
  check("Conversión tiempo: 3a cada 5 meses = 7.2", close(n5, 7.2), n5);

  // continuo: 3 años 9 meses = 3.75
  check("Continuo años+meses -> t", close(E.yearsMonthsToDecimalYears(3, 9), 3.75));
}

// ===================== CASO A (documento) =====================
// Tasa 3,80% trimestral simple. 7 años 6 meses. VF pagado = 3.622.937. Buscar VP.
{
  const i = 0.038;
  const n = E.convertTimeToPeriods(7, 6, 3); // trimestral = 3 meses
  const VF = 3622937;
  const VP = E.presentValueSimple(VF, i, n);
  const backVF = E.futureValueSimple(VP, i, n);
  check("Caso A: n = 30 trimestres", close(n, 30), n);
  check("Caso A: verificación por sustitución VP->VF", close(backVF, VF, 1e-4), `VP=${VP} backVF=${backVF}`);
  results.push(`   Caso A → VP calculado = ${E.formatCurrencyCO(VP, "COP")}`);
}

// ===================== CASO B (documento, flujo desconocido lineal) =====================
// F1 = 12.000.000 en t=0 (meses). F2 = X en t=66 meses (5a6m). Tasa 2,3% mensual simple.
// Interpretación de prueba: total pagado 46.360.000 medido en el momento del 2º desembolso (t=66 meses).
{
  const tasa = 0.023;
  const momentoFocal = E.convertTimeToPeriods(5, 6, 1); // en meses
  const flows = [
    { monto: 12000000, momento: 0, signo: 1, esIncognita: false, coeficiente: 0 },
    { monto: 0, momento: momentoFocal, signo: 1, esIncognita: true, coeficiente: 1 },
  ];
  const sol = E.solveUnknownCashFlow(flows, momentoFocal, "simple", tasa, 46360000);
  check("Caso B: solver converge", sol.ok, JSON.stringify(sol));
  if (sol.ok) {
    // Verificación: sustituir X y comprobar que la suma trasladada = objetivo
    const total =
      E.trasladoFlujo(12000000, 0, momentoFocal, "simple", tasa) +
      E.trasladoFlujo(sol.value, momentoFocal, momentoFocal, "simple", tasa);
    check("Caso B: verificación por sustitución", close(total, 46360000, 1e-6), `total=${total}`);
    results.push(`   Caso B → X (segundo desembolso) = ${E.formatCurrencyCO(sol.value, "COP")}`);
  }
}

// ===================== CASO C (documento, coeficiente 1,4X + tasa desconocida no probada aquí, se prueba estructura) =====================
{
  // F1 = X en mes 0, F2 = 1,4X en el "semestre 4" (2 años = 4 semestres), tasa 4% semestral simple
  // objetivo: probar que el motor resuelve X dado un target de ganancia neta arbitraria de prueba.
  const tasa = 0.04;
  const momentoFocal = 20; // semestres (10 años)
  const flows = [
    { monto: 0, momento: 0, signo: -1, esIncognita: true, coeficiente: 1 }, // banco entrega X (salida para el banco)
    { monto: 0, momento: 4, signo: -1, esIncognita: true, coeficiente: 1.4 }, // banco entrega 1.4X
  ];
  // Para que sea lineal en una sola incógnita, probamos aisladamente el mecanismo de coeficientes:
  const sol = E.solveUnknownCashFlow(flows, momentoFocal, "simple", tasa, -46200000);
  check("Caso C: mecanismo de coeficiente 1,4X resuelve", sol.ok, JSON.stringify(sol));
  if (sol.ok) results.push(`   Caso C (estructura) → X = ${E.formatCurrencyCO(sol.value, "COP")}`);
}

// ===================== VALIDACIONES =====================
{
  check("validateSolution rechaza NaN", E.validateSolution(NaN) === false);
  check("validateSolution rechaza Infinity", E.validateSolution(Infinity) === false);
  check("validateSolution acepta número finito", E.validateSolution(1234.5) === true);
}

// ===================== FORMATO COLOMBIANO =====================
{
  const f = E.formatCurrencyCO(1250000.5, "COP");
  check("Formato CO: separadores correctos", f === "$ 1.250.000,50", f);
  const p = E.formatPercentCO(0.038);
  check("Formato CO: porcentaje", p === "3,80 %", p);
}

// ===================== BISECCIÓN (tasa con múltiples flujos) =====================
{
  // Construimos un caso sintético con tasa conocida y verificamos que el solver la recupera.
  const tasaReal = 0.045;
  const momentoFocal = 5;
  const flows = [
    { monto: 5000000, momento: 0, signo: 1 },
    { monto: 3000000, momento: 2, signo: 1 },
  ];
  let target = 0;
  for (const f of flows) target += f.signo * f.monto * E.trasladoFlujo(1, f.momento, momentoFocal, "compuesto", tasaReal);
  const sol = E.solveUnknownRateMultiFlow(flows, momentoFocal, "compuesto", target);
  check("Bisección: recupera tasa real", sol.ok && close(sol.value, tasaReal, 1e-4), JSON.stringify(sol));
}

console.log(results.join("\n"));
console.log(`\n${pass} pasaron, ${fail} fallaron de ${pass + fail} pruebas.`);
process.exit(fail > 0 ? 1 : 0);
