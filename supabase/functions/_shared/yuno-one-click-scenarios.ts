// Cross-merchant scenarios per country — Bloque C, slide 14 del deck Yuno One-Click.
// Templated user-stories que muestran cómo un shopper de la red Yuno reutiliza sus
// tarjetas guardadas entre merchants en SU país, sin re-ingresar datos.
//
// Source merchants: customer_proof_library Yuno (memoria) — solo los 12 verificados
// con presencia pública: Rappi, inDrive, Uber, McDonald's, Avianca, Viva Aerobus,
// Xcaret, Livelo, Reserva, Open English, Smartfit, SpaceX.
//
// Estructura: 3 escenarios por país (carrusel en la slide). Cada escenario:
//   - shopper_persona: arquetipo corto del usuario
//   - origin_merchant: donde enrolla la tarjeta
//   - destination_merchant: donde la reutiliza
//   - vignette: línea narrativa de 1-2 frases (español, sin nombrar competencia)
//
// Si el país del merchant input no está mapeado, se usa GENERIC_SCENARIOS
// (vignettes sin nombrar merchants específicos) — fallback seguro.

export interface CrossMerchantScenario {
  shopper_persona: string
  origin_merchant: string
  destination_merchant: string
  vignette: string
}

export const SCENARIOS_BY_COUNTRY: Record<string, CrossMerchantScenario[]> = {
  MX: [
    {
      shopper_persona: 'María, 32, CDMX',
      origin_merchant: 'Rappi',
      destination_merchant: "McDonald's",
      vignette: "María pide cena por Rappi un viernes. Tres días después abre McDonald's a mediodía — su tarjeta ya está lista, pago en un tap.",
    },
    {
      shopper_persona: 'Juan, 28, Monterrey',
      origin_merchant: 'Coppel',
      destination_merchant: 'Viva Aerobus',
      vignette: 'Juan compra una pantalla en Coppel. La semana siguiente reserva vuelo en Viva Aerobus — sin volver a teclear 16 dígitos.',
    },
    {
      shopper_persona: 'Sofía, 25, Guadalajara',
      origin_merchant: 'Uber',
      destination_merchant: 'Xcaret',
      vignette: 'Sofía paga su Uber al aeropuerto. Al llegar a la Riviera Maya, compra su acceso a Xcaret — misma tarjeta, mismo tap.',
    },
  ],
  BR: [
    {
      shopper_persona: 'Ana, 30, São Paulo',
      origin_merchant: 'Reserva',
      destination_merchant: 'Smartfit',
      vignette: 'Ana compra moda en Reserva en el feriado. La semana siguiente renueva su mensualidad en Smartfit — un solo tap.',
    },
    {
      shopper_persona: 'Pedro, 35, Rio de Janeiro',
      origin_merchant: 'Livelo',
      destination_merchant: 'Rappi',
      vignette: 'Pedro redime puntos en Livelo el domingo. El lunes pide almuerzo en Rappi — tarjeta reconocida, sin friction.',
    },
    {
      shopper_persona: 'Camila, 27, Belo Horizonte',
      origin_merchant: 'Uber',
      destination_merchant: 'Reserva',
      vignette: 'Camila paga su Uber al shopping. Adentro, compra ropa en Reserva por el e-commerce — misma cuenta, mismo tap.',
    },
  ],
  CO: [
    {
      shopper_persona: 'Carlos, 33, Bogotá',
      origin_merchant: 'Rappi',
      destination_merchant: 'Avianca',
      vignette: 'Carlos pide mercado por Rappi. Días después reserva vuelo Bogotá–Cartagena en Avianca — tarjeta lista, un tap.',
    },
    {
      shopper_persona: 'Daniela, 29, Medellín',
      origin_merchant: 'Avianca',
      destination_merchant: 'Uber',
      vignette: 'Daniela compra su vuelo en Avianca. Al aterrizar, pide Uber al hotel — mismo método de pago, cero fricción.',
    },
    {
      shopper_persona: 'Andrés, 31, Cali',
      origin_merchant: 'Uber',
      destination_merchant: "McDonald's",
      vignette: 'Andrés paga su Uber del fin de semana. El lunes pide breakfast en McDonald’s app — un solo tap, sin volver a registrar tarjeta.',
    },
  ],
  CL: [
    {
      shopper_persona: 'Valentina, 28, Santiago',
      origin_merchant: 'Rappi',
      destination_merchant: 'Smartfit',
      vignette: 'Valentina pide delivery por Rappi un sábado. El lunes paga su mensualidad de Smartfit — misma tarjeta, mismo tap.',
    },
    {
      shopper_persona: 'Matías, 34, Viña del Mar',
      origin_merchant: 'Avianca',
      destination_merchant: 'Uber',
      vignette: 'Matías compra vuelo Santiago–Lima en Avianca. Al volver, pide Uber del aeropuerto — sin volver a teclear datos.',
    },
    {
      shopper_persona: 'Catalina, 26, Concepción',
      origin_merchant: 'Uber',
      destination_merchant: 'Open English',
      vignette: 'Catalina paga sus viajes en Uber durante la semana. El sábado se inscribe en Open English — un solo tap.',
    },
  ],
  AR: [
    {
      shopper_persona: 'Lucía, 30, Buenos Aires',
      origin_merchant: 'Rappi',
      destination_merchant: 'Uber',
      vignette: 'Lucía pide cena por Rappi en Palermo. Después llama Uber para volver — la tarjeta ya está reconocida.',
    },
    {
      shopper_persona: 'Tomás, 29, Córdoba',
      origin_merchant: 'Uber',
      destination_merchant: 'Open English',
      vignette: 'Tomás paga sus Ubers semanales. Al final del mes decide inscribirse en Open English — pago en un tap.',
    },
    {
      shopper_persona: 'Florencia, 33, Rosario',
      origin_merchant: 'Open English',
      destination_merchant: 'Rappi',
      vignette: 'Florencia paga su mensualidad de Open English. Esa misma noche pide delivery en Rappi — misma tarjeta, mismo flow.',
    },
  ],
  PE: [
    {
      shopper_persona: 'Diego, 31, Lima',
      origin_merchant: 'Rappi',
      destination_merchant: 'Avianca',
      vignette: 'Diego pide almuerzo por Rappi en Miraflores. La semana siguiente compra vuelo Lima–Cusco en Avianca — un solo tap.',
    },
    {
      shopper_persona: 'Paula, 27, Arequipa',
      origin_merchant: 'Avianca',
      destination_merchant: 'Uber',
      vignette: 'Paula vuela a Lima por Avianca. Al aterrizar pide Uber al centro — sin volver a registrar tarjeta.',
    },
    {
      shopper_persona: 'Renato, 34, Trujillo',
      origin_merchant: 'Uber',
      destination_merchant: "McDonald's",
      vignette: 'Renato paga sus Ubers de la semana. El viernes pide McDonald’s por la app — la tarjeta ya está lista.',
    },
  ],
  EC: [
    {
      shopper_persona: 'Camila, 29, Quito',
      origin_merchant: 'Uber',
      destination_merchant: 'Avianca',
      vignette: 'Camila paga su Uber al trabajo. Cuando reserva vuelo a Guayaquil en Avianca, la tarjeta ya está reconocida.',
    },
    {
      shopper_persona: 'Felipe, 32, Guayaquil',
      origin_merchant: 'Avianca',
      destination_merchant: 'Open English',
      vignette: 'Felipe vuela a Quito por Avianca. Al volver decide retomar Open English — pago en un solo tap.',
    },
    {
      shopper_persona: 'Lorena, 28, Cuenca',
      origin_merchant: 'Open English',
      destination_merchant: 'Uber',
      vignette: 'Lorena paga su mensualidad de Open English. Esa noche llama Uber al centro — misma tarjeta, sin friction.',
    },
  ],
}

