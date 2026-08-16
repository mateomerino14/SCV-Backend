const Groq = require('groq-sdk')
const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')
const groqClient = new Groq({apiKey: process.env.GROQ_API_KEY})

const alcoholKeywords = [
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
];

const innocuousWords = [
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
];

// Verifica si el nombre del producto contiene alguna palabra clave de alcohol
const containsAlcoholKeyword = (productName) => {
  const normalizedName = textNormalizer.normalizeText(productName)
  return alcoholKeywords.some((keyword) => normalizedName.includes(textNormalizer.normalizeText(keyword)))
};

// Verifica si el nombre del producto es claramente inocuo
const isInnocuousProduct = (productName) => {
  const normalizedName = textNormalizer.normalizeText(productName)
  return innocuousWords.some((keyword) => normalizedName.includes(textNormalizer.normalizeText(keyword)))
};

// Analiza una lista de detalles de factura y determina si hay alcohol
const analyzeAlcohol = async (details) => {
  if (!details || details.length === 0) {
    return false
  }
  for (const item of details) {
    if (containsAlcoholKeyword(item.nombre_producto)) {
      return true
    }
  }
  const ambiguousProducts = details
    .map((item) => item.nombre_producto)
    .filter((productName) => !isInnocuousProduct(productName))
  if (ambiguousProducts.length === 0) {
    return false
  }
  try {
    const productList = ambiguousProducts.join(', ')
    const completion = await groqClient.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Analiza esta lista de productos y responde SOLO con "true" si alguno es una bebida alcohólica (incluyendo cualquier tipo de cerveza, vino, licor, chicha, singani, aguardiente, cóctel, trago, o cualquier bebida con contenido alcohólico de cualquier región o país). Responde SOLO "true" o "false", sin explicación. Lista: ${productList}`
      }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
    })
    const response = completion.choices[0]?.message?.content?.trim().toLowerCase()
    return response === 'true'
  }
  catch (error) {
    console.warn('Groq error checking alcohol:', error.message)
    const riskWords = ['trago', 'copa', 'bebida', 'brebaje', 'fermentado', 'destilado', 'macerado']
    return details.some((item) => riskWords.some((word) => textNormalizer.normalizeText(item.nombre_producto).includes(word)))
  }
};

// Recalcula y actualiza el indicador de alcohol de un viaje
const updateAlcoholInTrip = async (tripId) => {
  try {
    const {data: expenses} = await supabase
      .from('Gasto')
      .select('id_gasto')
      .eq('id_viaje', tripId)
    if (!expenses || expenses.length === 0) {
      await supabase.from('Viaje').update({tiene_alcohol: false}).eq('id_viaje', tripId)
      return false
    }
    const expenseIds = expenses.map((expense) => expense.id_gasto)
    const {data: invoices} = await supabase
      .from('Factura')
      .select('id_factura')
      .in('id_gasto', expenseIds)
    if (!invoices || invoices.length === 0) {
      await supabase.from('Viaje').update({tiene_alcohol: false}).eq('id_viaje', tripId)
      return false
    }
    const invoiceIds = invoices.map((invoice) => invoice.id_factura)
    const {data: details} = await supabase
      .from('Detalle_Factura')
      .select('nombre_producto')
      .in('id_factura', invoiceIds)
    if (!details || details.length === 0) {
      await supabase.from('Viaje').update({tiene_alcohol: false}).eq('id_viaje', tripId)
      return false
    }
    const result = await analyzeAlcohol(details)
    await supabase.from('Viaje').update({tiene_alcohol: result}).eq('id_viaje', tripId)
    return result
  }
  catch (error) {
    console.warn('Error en updateAlcoholInTrip:', error.message)
    return false
  }
};

module.exports = {analyzeAlcohol, updateAlcoholInTrip};