---
name: reglas-kripta
description: Audita cualquier cambio de Monsterland contra las reglas duras del proyecto antes de escribir o mergear código. Usala cuando el trabajo toque premios, inscripciones, la moneda interna, mayoría de edad, apuestas, patrocinios, caja, torneos o el beneficio del moderador; o cuando haya que revisar un PR de este repo.
license: Uso interno de Monsterland
---

# Auditoría de reglas duras — Monsterland / Kripta

Antes de escribir código o aprobar un PR que toque plata, edad, moneda interna o torneos,
pasá el cambio por esta lista. Si algo falla, el cambio está mal **aunque el código funcione
y los tests pasen**.

## 1. Premio desacoplado de la inscripción

- [ ] El premio se define al crear el torneo y se anuncia **antes** de abrir la inscripción.
- [ ] El premio es el mismo con 4 participantes que con 16. No hay ninguna fórmula
      que lo calcule a partir de la cantidad de inscriptos o de lo recaudado.
- [ ] Si el premio coincide exactamente con lo recaudado en inscripciones, el sistema alerta.
- [ ] En ningún texto visible aparece "pozo", "apuesta", "banca" o "casa".
      Se dice inscripción, premio, concurso de habilidad.

**Por qué:** un premio que se forma con las inscripciones se lee como pozo mutuo. ALEA intimó a
Mercado Libre en junio de 2026 por esa estructura, encuadrándola en el art. 301 bis del Código Penal.

## 2. Mayoría de edad donde hay dinero

- [ ] Si el torneo tiene inscripción > 0 o premio > 0, sólo se puede inscribir a jugadores
      con 18+ confirmado, y la validación está en el dominio, no sólo en la interfaz.
- [ ] La Pista Libre (inscripción 0 y premio 0) sigue abierta a todos.
- [ ] Ningún camino de la interfaz permite saltear la validación.

## 3. La moneda interna es lealtad, no moneda

- [ ] No existe forma de **comprarla** con dinero. Ni packs, ni recargas, ni promociones.
- [ ] No existe forma de **transferirla entre usuarios**. Sin mercado interno, sin regalos,
      sin comercio. Esta es la regla que más se intenta romper "porque un usuario lo pidió".
- [ ] Se gana jugando: participación, victorias, check-in, rachas, referidos que se quedan.
- [ ] Se gasta en un catálogo cerrado que define la organización.
- [ ] Los canjes con costo real (Nitro, gift cards) tienen tope mensual y quedan registrados
      como egreso en la caja.

**Por qué:** comprable o transferible, la moneda adquiere precio de mercado y el circuito
comprar → jugar → vender es exactamente lo que convierte un juego de habilidad en casa de apuestas.

## 4. Sponsors y contenido

- [ ] Ningún sponsor, afiliado, banner ni link de casas de apuestas o juego online.
- [ ] Nada que prometa "ganá plata jugando".

## 5. Sustentabilidad

- [ ] Premios y recompensas juntos no pasan el 70% de los ingresos del período.
- [ ] El beneficio del moderador se calcula sobre el **saldo** (ingresos − egresos), no sobre
      los ingresos, y da 0 si el período cierra en rojo o en cero.
- [ ] Todo ingreso o egreso nuevo entra a la caja automáticamente o queda documentado
      cómo se registra a mano.

## 6. Verificación antes de decir que está listo

```
correr los tests            -> todos en verde, ninguno borrado ni relajado para que pase
correr el smoke test        -> contra el server levantado de verdad
probarlo a mano             -> el flujo completo, no sólo que el proceso arranque
```

- [ ] Si un cambio rompe un test existente, se arregla el cambio, no el test.
- [ ] Los datos de prueba nunca se cargan sobre la base real.
- [ ] Nada de secretos en el repo: claves, `.env` y base de datos quedan fuera del control de versiones.

## Cómo reportar el resultado

Listá sólo lo que falla, con el archivo y la línea, y qué regla incumple.
Si todo pasa, decilo en una línea y seguí. No hace falta pegar la lista completa cada vez.
