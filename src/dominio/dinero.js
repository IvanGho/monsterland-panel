/**
 * Todo el dinero del panel se maneja en centavos enteros.
 * Nunca guardes pesos con decimales: los float te van a mentir en la caja.
 */

/** Acepta "1.500,50", "$1500", 1500 y devuelve centavos enteros. */
export function pesosACentavos(valor) {
  if (typeof valor === "number") return Math.round(valor * 100);
  const limpio = String(valor ?? "")
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  if (limpio === "") return 0;
  const numero = Number(limpio);
  if (!Number.isFinite(numero)) throw new Error(`Monto inválido: ${valor}`);
  return Math.round(numero * 100);
}

export function formatoARS(centavos) {
  const n = Number(centavos) || 0;
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const entero = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const conPuntos = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$${conPuntos},${dec}`;
}

/** Convierte a USD sólo para mostrar. El tipo de cambio se configura a mano. */
export function aUSD(centavosARS, tipoCambio) {
  if (!tipoCambio || tipoCambio <= 0) return "s/d";
  return `US$${(centavosARS / 100 / tipoCambio).toFixed(2)}`;
}
