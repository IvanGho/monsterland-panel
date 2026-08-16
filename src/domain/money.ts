/**
 * Todo el dinero del panel se maneja en centavos enteros.
 * Nunca guardes pesos con decimales en la base: los float te van a mentir en la caja.
 */

export function pesosACentavos(valor: string | number): number {
  if (typeof valor === "number") return Math.round(valor * 100);
  const limpio = valor
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

export function formatoARS(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const entero = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const conPuntos = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$${conPuntos},${dec}`;
}

/** Convierte a USD sólo para mostrar. El tipo de cambio se configura a mano y se muestra con su fecha. */
export function aUSD(centavosARS: number, tipoCambio: number): string {
  if (!tipoCambio || tipoCambio <= 0) return "s/d";
  const usd = centavosARS / 100 / tipoCambio;
  return `US$${usd.toFixed(2)}`;
}
