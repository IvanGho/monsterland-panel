import { describe, expect, it } from "vitest";
import {
  alertaRatioPremios,
  alertasDeTorneo,
  beneficioModerador,
  resumirCaja,
  type Movimiento,
} from "../src/domain/caja.js";
import { esPistaLibre, paseVigente, validarInscripcion } from "../src/domain/elegibilidad.js";
import { formatoARS, pesosACentavos } from "../src/domain/money.js";
import { calcularRanking, puntosDeResultado, REGLAS_POR_DEFECTO } from "../src/domain/ranking.js";

describe("money", () => {
  it("parsea montos escritos como los escribe un argentino", () => {
    expect(pesosACentavos("7000")).toBe(700000);
    expect(pesosACentavos("7.000")).toBe(700000);
    expect(pesosACentavos("$7.000,50")).toBe(700050);
    expect(pesosACentavos("2500,25")).toBe(250025);
    expect(pesosACentavos("")).toBe(0);
  });

  it("formatea en pesos con separador de miles", () => {
    expect(formatoARS(700000)).toBe("$7.000,00");
    expect(formatoARS(250025)).toBe("$2.500,25");
    expect(formatoARS(0)).toBe("$0,00");
  });

  it("rechaza basura", () => {
    expect(() => pesosACentavos("no soy un monto")).toThrow();
  });
});

describe("ranking", () => {
  it("da cero puntos a quien no se presentó", () => {
    const puntos = puntosDeResultado(
      { torneoId: 1, jugadorId: 1, puesto: 5, victorias: 0, partidosJugados: 0, sePresento: false },
      REGLAS_POR_DEFECTO,
    );
    expect(puntos).toBe(0);
  });

  it("suma participación, check-in, victorias y bonus de puesto", () => {
    // 5 (participación) + 2 (check-in) + 3*3 (victorias) + 15 (campeón) = 31
    const puntos = puntosDeResultado(
      { torneoId: 1, jugadorId: 1, puesto: 1, victorias: 3, partidosJugados: 3, sePresento: true },
      REGLAS_POR_DEFECTO,
    );
    expect(puntos).toBe(31);
  });

  it("premia la constancia por encima de un título aislado", () => {
    // El que juega 4 torneos y sale segundo dos veces supera al que ganó uno y desapareció.
    const constante = [1, 2, 3, 4].map((torneoId) => ({
      torneoId,
      jugadorId: 10,
      puesto: torneoId <= 2 ? 2 : 4,
      victorias: torneoId <= 2 ? 2 : 1,
      partidosJugados: 3,
      sePresento: true,
    }));
    const fugaz = [
      { torneoId: 1, jugadorId: 20, puesto: 1, victorias: 3, partidosJugados: 3, sePresento: true },
    ];

    const ranking = calcularRanking([...constante, ...fugaz]);
    expect(ranking[0]!.jugadorId).toBe(10);
    expect(ranking[0]!.torneos).toBe(4);
  });

  it("desempata por títulos antes que por victorias", () => {
    const ranking = calcularRanking([
      // jugador 1: campeón con 2 victorias
      { torneoId: 1, jugadorId: 1, puesto: 1, victorias: 2, partidosJugados: 2, sePresento: true },
      // jugador 2: mismo puntaje pero sin título (3 victorias, puesto 3)
      { torneoId: 1, jugadorId: 2, puesto: 3, victorias: 4, partidosJugados: 4, sePresento: true },
    ]);
    // Empate en puntos: 5+2+6+15 = 28 vs 5+2+12+5 = 24 -> gana el campeón igual
    expect(ranking[0]!.jugadorId).toBe(1);
    expect(ranking[0]!.primeros).toBe(1);
  });
});

describe("caja", () => {
  const movimientos: Movimiento[] = [
    { fecha: "2026-08-01", tipo: "ingreso", categoria: "pase", concepto: "Pase 1", montoCentavos: 700000 },
    { fecha: "2026-08-02", tipo: "ingreso", categoria: "pase", concepto: "Pase 2", montoCentavos: 700000 },
    { fecha: "2026-08-03", tipo: "ingreso", categoria: "inscripcion", concepto: "Insc", montoCentavos: 250000 },
    { fecha: "2026-08-05", tipo: "egreso", categoria: "premio", concepto: "Premio S1", montoCentavos: 600000 },
    { fecha: "2026-08-06", tipo: "egreso", categoria: "infra", concepto: "Nitro", montoCentavos: 912000 },
  ];

  it("resume ingresos, egresos y saldo", () => {
    const resumen = resumirCaja(movimientos);
    expect(resumen.ingresosCentavos).toBe(1650000);
    expect(resumen.egresosCentavos).toBe(1512000);
    expect(resumen.saldoCentavos).toBe(138000);
    expect(resumen.premiosCentavos).toBe(600000);
  });

  it("agrupa por categoría de mayor a menor", () => {
    const resumen = resumirCaja(movimientos);
    expect(resumen.porCategoria[0]!.categoria).toBe("pase");
    expect(resumen.porCategoria[0]!.totalCentavos).toBe(1400000);
  });

  it("avisa cuando los premios se comen más del 70% de los ingresos", () => {
    const resumen = resumirCaja([
      { fecha: "2026-08-01", tipo: "ingreso", categoria: "inscripcion", concepto: "x", montoCentavos: 100000 },
      { fecha: "2026-08-02", tipo: "egreso", categoria: "premio", concepto: "y", montoCentavos: 90000 },
    ]);
    const alerta = alertaRatioPremios(resumen);
    expect(alerta?.nivel).toBe("grave");
    expect(alerta?.mensaje).toContain("90%");
  });

  it("no avisa nada si no hubo ingresos", () => {
    expect(alertaRatioPremios(resumirCaja([]))).toBeNull();
  });

  it("el mod no cobra beneficio si el mes cerró en rojo", () => {
    const enRojo = resumirCaja([
      { fecha: "2026-08-01", tipo: "ingreso", categoria: "pase", concepto: "x", montoCentavos: 100000 },
      { fecha: "2026-08-02", tipo: "egreso", categoria: "premio", concepto: "y", montoCentavos: 300000 },
    ]);
    expect(beneficioModerador(enRojo, 0.15)).toBe(0);
  });

  it("calcula el beneficio del mod sobre el saldo", () => {
    const resumen = resumirCaja(movimientos);
    expect(beneficioModerador(resumen, 0.15)).toBe(Math.round(138000 * 0.15));
  });
});

