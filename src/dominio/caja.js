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

export const RATIO_PREMIOS_MAXIMO = 0.7;

export function resumirCaja(movimientos) {
  let ingresos = 0;
  let egresos = 0;
  let premios = 0;
  const acumulado = new Map();

  for (const m of movimientos) {
    const monto = Number(m.montoCentavos) || 0;
    if (m.tipo === "ingreso") ingresos += monto;
    else egresos += monto;
    if (m.categoria === "premio") premios += monto;

    const clave = `${m.tipo}:${m.categoria}`;
    const actual = acumulado.get(clave) ?? { categoria: m.categoria, tipo: m.tipo, totalCentavos: 0 };
    actual.totalCentavos += monto;
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

export function alertasDeTorneo(torneo) {
  const alertas = [];
  const recaudado = torneo.inscripcionCentavos * torneo.participantesPagos;

  if (torneo.premioCentavos > 0 && recaudado > 0 && recaudado === torneo.premioCentavos) {
    alertas.push({
      nivel: "grave",
      mensaje:
        "El premio es exactamente igual a lo recaudado en inscripciones. Así se lee como pozo mutuo: " +
        "cambiá el monto del premio o dejalo fijo aunque entren más inscriptos.",
    });
  }

  if (torneo.premioCentavos > recaudado && recaudado > 0) {
    alertas.push({
      nivel: "info",
      mensaje:
        "El premio es mayor a lo recaudado: lo estás subsidiando vos. Está bien, pero anotalo en la caja.",
    });
  }

  if (torneo.estado === "inscripcion" && torneo.participantesTotales < torneo.minimoParticipantes) {
    const faltan = torneo.minimoParticipantes - torneo.participantesTotales;
    alertas.push({
      nivel: "atencion",
      mensaje: `Faltan ${faltan} inscriptos para el mínimo. Si no llega, se reprograma y se devuelve.`,
    });
  }

  const impagos = torneo.participantesTotales - torneo.participantesPagos;
  if (impagos > 0 && torneo.estado !== "borrador") {
    alertas.push({
      nivel: "atencion",
      mensaje: `${impagos} inscripto(s) sin pago confirmado ni pase activo.`,
    });
  }

  return alertas;
}

export function alertaRatioPremios(resumen) {
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
export function beneficioModerador(resumen, porcentaje) {
  if (resumen.saldoCentavos <= 0) return 0;
  return Math.round(resumen.saldoCentavos * porcentaje);
}
