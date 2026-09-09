const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')
const {GoogleGenerativeAI} = require('@google/generative-ai')

const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const geminiModel = geminiClient.getGenerativeModel({model: 'gemini-3.6-flash'})

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
]

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
]

// Verifica si el nombre del producto contiene alguna palabra clave de alcohol
const containsAlcoholKeyword = (productName) => {
  const normalizedName = textNormalizer.normalizeText(productName)
  return alcoholKeywords.some((keyword) => normalizedName.includes(textNormalizer.normalizeText(keyword)))
}

// Verifica si el nombre del producto es claramente inocuo
const isInnocuousProduct = (productName) => {
  const normalizedName = textNormalizer.normalizeText(productName)
  return innocuousWords.some((keyword) => normalizedName.includes(textNormalizer.normalizeText(keyword)))
}

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
    const prompt = `Analiza esta lista de productos y responde SOLO con "true" si alguno es una bebida alcohólica (incluyendo cualquier tipo de cerveza, vino, licor, chicha, singani, aguardiente, cóctel, trago, o cualquier bebida con contenido alcohólico de cualquier región o país). Responde SOLO "true" o "false", sin explicación. Lista: ${productList}`
    const result = await geminiModel.generateContent(prompt)
    const response = result.response.text().trim().toLowerCase()
    return response === 'true'
  }
  catch (error) {
    console.warn('Gemini error checking alcohol:', error.message)
    const riskWords = ['trago', 'copa', 'bebida', 'brebaje', 'fermentado', 'destilado', 'macerado']
    return details.some((item) => riskWords.some((word) => textNormalizer.normalizeText(item.nombre_producto).includes(word)))
  }
}

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
}

// Lista de palabras inapropiadas que se bloquean sin necesidad de IA
const hardcodedBadWords = [
  'puta', 'mierda', 'coño', 'polla', 'gilipollas', 'imbécil', 'imbecil',
  'idiota', 'estúpido', 'estupido', 'pendejo', 'culero', 'chingada',
  'verga', 'maricón', 'maricon', 'cabrón', 'cabron', 'bastardo',
  'hijo de puta', 'hdp', 'conchetumare', 'weon', 'weón', 'huevon', 'huevón',
]

// Verifica si el texto contiene alguna palabra de la lista negra
const containsHardcodedBadWord = (text) => {
  const lower = text.toLowerCase()
  return hardcodedBadWords.some((word) => lower.includes(word))
}

// Usa Gemini para detectar si un texto contiene lenguaje inapropiado o agresivo
const detectWithGemini = async (text) => {
  const prompt = `Eres un moderador de contenido para un sistema corporativo de gestión de viáticos.
Tu tarea es determinar si el siguiente texto contiene lenguaje inapropiado, ofensivo, agresivo, vulgar o que no corresponde a un contexto profesional empresarial.

Texto a evaluar: "${text}"

Responde ÚNICAMENTE con un JSON sin texto adicional ni backticks:
{"inapropiado": true/false, "motivo": "explicación breve solo si es inapropiado, sino null"}`

  const result = await geminiModel.generateContent(prompt)
  const responseText = result.response.text().trim()
  const cleanJson = responseText.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleanJson)
  return parsed.inapropiado === true
}

// Valida si un texto es apropiado para usarse en observaciones del sistema
const validateText = async (text) => {
  if (!text || text.trim().length === 0) {
    return {valid: true}
  }
  if (containsHardcodedBadWord(text)) {
    return {valid: false, error: 'El comentario contiene palabras inapropiadas'}
  }
  try {
    const isInappropriate = await detectWithGemini(text)
    if (isInappropriate) {
      return {valid: false, error: 'El comentario contiene palabras inapropiadas'}
    }
    return {valid: true}
  }
  catch (error) {
    console.warn('Error en detección con Gemini:', error.message)
    return {valid: true}
  }
}

module.exports = {analyzeAlcohol, updateAlcoholInTrip, validateText};