describe("alertasDeTorneo", () => {
  const base = {
    inscripcionCentavos: 250000,
    premioCentavos: 600000,
    participantesPagos: 4,
    participantesTotales: 4,
    minimoParticipantes: 6,
    estado: "inscripcion",
  };

  it("grita cuando el premio es exactamente lo recaudado (lectura de pozo mutuo)", () => {
    const alertas = alertasDeTorneo({ ...base, participantesPagos: 4, premioCentavos: 1000000, minimoParticipantes: 2 });
    expect(alertas.some((a) => a.nivel === "grave" && a.mensaje.includes("pozo mutuo"))).toBe(true);
  });

  it("avisa si falta gente para el mínimo", () => {
    const alertas = alertasDeTorneo(base);
    expect(alertas.some((a) => a.mensaje.includes("Faltan 2 inscriptos"))).toBe(true);
  });

  it("avisa por inscriptos impagos", () => {
    const alertas = alertasDeTorneo({ ...base, participantesTotales: 6, participantesPagos: 4, minimoParticipantes: 6 });
    expect(alertas.some((a) => a.mensaje.includes("2 inscripto(s) sin pago"))).toBe(true);
  });

  it("no inventa alertas cuando todo está en orden", () => {
    const alertas = alertasDeTorneo({
      inscripcionCentavos: 250000,
      premioCentavos: 600000,
      participantesPagos: 8,
      participantesTotales: 8,
      minimoParticipantes: 6,
      estado: "en_juego",
    });
    expect(alertas).toHaveLength(0);
  });
});

describe("elegibilidad", () => {
  const torneoPago = {
    inscripcionCentavos: 250000,
    premioCentavos: 600000,
    premioTipo: "gift_card" as const,
    cupo: 8,
    estado: "inscripcion",
  };
  const pistaLibre = { ...torneoPago, inscripcionCentavos: 0, premioCentavos: 0 };
  const contexto = { participantesActuales: 2, tienePaseActivo: false, pagoConfirmado: true };

  it("bloquea a quien no tiene 18+ confirmado en torneos con plata", () => {
    const veredicto = validarInscripcion(
      { id: 1, nombre: "Test", mayorEdad: false, baneado: false },
      torneoPago,
      contexto,
    );
    expect(veredicto.puede).toBe(false);
    expect(veredicto.motivos.join(" ")).toContain("18+");
  });

  it("deja jugar en Pista Libre sin 18+ confirmado", () => {
    const veredicto = validarInscripcion(
      { id: 1, nombre: "Test", mayorEdad: false, baneado: false },
      pistaLibre,
      contexto,
    );
    expect(veredicto.puede).toBe(true);
    expect(esPistaLibre(pistaLibre)).toBe(true);
  });

  it("bloquea baneados, cupo lleno e inscripción cerrada", () => {
    expect(
      validarInscripcion({ id: 1, nombre: "T", mayorEdad: true, baneado: true }, torneoPago, contexto).puede,
    ).toBe(false);
    expect(
      validarInscripcion({ id: 1, nombre: "T", mayorEdad: true, baneado: false }, torneoPago, {
        ...contexto,
        participantesActuales: 8,
      }).puede,
    ).toBe(false);
    expect(
      validarInscripcion({ id: 1, nombre: "T", mayorEdad: true, baneado: false }, { ...torneoPago, estado: "borrador" }, contexto)
        .puede,
    ).toBe(false);
  });

  it("no pide pago si tiene pase activo", () => {
    const veredicto = validarInscripcion(
      { id: 1, nombre: "T", mayorEdad: true, baneado: false },
      torneoPago,
      { participantesActuales: 1, tienePaseActivo: true, pagoConfirmado: false },
    );
    expect(veredicto.puede).toBe(true);
    expect(veredicto.requierePago).toBe(false);
  });

  it("pide pago si no tiene pase ni pago confirmado", () => {
    const veredicto = validarInscripcion(
      { id: 1, nombre: "T", mayorEdad: true, baneado: false },
      torneoPago,
      { participantesActuales: 1, tienePaseActivo: false, pagoConfirmado: false },
    );
    expect(veredicto.requierePago).toBe(true);
  });

  it("valida la vigencia del pase por fecha", () => {
    const pase = { desdeFecha: "2026-08-01", hastaFecha: "2026-08-31" };
    expect(paseVigente(pase, "2026-08-15")).toBe(true);
    expect(paseVigente(pase, "2026-09-01")).toBe(false);
    expect(paseVigente(undefined, "2026-08-15")).toBe(false);
  });
});
