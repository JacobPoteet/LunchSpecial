// Spanish: a draft, not yet reviewed by a native speaker.
//
// Until it is, `es` is `autoDetect: false` in shared/locale.ts: a Spanish
// browser still gets English, and Spanish is reached by the picker or
// `?locale=es`. The glossary the draft follows:
//
//   the Special      el Especial (Especial del día, Menú del día)
//   Leftovers        Sobras
//   Chef's Choice    Sugerencia del chef
//   Kids' Menu       Menú infantil
//   Nightcap         la última copa
//   coaster          posavasos
//   the check / tab  la cuenta
//   hon              cariño
//   Lunch Special, After Dark: English, as the logo and the marquee are.
//
// Neutral Spanish that reads on both sides of the Atlantic, tú throughout, in
// the counter's voice. A string kept identical to English is listed in
// MAY_MATCH_ENGLISH (catalog.test.ts).

import type { PlayerErrorCode } from "../../errors";
import type { OccasionId } from "../../occasions";
import type { Course, MatchLevel, Profile, Protein, Region, Spirit, Temperature } from "../../types";
import { list, plural } from "../format";
import type { Messages } from "../messages";

const guesses = (n: number) => plural("es", n, { one: `${n} intento`, other: `${n} intentos` });
const dishes = (n: number) => plural("es", n, { one: `${n} plato`, other: `${n} platos` });
const days = (n: number) => plural("es", n, { one: `${n} día`, other: `${n} días` });
const ingredients = (n: number) => plural("es", n, { one: `${n} ingrediente`, other: `${n} ingredientes` });
const close = (n: number) => plural("es", n, { one: `${n} parecido`, other: `${n} parecidos` });

