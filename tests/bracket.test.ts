import { describe, expect, it } from "vitest";
import {
  armarLlave,
  cargarResultado,
  llaveTerminada,
  mezclar,
  nombreDeRonda,
  ordenDeSiembra,
  proximaPotenciaDeDos,
  puestos,
} from "../src/domain/bracket.js";

const opciones = { bestOf: 1, bestOfFinal: 3 };

describe("proximaPotenciaDeDos", () => {
  it("redondea para arriba", () => {
    expect(proximaPotenciaDeDos(2)).toBe(2);
    expect(proximaPotenciaDeDos(5)).toBe(8);
    expect(proximaPotenciaDeDos(8)).toBe(8);
    expect(proximaPotenciaDeDos(9)).toBe(16);
  });
});

describe("ordenDeSiembra", () => {
  it("cruza mejor contra peor sembrado", () => {
    expect(ordenDeSiembra(4)).toEqual([1, 4, 2, 3]);
    expect(ordenDeSiembra(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("deja al 1 y al 2 en mitades opuestas del cuadro", () => {
    const orden = ordenDeSiembra(16);
    const mitad = orden.length / 2;
    const posicionDel1 = orden.indexOf(1);
    const posicionDel2 = orden.indexOf(2);
    expect(posicionDel1 < mitad).toBe(true);
    expect(posicionDel2 >= mitad).toBe(true);
  });

  it("no repite ni saltea sembrados", () => {
    const orden = ordenDeSiembra(16);
    expect(orden.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
});

describe("armarLlave", () => {
  it("arma 3 rondas para 8 participantes", () => {
    const llave = armarLlave([1, 2, 3, 4, 5, 6, 7, 8], opciones);
    expect(llave.filter((p) => p.ronda === 1)).toHaveLength(4);
    expect(llave.filter((p) => p.ronda === 2)).toHaveLength(2);
    expect(llave.filter((p) => p.ronda === 3)).toHaveLength(1);
  });

  it("la final usa el best of de la final", () => {
    const llave = armarLlave([1, 2, 3, 4], opciones);
    const final = llave.find((p) => p.ronda === 2)!;
    const semi = llave.find((p) => p.ronda === 1)!;
    expect(final.bestOf).toBe(3);
    expect(semi.bestOf).toBe(1);
  });

  it("da BYE a los mejores sembrados cuando el número no es potencia de 2", () => {
    // 6 participantes en cuadro de 8: los sembrados 1 y 2 pasan directo.
    const llave = armarLlave([1, 2, 3, 4, 5, 6], opciones);
    const primeraRonda = llave.filter((p) => p.ronda === 1);
    const byes = primeraRonda.filter((p) => p.estado === "walkover");
    expect(byes).toHaveLength(2);
    expect(byes.map((p) => p.ganadorId).sort()).toEqual([1, 2]);

    // Y esos ganadores ya aparecen en la ronda 2.
    const ronda2 = llave.filter((p) => p.ronda === 2);
    const enRonda2 = ronda2.flatMap((p) => [p.a, p.b]).filter((x) => x !== null);
    expect(enRonda2).toContain(1);
    expect(enRonda2).toContain(2);
  });

  it("resuelve el caso de 3 participantes: el 1 espera en la final", () => {
    const llave = armarLlave([1, 2, 3], opciones);
    const walkovers = llave.filter((p) => p.ronda === 1 && p.estado === "walkover");
    expect(walkovers).toHaveLength(1);
    expect(walkovers[0]!.ganadorId).toBe(1);

    const final = llave.find((p) => p.ronda === 2)!;
    expect(final.a).toBe(1);
    expect(final.b).toBeNull();
    expect(final.estado).toBe("pendiente");

    // Cuando se resuelve la semi, la final queda lista con los dos lados.
    const conSemi = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: 2, scoreA: 1, scoreB: 0 });
    const finalLista = conSemi.find((p) => p.ronda === 2)!;
    expect(finalLista.b).toBe(2);
    expect(finalLista.estado).toBe("listo");
  });

  it("explota con menos de 2 participantes", () => {
    expect(() => armarLlave([1], opciones)).toThrow();
  });
});

describe("cargarResultado", () => {
  it("propaga el ganador a la ronda siguiente", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    const final = llave.find((p) => p.ronda === 2)!;
    expect(final.a).toBe(1);
  });

  it("rechaza un ganador que no jugó ese partido", () => {
    const llave = armarLlave([1, 2, 3, 4], opciones);
    expect(() =>
      cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 3, scoreA: 1, scoreB: 0 }),
    ).toThrow(/tiene que ser uno de los dos/);
  });

  it("rechaza un BO3 que no llegó a 2 mapas", () => {
    // Cuadro de 4: los cruces son 1-4 (posición 0) y 2-3 (posición 1).
    let llave = armarLlave([1, 2, 3, 4], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: 2, scoreA: 1, scoreB: 0 });
    expect(() =>
      cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 }),
    ).toThrow(/BO3/);
  });

  it("rechaza un score que no corresponde al lado del ganador", () => {
    const llave = armarLlave([1, 2, 3, 4], opciones);
    // En la posición 0 el lado A es el 1 y el B es el 4: si gana el 4, el score tiene que ir en B.
    expect(() =>
      cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 4, scoreA: 1, scoreB: 0 }),
    ).toThrow(/BO1/);
  });

  it("acepta walkover sin exigir el score", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 0, scoreB: 0, walkover: true });
    const partido = llave.find((p) => p.ronda === 1 && p.posicion === 0)!;
    expect(partido.estado).toBe("walkover");
    expect(partido.ganadorId).toBe(1);
  });

  it("al corregir un resultado limpia lo que venía después", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: 2, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: 1, scoreA: 2, scoreB: 1 });
    expect(llaveTerminada(llave)).toBe(true);

    // Se cargó mal la semi: gana 4 en vez de 1.
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 4, scoreA: 0, scoreB: 1 });
    const final = llave.find((p) => p.ronda === 2)!;
    expect(final.a).toBe(4);
    expect(final.ganadorId).toBeNull();
    expect(final.scoreA).toBe(0);
    expect(llaveTerminada(llave)).toBe(false);
  });
});

