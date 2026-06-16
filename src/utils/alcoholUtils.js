const Groq = require('groq-sdk')
const supabase = require('../config/supabase')
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const KEYWORDS_ALCOHOL = [
  'cerveza', 'cervezas', 'beer',
  'vino', 'vinos', 'wine',
  'whisky', 'whiskey', 'bourbon',
  'ron', 'rum',
  'vodka', 'tequila',
  'champagne', 'champaña',
  'licor', 'licores',
  'alcohol', 'alcoholico', 'alcoholica',
  'singani', 'aguardiente',
  'brandy', 'cognac',
  'gin', 'ginebra',
  'sake', 'sidra',
  'absenta', 'absinthe',
  'mezcal', 'pisco',
  'fernet', 'aperitivo',
  'trago', 'tragos',
  'copa', 'copas',
  'chicha', 'chichas',
  'chicha de jora',
  'chicha cochabambina',
  'chicha potosina',
  'chicha tarijena',
  'chicha tarijenia',
  'chicha de yuca',
  'chicha de quinua',
  'chicha de mani',
  'chicha morada',
  'chicheria',
  'huari', 'pacena', 'paceña',
  'potosina', 'ducal',
  'autentica', 'auténtica',
  'brahma', 'corona', 'heineken',
  'budweiser', 'stella artois',
  'miller', 'cusquena', 'cusqueña',
  'pilsener', 'cristal', 'club',
  'casa real', 'rujero',
  'grand tolay', 'los parrales',
  'kohlberg', 'bermejo',
  'concepcion', 'concepción',
  'campos de solana',
  'tarijena', 'tarijeña',
  'cepas de altura',
  'anisado', 'anisete',
  'caña', 'macerado',
  'punch', 'cocktail', 'coctel', 'cóctel',
  'shot',
  'bebida alcoholica', 'bebida alcohólica',
  'bebidas alcoholicas', 'bebidas alcohólicas',
]

const PALABRAS_INOCUAS = [
  'agua', 'jugo', 'refresco', 'gaseosa', 'cola', 'fanta', 'sprite',
  'cafe', 'café', 'te', 'té', 'leche', 'yogurt',
  'pan', 'arroz', 'pollo', 'carne', 'pescado', 'ensalada', 'sopa',
  'almuerzo', 'desayuno', 'cena', 'merienda',
  'taxi', 'transporte', 'pasaje', 'peaje',
  'hotel', 'hospedaje', 'alojamiento',
  'servicio', 'servicios',
  'papeleria', 'papelería', 'utiles', 'útiles',
  'medicamento', 'farmacia',
  'combustible', 'gasolina', 'diesel',
]

const normalizarTexto = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()

const contieneKeywordAlcohol = (nombreProducto) => {
  const normalizado = normalizarTexto(nombreProducto)
  return KEYWORDS_ALCOHOL.some((kw) => normalizado.includes(normalizarTexto(kw)))
}

const esProductoInocuo = (nombreProducto) => {
  const normalizado = normalizarTexto(nombreProducto)
  return PALABRAS_INOCUAS.some((kw) => normalizado.includes(normalizarTexto(kw)))
}

const analizarAlcohol = async (detalles) => {
  if (!detalles || detalles.length === 0) return false

  for (const d of detalles) {
    if (contieneKeywordAlcohol(d.nombre_producto)) return true
  }

  const productosAmbiguos = detalles
    .map((d) => d.nombre_producto)
    .filter((p) => !esProductoInocuo(p))

  if (productosAmbiguos.length === 0) return false

  try {
    const lista = productosAmbiguos.join(', ')
    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Analiza esta lista de productos y responde SOLO con "true" si alguno es una bebida alcohólica (incluyendo cualquier tipo de cerveza, vino, licor, chicha, singani, aguardiente, cóctel, trago, o cualquier bebida con contenido alcohólico de cualquier región o país). Responde SOLO "true" o "false", sin explicación. Lista: ${lista}`
      }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
    })
    const respuesta = completion.choices[0]?.message?.content?.trim().toLowerCase()
    return respuesta === 'true'
  } catch (e) {
    console.warn('Groq error al analizar alcohol:', e.message)
    const palabrasRiesgo = ['trago', 'copa', 'bebida', 'brebaje', 'fermentado', 'destilado', 'macerado']
    return detalles.some((d) =>
      palabrasRiesgo.some((p) => normalizarTexto(d.nombre_producto).includes(p))
    )
  }
}

const actualizarAlcoholEnViaje = async (id_viaje) => {
  try {
    const { data: gastos } = await supabase
      .from('Gasto')
      .select('id_gasto')
      .eq('id_viaje', id_viaje)

    if (!gastos || gastos.length === 0) {
      await supabase.from('Viaje').update({ tiene_alcohol: false }).eq('id_viaje', id_viaje)
      return false
    }

    const idsGastos = gastos.map((g) => g.id_gasto)

    const { data: facturas } = await supabase
      .from('Factura')
      .select('id_factura')
      .in('id_gasto', idsGastos)

    if (!facturas || facturas.length === 0) {
      await supabase.from('Viaje').update({ tiene_alcohol: false }).eq('id_viaje', id_viaje)
      return false
    }

    const idsFacturas = facturas.map((f) => f.id_factura)

    const { data: detalles } = await supabase
      .from('Detalle_Factura')
      .select('nombre_producto')
      .in('id_factura', idsFacturas)

    if (!detalles || detalles.length === 0) {
      await supabase.from('Viaje').update({ tiene_alcohol: false }).eq('id_viaje', id_viaje)
      return false
    }

    const resultado = await analizarAlcohol(detalles)
    await supabase.from('Viaje').update({ tiene_alcohol: resultado }).eq('id_viaje', id_viaje)
    return resultado
  } catch (e) {
    console.warn('Error actualizarAlcoholEnViaje:', e.message)
    return false
  }
}

module.exports = { analizarAlcohol, actualizarAlcoholEnViaje };