/**
 * Tests de la lógica pura: no tocan base ni HTTP.
 * Correr con: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatoARS, pesosACentavos, aUSD } from "../src/dominio/dinero.js";
import {
  armarLlave,
  cargarResultado,
  llaveTerminada,
  mezclar,
  nombreDeRonda,
  ordenDeSiembra,
  proximaPotenciaDeDos,
  puestos,
} from "../src/dominio/llave.js";
import { calcularRanking, REGLAS_POR_DEFECTO } from "../src/dominio/ranking.js";
import {
  alertaRatioPremios,
  alertasDeTorneo,
  beneficioModerador,
  resumirCaja,
} from "../src/dominio/caja.js";
import { validarInscripcion } from "../src/dominio/elegibilidad.js";

describe("dinero", () => {
  it("convierte pesos a centavos aceptando formato argentino", () => {
    assert.equal(pesosACentavos("2500"), 250000);
    assert.equal(pesosACentavos("1.500,50"), 150050);
    assert.equal(pesosACentavos("$2.000"), 200000);
    assert.equal(pesosACentavos(""), 0);
    assert.equal(pesosACentavos(25), 2500);
  });

  it("rechaza montos que no son números", () => {
    assert.throws(() => pesosACentavos("dos mil"), /Monto inválido/);
  });

  it("no pierde plata por redondeo de float", () => {
    // 0.1 + 0.2 en float da 0.30000000000000004: en centavos enteros esto no puede pasar.
    const total = pesosACentavos("0,10") + pesosACentavos("0,20");
    assert.equal(total, 30);
    assert.equal(formatoARS(total), "$0,30");
  });

  it("formatea con separador de miles", () => {
    assert.equal(formatoARS(150050), "$1.500,50");
    assert.equal(formatoARS(-250000), "-$2.500,00");
    assert.equal(formatoARS(0), "$0,00");
  });

  it("muestra s/d cuando no hay tipo de cambio", () => {
    assert.equal(aUSD(100000, 0), "s/d");
    assert.equal(aUSD(152000, 1520), "US$1.00");
  });
});

describe("siembra de la llave", () => {
  it("redondea a la próxima potencia de dos", () => {
    assert.equal(proximaPotenciaDeDos(5), 8);
    assert.equal(proximaPotenciaDeDos(8), 8);
    assert.equal(proximaPotenciaDeDos(9), 16);
  });

  it("cruza al mejor con el peor y separa al 1 del 2", () => {
    const orden = ordenDeSiembra(8);
    assert.deepEqual(orden, [1, 8, 4, 5, 2, 7, 3, 6]);
    // El 1 y el 2 tienen que caer en mitades opuestas: sólo se cruzan en la final.
    assert.ok(orden.indexOf(1) < 4 && orden.indexOf(2) >= 4);
  });

  it("nombra las rondas desde el final", () => {
    assert.equal(nombreDeRonda(3, 3), "Final");
    assert.equal(nombreDeRonda(2, 3), "Semifinal");
    assert.equal(nombreDeRonda(1, 3), "Cuartos");
  });

  it("mezcla de forma determinista si se le pasa el random", () => {
    let n = 0;
    const fijo = () => ((n += 1) * 0.37) % 1;
    assert.deepEqual(mezclar([1, 2, 3, 4], fijo), mezclar([1, 2, 3, 4], (() => { let m = 0; return () => ((m += 1) * 0.37) % 1; })()));
  });
});

describe("llave de eliminación simple", () => {
  const opciones = { bestOf: 1, bestOfFinal: 3 };

  it("arma un cuadro de 4 con 2 rondas", () => {
    const llave = armarLlave([1, 2, 3, 4], opciones);
    assert.equal(llave.filter((p) => p.ronda === 1).length, 2);
    assert.equal(llave.filter((p) => p.ronda === 2).length, 1);
    assert.equal(llave.find((p) => p.ronda === 2).bestOf, 3, "la final usa el BO de final");
  });

  it("resuelve los BYE haciendo avanzar solos a los mejores sembrados", () => {
    // 5 participantes en un cuadro de 8: tres BYE.
    const llave = armarLlave([1, 2, 3, 4, 5], opciones);
    const byes = llave.filter((p) => p.ronda === 1 && p.estado === "walkover");
    assert.equal(byes.length, 3);
    // El 1 sembrado no juega la primera ronda y ya aparece en la segunda.
    const segunda = llave.filter((p) => p.ronda === 2);
    assert.ok(segunda.some((p) => p.a === 1 || p.b === 1));
  });

  it("propaga al ganador a la ronda siguiente", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    const semi = llave.find((p) => p.ronda === 1 && p.posicion === 0);
    llave = cargarResultado(llave, {
      ronda: 1,
      posicion: 0,
      ganadorId: semi.a,
      scoreA: 1,
      scoreB: 0,
    });
    const final = llave.find((p) => p.ronda === 2 && p.posicion === 0);
    assert.equal(final.a, semi.a, "el ganador del partido 0 entra por la ranura A de la final");
  });

  it("exige la cantidad de mapas del BO", () => {
    const llave = armarLlave([1, 2], { bestOf: 3, bestOfFinal: 3 });
    const final = llave.find((p) => p.ronda === 1);
    assert.throws(
      () => cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: final.a, scoreA: 1, scoreB: 0 }),
      /BO3/,
      "1-0 no alcanza para ganar un BO3",
    );
    // Con walkover sí se permite, porque el rival no se presentó.
    const conWo = cargarResultado(llave, {
      ronda: 1,
      posicion: 0,
      ganadorId: final.a,
      scoreA: 1,
      scoreB: 0,
      walkover: true,
    });
    assert.equal(llaveTerminada(conWo), true);
  });

  it("rechaza un ganador que no jugó el partido", () => {
    const llave = armarLlave([1, 2, 3, 4], opciones);
    assert.throws(
      () => cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 999, scoreA: 1, scoreB: 0 }),
      /tiene que ser uno de los dos/,
    );
  });

  it("al corregir un resultado limpia lo que venía después", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    const s1 = llave.find((p) => p.ronda === 1 && p.posicion === 0);
    const s2 = llave.find((p) => p.ronda === 1 && p.posicion === 1);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: s1.a, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: s2.a, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: s1.a, scoreA: 2, scoreB: 0 });
    assert.equal(llaveTerminada(llave), true);

    // Se corrige la semifinal: la final tiene que quedar sin ganador.
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: s1.b, scoreA: 0, scoreB: 1 });
    const final = llave.find((p) => p.ronda === 2 && p.posicion === 0);
    assert.equal(final.ganadorId, null, "la final no puede seguir teniendo ganador");
    assert.equal(final.a, s1.b, "y ahora la ocupa el nuevo ganador de la semi");
    assert.equal(llaveTerminada(llave), false);
  });

  it("da el tercer puesto compartido a los dos perdedores de semis", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    const s1 = llave.find((p) => p.ronda === 1 && p.posicion === 0);
    const s2 = llave.find((p) => p.ronda === 1 && p.posicion === 1);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: s1.a, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: s2.a, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: s1.a, scoreA: 2, scoreB: 0 });

    const tabla = puestos(llave, [1, 2, 3, 4]);
    assert.equal(tabla.find((p) => p.participanteId === s1.a).puesto, 1);
    assert.equal(tabla.find((p) => p.participanteId === s2.a).puesto, 2);
    assert.equal(tabla.filter((p) => p.puesto === 3).length, 2);
  });
});

describe("ranking", () => {
  it("premia la asistencia además del resultado", () => {
    const ranking = calcularRanking(
      [
        { torneoId: 1, jugadorId: 10, puesto: 1, victorias: 2, partidosJugados: 2, sePresento: true },
        { torneoId: 1, jugadorId: 11, puesto: 4, victorias: 0, partidosJugados: 1, sePresento: true },
      ],
      REGLAS_POR_DEFECTO,
    );
    // Campeón: 5 participación + 2 check-in + 2*3 victorias + 15 bonus = 28
    assert.equal(ranking[0].puntos, 28);
    // Último: 5 + 2 = 7. El que participa y pierde igual suma, que es el punto.
    assert.equal(ranking[1].puntos, 7);
  });

  it("no da puntos a quien no se presentó", () => {
    const ranking = calcularRanking([
      { torneoId: 1, jugadorId: 10, puesto: 5, victorias: 0, partidosJugados: 0, sePresento: false },
    ]);
    assert.equal(ranking[0].puntos, 0);
    assert.equal(ranking[0].torneos, 0);
  });

  it("con puntos empatados gana el que tiene más títulos", () => {
    // Empate armado a propósito:
    //   campeón con 1 victoria  -> 5 + 2 + 3*1 + 15 = 25
    //   finalista con 3 victorias -> 5 + 2 + 3*3 + 9 = 25
    const ranking = calcularRanking([
      { torneoId: 1, jugadorId: 1, puesto: 2, victorias: 3, partidosJugados: 4, sePresento: true },
      { torneoId: 2, jugadorId: 2, puesto: 1, victorias: 1, partidosJugados: 1, sePresento: true },
    ]);
    assert.equal(ranking[0].puntos, 25);
    assert.equal(ranking[1].puntos, 25, "los dos tienen que empatar en puntos");
    assert.equal(ranking[0].jugadorId, 2, "desempata el título, no las victorias");
  });

  it("suma los torneos de una temporada", () => {
    const ranking = calcularRanking([
      { torneoId: 1, jugadorId: 7, puesto: 1, victorias: 2, partidosJugados: 2, sePresento: true },
      { torneoId: 2, jugadorId: 7, puesto: 2, victorias: 1, partidosJugados: 2, sePresento: true },
    ]);
    assert.equal(ranking[0].torneos, 2);
    assert.equal(ranking[0].primeros, 1);
    assert.equal(ranking[0].segundos, 1);
    assert.equal(ranking[0].puntos, 28 + (5 + 2 + 3 + 9));
  });
});

describe("caja", () => {
  const movimientos = [
    { tipo: "ingreso", categoria: "inscripcion", montoCentavos: 250000, fecha: "2026-08-01" },
    { tipo: "ingreso", categoria: "pase", montoCentavos: 700000, fecha: "2026-08-02" },
    { tipo: "egreso", categoria: "premio", montoCentavos: 600000, fecha: "2026-08-03" },
    { tipo: "egreso", categoria: "infra", montoCentavos: 91200, fecha: "2026-08-04" },
  ];

  it("resume ingresos, egresos y saldo", () => {
    const r = resumirCaja(movimientos);
    assert.equal(r.ingresosCentavos, 950000);
    assert.equal(r.egresosCentavos, 691200);
    assert.equal(r.saldoCentavos, 258800);
    assert.equal(r.premiosCentavos, 600000);
  });

  it("calcula el beneficio del mod sobre el saldo, no sobre los ingresos", () => {
    const r = resumirCaja(movimientos);
    assert.equal(beneficioModerador(r, 0.15), Math.round(258800 * 0.15));
  });

  it("no le paga al mod si el mes cerró en rojo", () => {
    const rojo = resumirCaja([{ tipo: "egreso", categoria: "premio", montoCentavos: 100000 }]);
    assert.equal(beneficioModerador(rojo, 0.15), 0);
  });

  it("avisa cuando los premios se comen más del 70% de los ingresos", () => {
    const caro = resumirCaja([
      { tipo: "ingreso", categoria: "inscripcion", montoCentavos: 100000 },
      { tipo: "egreso", categoria: "premio", montoCentavos: 80000 },
    ]);
    assert.equal(alertaRatioPremios(caro).nivel, "grave");
    const sano = resumirCaja([
      { tipo: "ingreso", categoria: "inscripcion", montoCentavos: 100000 },
      { tipo: "egreso", categoria: "premio", montoCentavos: 50000 },
    ]);
    assert.equal(alertaRatioPremios(sano), null);
  });

  it("marca el caso en que el premio iguala lo recaudado (parece pozo mutuo)", () => {
    const alertas = alertasDeTorneo({
      inscripcionCentavos: 100000,
      premioCentavos: 400000,
      participantesPagos: 4,
      participantesTotales: 4,
      minimoParticipantes: 4,
      estado: "inscripcion",
    });
    assert.ok(alertas.some((a) => a.nivel === "grave" && /pozo mutuo/.test(a.mensaje)));
  });

  it("avisa si faltan inscriptos para el mínimo", () => {
    const alertas = alertasDeTorneo({
      inscripcionCentavos: 0,
      premioCentavos: 0,
      participantesPagos: 2,
      participantesTotales: 2,
      minimoParticipantes: 6,
      estado: "inscripcion",
    });
    assert.ok(alertas.some((a) => /Faltan 4 inscriptos/.test(a.mensaje)));
  });
});

describe("elegibilidad", () => {
  const torneoConPlata = {
    inscripcionCentavos: 250000,
    premioCentavos: 600000,
    cupo: 8,
    estado: "inscripcion",
  };
  const pistaLibre = { inscripcionCentavos: 0, premioCentavos: 0, cupo: 8, estado: "inscripcion" };
  const contexto = { participantesActuales: 0, tienePaseActivo: false, pagoConfirmado: true };

  it("bloquea a alguien sin 18+ en un torneo con plata", () => {
    const v = validarInscripcion(
      { nombre: "Pibe", mayorEdad: false, baneado: false },
      torneoConPlata,
      contexto,
    );
    assert.equal(v.puede, false);
    assert.ok(v.motivos.some((m) => /18\+/.test(m)));
  });

  it("deja entrar a esa misma persona a la Pista Libre", () => {
    const v = validarInscripcion(
      { nombre: "Pibe", mayorEdad: false, baneado: false },
      pistaLibre,
      contexto,
    );
    assert.equal(v.puede, true);
  });

  it("bloquea baneados y cupo completo", () => {
    assert.equal(
      validarInscripcion({ nombre: "X", mayorEdad: true, baneado: true }, pistaLibre, contexto).puede,
      false,
    );
    assert.equal(
      validarInscripcion({ nombre: "X", mayorEdad: true, baneado: false }, pistaLibre, {
        ...contexto,
        participantesActuales: 8,
      }).puede,
      false,
    );
  });

  it("no deja inscribir si la inscripción no está abierta", () => {
    const v = validarInscripcion({ nombre: "X", mayorEdad: true, baneado: false }, { ...pistaLibre, estado: "borrador" }, contexto);
    assert.equal(v.puede, false);
  });

  it("marca que falta pago salvo que tenga pase", () => {
    const sinPagar = validarInscripcion(
      { nombre: "X", mayorEdad: true, baneado: false },
      torneoConPlata,
      { ...contexto, pagoConfirmado: false },
    );
    assert.equal(sinPagar.requierePago, true);
    const conPase = validarInscripcion(
      { nombre: "X", mayorEdad: true, baneado: false },
      torneoConPlata,
      { ...contexto, pagoConfirmado: false, tienePaseActivo: true },
    );
    assert.equal(conPase.requierePago, false);
  });
});