describe("puestos", () => {
  it("reparte campeón, finalista y dos terceros", () => {
    let llave = armarLlave([1, 2, 3, 4], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: 2, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: 1, scoreA: 2, scoreB: 0 });

    const tabla = puestos(llave, [1, 2, 3, 4]);
    expect(tabla.find((p) => p.participanteId === 1)!.puesto).toBe(1);
    expect(tabla.find((p) => p.participanteId === 2)!.puesto).toBe(2);
    expect(tabla.filter((p) => p.puesto === 3).map((p) => p.participanteId).sort()).toEqual([3, 4]);
  });

  it("cuenta victorias del campeón en un cuadro de 8", () => {
    // Cruces del cuadro de 8: 1-8, 4-5, 2-7, 3-6.
    let llave = armarLlave([1, 2, 3, 4, 5, 6, 7, 8], opciones);
    llave = cargarResultado(llave, { ronda: 1, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 1, ganadorId: 5, scoreA: 0, scoreB: 1 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 2, ganadorId: 2, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 1, posicion: 3, ganadorId: 3, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 0, ganadorId: 1, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 2, posicion: 1, ganadorId: 2, scoreA: 1, scoreB: 0 });
    llave = cargarResultado(llave, { ronda: 3, posicion: 0, ganadorId: 1, scoreA: 2, scoreB: 1 });

    const tabla = puestos(llave, [1, 2, 3, 4, 5, 6, 7, 8]);
    const campeon = tabla.find((p) => p.participanteId === 1)!;
    expect(campeon.puesto).toBe(1);
    expect(campeon.victorias).toBe(3);
    expect(campeon.partidosJugados).toBe(3);
    expect(tabla.find((p) => p.participanteId === 2)!.puesto).toBe(2);
    expect(tabla.filter((p) => p.puesto === 3).map((p) => p.participanteId).sort()).toEqual([3, 5]);
  });
});

describe("mezclar", () => {
  it("no pierde ni duplica participantes", () => {
    const entrada = [1, 2, 3, 4, 5, 6, 7];
    let semilla = 0;
    const salida = mezclar(entrada, () => {
      semilla += 1;
      return (semilla * 0.31) % 1;
    });
    expect(salida.slice().sort((a, b) => a - b)).toEqual(entrada);
  });
});

describe("nombreDeRonda", () => {
  it("nombra las rondas desde el final", () => {
    expect(nombreDeRonda(3, 3)).toBe("Final");
    expect(nombreDeRonda(2, 3)).toBe("Semifinal");
    expect(nombreDeRonda(1, 3)).toBe("Cuartos");
    expect(nombreDeRonda(1, 5)).toBe("Ronda 1");
  });
});