const es: Messages = {
  and: (items: readonly string[]) => list("es", items),

  // ---- The board's closed vocabularies --------------------------------------

  regions: {
    "north-america": "Norteamérica",
    "latin-america": "Latinoamérica",
    europe: "Europa",
    "middle-east": "Oriente Medio",
    africa: "África",
    "south-asia": "Asia del Sur",
    "east-asia": "Asia Oriental",
    "southeast-asia": "Sudeste Asiático",
    oceania: "Oceanía",
  } satisfies Record<Region, string>,
  courses: {
    breakfast: "desayuno",
    appetizer: "entrada",
    entree: "principal",
    dessert: "postre",
    drink: "bebida",
  } satisfies Record<Course, string>,
  temperatures: { hot: "caliente", cold: "frío" } satisfies Record<Temperature, string>,
  proteins: {
    beef: "res",
    pork: "cerdo",
    poultry: "aves",
    seafood: "mariscos",
    lamb: "cordero",
    vegetarian: "vegetariano",
  } satisfies Record<Protein, string>,
  spirits: {
    gin: "ginebra",
    whiskey: "whisky",
    rum: "ron",
    tequila: "tequila",
    vodka: "vodka",
    brandy: "brandi",
    wine: "vino",
    beer: "cerveza",
    none: "ninguno",
    other: "otro",
  } satisfies Record<Spirit, string>,
  profiles: {
    sweet: "dulce",
    sour: "ácido",
    bitter: "amargo",
    strong: "fuerte",
    creamy: "cremoso",
  } satisfies Record<Profile, string>,
  close: "Cerrar",

  // ---- The board's pieces -----------------------------------------------------

  tiles: {
    country: "País",
    course: "Plato",
    served: "Servido",
    protein: "Proteína",
    spirit: "Licor",
    profile: "Perfil",
    noSpirit: "sin licor",
  },
  row: {
    askingKitchen: "preguntando en la cocina…",
    askingBar: "preguntando en la barra…",
    ingredients: (matched: number, of: number) => `${matched}/${of}\u00a0ingredientes`,
    close: (n: number) => `\u00a0· ${plural("es", n, { one: `${n}\u00a0parecido`, other: `${n}\u00a0parecidos` })}`,
    closeChip: (family: string) => `, parecido: algo del Especial es de la familia ${family}`,
  },
  story: {
    hideClues: "Ocultar las pistas",
    hideCoasters: "Ocultar los posavasos",
    allClues: (n: number) => `Las ${n} pistas`,
    allCoasters: (n: number) => `Los ${n} posavasos`,
  },
  punchCard: {
    last: "Último pedido",
    left: (n: number) => plural("es", n, { one: "Queda 1 intento", other: `Quedan ${n} intentos` }),
  },
  ticket: {
    clue: (n: number) => `¡Marchando! — pista n.º ${n}`,
    coaster: (n: number) => `Invita la casa — posavasos n.º ${n}`,
  },
  input: {
    placeholder: "Pide un plato…",
    label: "Adivina un plato",
    matches: (label: string) => `Resultados: ${label.toLowerCase()}`,
    empty: "No está en el menú: prueba con otro plato",
  },
  countdown: {
    label: "Próximo Especial",
    inline: "Próximo Especial en",
  },
  shareButton: {
    idle: "Compartir",
    working: "Emplatando…",
    channel: "¡Enviado al canal!",
    sent: "¡Compartido!",
    copiedDiscord: "Copiado: ¡pégalo en el chat!",
    copied: "¡Copiado!",
    failed: "Toca para reintentar",
  },
  byline: {
    createdBy: "Creado por",
    newTab: " (LinkedIn, se abre en una pestaña nueva)",
  },

  // ---- Notes, Leftovers, requests --------------------------------------------

  notice: {
    eyebrow: "Una nota de la cocina",
    count: (position: number, total: number) => `${position} de ${total}`,
    next: "Siguiente nota",
    done: "Continuar",
  },
  archive: {
    title: "Sobras",
    lede: "Vuelve a jugar cualquier Especial que te perdiste.",
    won: "resuelto",
    lost: "fallado",
    playing: "en curso",
    unplayed: "sin jugar",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    chefsChoice: "Sugerencia del chef",
    chefsChoiceNote: "Un plato al azar; no toca tu racha.",
    cookMe: "Cocíname algo",
    day: (day: number, puzzle: number) => `${day}, Especial n.º ${puzzle}`,
    today: " (hoy)",
    recovered: (n: number) => ` el mismo día en ${guesses(n)}`,
  },
  requests: {
    dish: {
      toggle: "Sugiere un plato para el menú",
      title: "Sugiere un plato para el menú",
      namePlaceholder: "Nombre del plato (obligatorio)",
      submit: "Enviar a la cocina",
      thanks: "¡Gracias, cariño! El cocinero ya tiene tu pedido.",
      stampTitle: "De la comanda de un cliente",
      stampBody: (name: string) => `Un cliente habitual pidió ${name}. El tuyo podría ser el próximo.`,
      served: (name: string, day: string) => `Buen gusto, cariño: ${name} fue el Especial del ${day}.`,
    },
    drink: {
      toggle: "Sugiere una bebida para la barra",
      title: "Sugiere una bebida para la barra",
      namePlaceholder: "Nombre de la bebida (obligatorio)",
      submit: "Enviar a la barra",
      thanks: "¡Gracias! El barman ya tiene tu pedido.",
      stampTitle: "De la cuenta de un cliente habitual",
      stampBody: (name: string) => `Alguien en la barra pidió ${name}. La tuya podría ser la próxima.`,
      served: (name: string, day: string) => `Buen gusto: ${name} se sirvió el ${day}.`,
    },
    orderFromLeftovers: "Pídelo en Sobras",
    countryPlaceholder: "País de origen (opcional)",
    notePlaceholder: "¿Algo más? (opcional)",
    error: "No se pudo enviar. Inténtalo de nuevo.",
    sending: "Enviando…",
    cancel: "Mejor no",
  },

  // ---- What a screen reader hears ---------------------------------------------

  announce: {
    match: { hit: "coincide", near: "cerca", miss: "no coincide" } satisfies Record<MatchLevel, string>,
    dishTiles: { country: "país", course: "plato", temperature: "servido", protein: "proteína" },
    drinkTiles: { country: "país", spirit: "licor base", temperature: "servido", profile: "perfil" },
    tile: (label: string, verdict: string) => `${label} ${verdict}`,
    region: (region: string) => ` (${region})`,
    head: (guess: number, max: number, name: string) => `Intento ${guess} de ${max}: ${name}.`,
    ingredients: (matched: number, of: number) =>
      plural("es", matched, {
        one: `Coincide ${matched} de ${of} ingredientes`,
        other: `Coinciden ${matched} de ${of} ingredientes`,
      }),
    close: (n: number) => `, ${close(n)}`,
    left: (n: number) =>
      n === 0 ? "No quedan intentos." : plural("es", n, { one: "Queda 1 intento.", other: `Quedan ${n} intentos.` }),
    solved: (name: string, n: number) => `${name} es el Especial. Resuelto en ${guesses(n)}.`,
    solvedNightcap: (name: string, n: number) => `${name} es la última copa de esta noche. Resuelto en ${guesses(n)}.`,
    clue: (index: number, text: string) => `Pista ${index}: ${text}`,
    coaster: (index: number, text: string) => `Posavasos ${index}: ${text}`,
    kidsMenuAll: (n: number) => `Menú infantil: ${dishes(n)} todavía en el menú.`,
    kidsMenu: (n: number, narrowed: string) => `Menú infantil: ${dishes(n)}, ${narrowed}.`,
    circled: (name: string) => `${name}, marcado con un círculo. Pídelo al pie del menú.`,
  },

  // ---- Share text, score card, Discord ---------------------------------------
  // Never the dish or the drink, in any language. The tests run every catalog.

  share: {
    lunchTitle: (puzzle: number, score: string) => `Lunch Special #${puzzle} — ${score}`,
    nightTitle: (night: number, score: string) => `After Dark · Noche #${night} — ${score}`,
    nightTitleUnnumbered: (score: string) => `After Dark — ${score}`,
  },
  scorecard: {
    lunchSubtitle: (puzzle: number, score: string) => `N.º ${puzzle} · ${score}`,
    nightSubtitle: (night: number, score: string) => `Noche ${night} · ${score}`,
    progress: (live: boolean, what: string) => `${live ? "está jugando a" : "jugó a"} ${what}`,
    lunchNumber: (puzzle: number) => `N.º ${puzzle}`,
    /** The score card's pill is 78px wide at 14px: seven capitals is the most it holds. */
    winDay: "¡LISTO!",
    winNight: "SERVIDO",
    nightNumber: (night: number) => `Noche ${night}`,
    playNow: "¡Juega ya!",
  },
  presence: {
    modes: {
      daily: "El Especial de hoy",
      leftover: "Sobras",
      random: "Sugerencia del chef",
      nightcap: "After Dark",
    },
    numbered: (mode: string, puzzle: number) => `${mode} · N.º ${puzzle}`,
    won: (n: number) => `Lo resolvió en ${guesses(n)}`,
    lost: "Sin intentos",
    reading: "Leyendo el menú",
    on: (guess: number, max: number) => `Intento ${guess} de ${max}`,
  },

  // ---- The check and the board's small print ---------------------------------

  streak: {
    mark: (n: number) => `Racha de ${days(n)}`,
    lost: "El Especial de mañana empieza una racha nueva.",
    keep: (n: number) => `Vuelve mañana para mantener tu racha de ${days(n)}.`,
    start: "Vuelve mañana para empezar una racha.",
  },
  tally: {
    room: (pct: number) => `El ${pct}\u00a0% de los comensales acertó el Especial de hoy`,
    mostIn: (n: number) => `la mayoría en ${n}`,
  },
  stuck: "Nada cerca todavía. Lee la pista.",
  kidsMenu: {
    blurb: (n: number) =>
      plural("es", n, {
        one: "Solo 1 plato puede ser todavía la respuesta.",
        other: `${n} platos pueden ser todavía la respuesta.`,
      }),
    name: "Menú infantil",
    coach: "**¿Te atascaste?** Abre el Menú infantil para ver todos los platos que todavía pueden ser la respuesta.",
    dismissCoach: "Cerrar el consejo del Menú infantil",
    ordered: "pedido",
    circled: "Marcado:",
    tapToCircle: "Toca un plato para marcarlo con un círculo.",
    order: "Pedirlo",
    fine: "Para comensales de 12 años o menos. No lo vamos a comprobar.",
    error: "La cocina perdió los crayones. Cierra esto y vuelve a intentarlo.",
    loading: "Buscando los crayones…",
    confirmed: "Confirmado",
    courses: {
      breakfast: "Desayunos",
      appetizer: "Entradas",
      entree: "Platos principales",
      dessert: "Postres",
      drink: "Bebidas",
    } satisfies Record<Course, string>,
  },
  coach: {
    legendHit: "acierto",
    legendNear: "cerca",
    legendMiss: "fallo",
    order: "**Adivina el plato misterioso de hoy.** Escribe cualquier plato para empezar.",
    pick: "**Elige tu plato de la lista.**",
    read: "**Verde es correcto, amarillo es cerca.** Cada fallo también te da una pista.",
    skip: "Saltar el recorrido",
  },

  // ---- Occasions --------------------------------------------------------------

  occasions: {
    halloween: {
      name: "Halloween",
      shareLine: "🎃 Turno de ultratumba en Lunch Special",
      knock: "Toca en la campana",
      boo: "¡Bu!",
      copy: {
        sub: "Abierto en el turno de ultratumba",
        thanks: "La mejor comida del pueblo, si te atreves",
        fine: "Sin cambios en el Especial · Pregunta por nuestro pastel de calabaza",
        barSub: "Una bebida. Cuatro intentos. Se acaba a la hora de las brujas.",
      },
    },
  } satisfies Record<OccasionId, { name: string; shareLine: string; knock: string; boo: string; copy: Record<string, string> }>,

  // ---- Screens ------------------------------------------------------------------

  sound: {
    mute: "Silenciar el sonido",
    unmute: "Activar el sonido",
  },
  menuCard: {
    thanks: "¡La mejor comida del pueblo!",
    fine: "Sin cambios en el Especial · Pregunta por nuestro pastel",
    howToPlay: "Cómo se juega",
  },
  footer: {
    privacy: "Privacidad",
    terms: "Términos",
    press: "Prensa",
  },
  language: {
    button: (name: string) => `Idioma: ${name}`,
    list: "Idioma",
  },
  errors: {
    offline: "No se pudo contactar con la cocina: revisa tu conexión o tu bloqueador de anuncios.",
    failed: "La cocina lo devolvió.",
    bad_request: "La cocina no entendió ese pedido.",
    bad_date: "No hay Especial para esa fecha.",
    bad_link: "Ese enlace ha caducado o no es válido.",
    not_found: "Ese plato ya no está en el menú.",
    no_dish: "La cocina no tiene nada que servir ahora mismo.",
    unknown_dish: "Ese plato no está en el menú.",
    unknown_drink: "Esa bebida no está en la barra.",
    bar_closed: "La barra está cerrada.",
    nothing_on_tap: "Esta noche no hay nada que servir.",
  } satisfies Record<PlayerErrorCode, string>,
  closed: {
    sign: "Lo sentimos: estamos cerrados",
    body: "La cocina no contesta. Revisa tu conexión y vuelve a intentarlo.",
    retry: "Tocar el timbre otra vez",
  },

  // ---- The diner ------------------------------------------------------------------

  winToasts: ["¡De chuparse los dedos!", "¡Marchando!", "¡La clavaste, cariño!", "¡Buen trabajo!", "¡Justo a tiempo!", "¡Uf, por los pelos!"],
  howTo: {
    goal: (tries: number) =>
      `Adivina el **Especial**, un plato misterioso de algún lugar del mundo. Tienes ${guesses(tries)}.`,
    feedback:
      "Cada intento muestra qué ingredientes acertaste y qué tan cerca están su país, su tipo de plato, su temperatura y su proteína:",
    legendHit: "✓ correcto (verde)",
    legendNear: "~ cerca (amarillo)",
    legendMiss: "× incorrecto (gris)",
    yellow:
      "Un país amarillo está en la misma región. Un ingrediente amarillo (≈) es un cambio parecido, como limón por lima.",
    clues:
      "Cada fallo te da una **pista**. ¿Te atascaste tras cuatro fallos? El **Menú infantil** muestra todos los platos que todavía pueden ser la respuesta.",
    leftovers: "Termina el Especial de hoy para desbloquear las **Sobras**: todos los Especiales anteriores.",
  },
  stats: {
    title: "Mis números",
    played: "Jugadas",
    winRate: "Aciertos",
    streak: "Racha",
    best: "Mejor",
    empty: "Todavía no hay pedidos.",
  },
  board: {
    sub: "El juego diario de adivinar platos",
    previewAdmin: "Prueba de admin: nada se guarda, se cuenta ni se muestra a los jugadores",
    playtest: (slug: string) => `Prueba: fijado en “${slug}”, no se guarda nada`,
    showcase: "Vista previa: este Especial ya está resuelto para que eches un vistazo. No se guarda nada.",
    newDay: "Hay un Especial nuevo",
    serveIt: "Sírvelo",
    archive: "Del archivo",
    backToToday: "Volver a hoy",
    random: "Receta al azar: no se guarda nada",
    newRandom: "Otro plato al azar",
    company: (n: number) =>
      plural("es", n, { one: "Hay 1 persona más en la barra", other: `Hay ${n} personas más en la barra` }),
    titleArchive: "Del archivo",
    titleToday: "Menú del día",
    specialNo: (n: number) => `Especial n.º ${n} — `,
    leftovers: "Sobras",
    yourCheck: "Tu cuenta",
    specialRandom: "Sugerencia del chef",
    specialDaily: "Especial del día",
    onTheHouse: "invita la casa",
    hint: (n: number) => `Un plato misterioso con **${ingredients(n)}**. ¿Qué va a ser?`,
    loading: "Encendiendo la plancha…",
    guessFailed: "La cocina no oyó ese pedido. Revisa tu conexión y vuelve a intentarlo.",
  },
  barBand: {
    soon: "After Dark abre a las 8 de la noche, tu hora.",
    open: "La barra está abierta",
    openSub: "Una bebida, cuatro intentos, se acaba al amanecer",
    settled: "Tu cuenta te espera en la barra",
    settledSub: "Vuelve y échale otro vistazo",
  },
  check: {
    number: "N.º",
    date: "Fecha",
    orders: "Pedidos",
    ordersOf: (n: number, max: number) => `${n} de ${max}`,
    menu: "Menú",
    menuRandom: "Sugerencia del chef",
    menuDaily: "Especial del día",
    menuLeftover: "Sobras",
    won: "¡Invita la casa!",
    lostDaily: "Mejor suerte mañana",
    lostOther: "Mejor suerte la próxima",
    served: (temperature: string) => `se sirve ${temperature}`,
    playAgain: "Jugar otra vez",
    invite: "Invita a la mesa",
  },

  // ---- After Dark ---------------------------------------------------------------------

  pourToasts: ["Suavecito.", "Buena elección.", "Ahí está.", "Último trago, cariño."],
  bar: {
    sub: "Una bebida. Cuatro intentos. Se acaba al amanecer.",
    closedSign: "La barra está cerrada",
    closedBody: "Abierta de 8 de la noche a 3 de la madrugada, tu hora. Una bebida por noche, cuatro intentos.",
    opensIn: "Abre en",
    backToDiner: "Volver a la cafetería",
    doorSign: "Primero la cocina",
    doorBody: "Termina el Especial de hoy para abrir la barra.",
    doorBack: "Llévame al Especial de hoy",
    intro: "**El mismo juego, dos casillas nuevas.** Licor y Perfil sustituyen a Plato y Proteína.",
    nights: "Noches",
    previewShowcase:
      "Enlace de vista previa: la barra suele abrir de 8 de la noche a 3 de la madrugada. Aquí no se guarda nada.",
    previewAdmin: "Prueba de admin en la barra: nada se guarda, se cuenta ni se muestra a los jugadores",
    playtestRandom: "Prueba: una bebida al azar, no se guarda nada",
    title: "Libaciones",
    nightNo: (n: number) => `Noche n.º ${n} — `,
    yourTab: "Tu cuenta",
    lastCall: "Última ronda en",
    nothingOnTap: "Nada que servir",
    special: "La última copa de esta noche",
    hint: (n: number) => `Una bebida misteriosa con **${ingredients(n)}**. ¿Qué va a ser?`,
    loading: "Limpiando la barra…",
    placeholder: "Pide una bebida…",
    inputLabel: "Adivina una bebida",
    guessFailed: "La barra no oyó ese pedido. Revisa tu conexión y vuelve a intentarlo.",
    thanks: "Última ronda a las tres",
    fine: (coasters: number) => `Una bebida por noche · ${coasters} posavasos · Bebe con moderación`,
    shareIdle: "Compartir la noche",
    tabTitle: "After Dark: tu cuenta",
    won: "Esta invita la casa",
    lost: "Mejor suerte mañana por la noche",
    noSpirit: "sin licor base",
    alcoholFree: "sin alcohol",
  },
};

export default es;
