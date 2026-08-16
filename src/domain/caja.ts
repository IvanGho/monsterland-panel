/**
 * Caja y control de riesgo.
 *
 * Dos cosas que este módulo existe para vigilar:
 *
 * 1. Sustentabilidad: si los premios se comen más del 70% de lo que entra, no queda nada
 *    para reinvertir ni para el beneficio del mod. El panel avisa antes de que pase.
 *
 * 2. Desacople premio/inscripciones: el premio tiene que ser FIJO y decidido antes de abrir
 *    la inscripción. Si el premio de un torneo coincide con lo recaudado en inscripciones,
 *    empieza a parecerse a un pozo mutuo, que es justamente la lectura que hay que evitar.
 *    `alertasDeTorneo` marca esos casos para que se corrija el reglamento, no para bloquear.
 */

export type TipoMovimiento = "ingreso" | "egreso";

export interface Movimiento {
  id?: number;
  fecha: string; // YYYY-MM-DD
  tipo: TipoMovimiento;
  categoria: string;
  concepto: string;
  montoCentavos: number;
  torneoId?: number | null;
}

export interface ResumenCaja {
  ingresosCentavos: number;
  egresosCentavos: number;
  saldoCentavos: number;
  premiosCentavos: number;
  ratioPremios: number; // premios / ingresos, 0 si no hay ingresos
  porCategoria: Array<{ categoria: string; tipo: TipoMovimiento; totalCentavos: number }>;
}

export function resumirCaja(movimientos: Movimiento[]): ResumenCaja {
  let ingresos = 0;
  let egresos = 0;
  let premios = 0;
  const acumulado = new Map<string, { categoria: string; tipo: TipoMovimiento; totalCentavos: number }>();

  for (const m of movimientos) {
    if (m.tipo === "ingreso") ingresos += m.montoCentavos;
    else egresos += m.montoCentavos;
    if (m.categoria === "premio") premios += m.montoCentavos;

    const clave = `${m.tipo}:${m.categoria}`;
    const actual = acumulado.get(clave) ?? { categoria: m.categoria, tipo: m.tipo, totalCentavos: 0 };
    actual.totalCentavos += m.montoCentavos;
    acumulado.set(clave, actual);
  }

  return {
    ingresosCentavos: ingresos,
    egresosCentavos: egresos,
    saldoCentavos: ingresos - egresos,
    premiosCentavos: premios,
    ratioPremios: ingresos > 0 ? premios / ingresos : 0,
    porCategoria: [...acumulado.values()].sort((a, b) => b.totalCentavos - a.totalCentavos),
  };
}

export const RATIO_PREMIOS_MAXIMO = 0.7;

export interface DatosTorneoParaAlertas {
  inscripcionCentavos: number;
  premioCentavos: number;
  participantesPagos: number;
  participantesTotales: number;
  minimoParticipantes: number;
  estado: string;
}

export interface Alerta {
  nivel: "info" | "atencion" | "grave";
  mensaje: string;
}

export function alertasDeTorneo(t: DatosTorneoParaAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const recaudado = t.inscripcionCentavos * t.participantesPagos;

  if (t.premioCentavos > 0 && recaudado > 0 && recaudado === t.premioCentavos) {
    alertas.push({
      nivel: "grave",
      mensaje:
        "El premio es exactamente igual a lo recaudado en inscripciones. Así se lee como pozo mutuo: " +
        "cambiá el monto del premio o dejalo fijo aunque entren más inscriptos.",
    });
  }

  if (t.premioCentavos > recaudado && recaudado > 0) {
    alertas.push({
      nivel: "info",
      mensaje: "El premio es mayor a lo recaudado: lo estás subsidiando vos. Está bien, pero anotalo en la caja.",
    });
  }

  if (t.estado === "inscripcion" && t.participantesTotales < t.minimoParticipantes) {
    alertas.push({
      nivel: "atencion",
      mensaje: `Faltan ${t.minimoParticipantes - t.participantesTotales} inscriptos para el mínimo. Si no llega, se reprograma y se devuelve.`,
    });
  }

  const impagos = t.participantesTotales - t.participantesPagos;
  if (impagos > 0 && t.estado !== "borrador") {
    alertas.push({
      nivel: "atencion",
      mensaje: `${impagos} inscripto(s) sin pago confirmado ni pase activo.`,
    });
  }

  return alertas;
}

export function alertaRatioPremios(resumen: ResumenCaja): Alerta | null {
  if (resumen.ingresosCentavos === 0) return null;
  if (resumen.ratioPremios > RATIO_PREMIOS_MAXIMO) {
    const pct = Math.round(resumen.ratioPremios * 100);
    return {
      nivel: "grave",
      mensaje: `Los premios se llevaron el ${pct}% de los ingresos del período (límite sugerido: 70%). No queda margen para reinvertir ni para el beneficio del mod.`,
    };
  }
  return null;
}

/**
 * Beneficio del moderador: porcentaje del saldo (ingresos - egresos) del período.
 * Se calcula sobre el saldo y no sobre los ingresos justamente para que el mod no cobre
 * cuando el mes cerró en rojo.
 */
export function beneficioModerador(resumen: ResumenCaja, porcentaje: number): number {
  if (resumen.saldoCentavos <= 0) return 0;
  return Math.round(resumen.saldoCentavos * porcentaje);
}