// Fallback genérico — vignettes sin nombrar merchants específicos.
// Se usa cuando el país del merchant input no está mapeado arriba.
export const GENERIC_SCENARIOS: CrossMerchantScenario[] = [
  {
    shopper_persona: 'Returning shopper',
    origin_merchant: 'cualquier merchant Yuno',
    destination_merchant: 'cualquier otro merchant Yuno',
    vignette: 'Cliente compra en un merchant de la red Yuno. Días después entra a otro — su tarjeta ya está lista, sin re-ingresar datos.',
  },
  {
    shopper_persona: 'Cross-vertical shopper',
    origin_merchant: 'travel',
    destination_merchant: 'food delivery',
    vignette: 'Reserva vuelo en una aerolínea de la red. Al aterrizar, pide delivery con la misma tarjeta — un solo tap.',
  },
  {
    shopper_persona: 'Subscription shopper',
    origin_merchant: 'streaming',
    destination_merchant: 'fitness',
    vignette: 'Renueva su suscripción de streaming. Más tarde se inscribe en un servicio fitness — sin volver a teclear 16 dígitos.',
  },
]

export function lookupScenarios(countryIso: string | null | undefined): CrossMerchantScenario[] {
  if (!countryIso) return GENERIC_SCENARIOS
  return SCENARIOS_BY_COUNTRY[countryIso.toUpperCase()] ?? GENERIC_SCENARIOS
}
