const supabase = require('../../config/supabase');
const textNormalizer = require('../../utils/textNormalizer');
const geminiService = require('./geminiService');

// Palabras de gastos no deducibles: bebidas alcoholicas y propinas
const alcoholKeywords = [
  'propina', 'propinas', 'tip', 'tips',
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
  'combustible', 'gasolina', 'diesel', 'gasoil', 'gnv', 'gas', 'lubricante', 'aceite de motor',
  // Abreviaturas de combustible en facturas de surtidor (G.ESPECIAL+, G.PREMIUM, D.OIL)
  'g especial', 'especial', 'g premium', 'premium', 'super', 'd oil', 'litros', 'lts',
];

// Pasa el texto a palabras separadas por espacios para comparar palabras completas
const toWordText = (text) => ` ${textNormalizer.normalizeText(String(text || '')).replace(/\s+/g, ' ')} `;

// Indica si el texto contiene la palabra o frase completa (no un pedazo de otra palabra)
const containsWord = (text, word) => toWordText(text).includes(toWordText(word));

// Verifica si el nombre del producto contiene alguna palabra clave de alcohol
const containsAlcoholKeyword = (productName) => {
  return alcoholKeywords.some((keyword) => containsWord(productName, keyword));
};

// Verifica si el nombre del producto es claramente inocuo
const isInnocuousProduct = (productName) => {
  return innocuousWords.some((keyword) => containsWord(productName, keyword));
};

// Analiza una lista de detalles de factura y determina si hay alcohol
const analyzeAlcohol = async (details) => {
  if (!details || details.length === 0) {
    return false;
  }
  for (const item of details) {
    if (containsAlcoholKeyword(item.nombre_producto)) {
      return true;
    }
  }
  const ambiguousProducts = details
    .map((item) => item.nombre_producto)
    .filter((productName) => !isInnocuousProduct(productName));
  if (ambiguousProducts.length === 0) {
    return false;
  }
  try {
    const productList = ambiguousProducts.join(', ');
    const prompt = `Analiza esta lista de productos de facturas bolivianas y responde SOLO con "true" si alguno es claramente una bebida alcohólica (cerveza, vino, licor, chicha, singani, aguardiente, cóctel, trago o cualquier bebida con alcohol) o una propina. Las abreviaturas de surtidor como "G.ESPECIAL+", "G.PREMIUM" o "D.OIL" son combustible, no alcohol. Si no es claramente alcohol ni propina, responde "false". Responde SOLO "true" o "false", sin explicación. Lista: ${productList}`;
    const response = (await geminiService.generateText(prompt, {taskName: 'deteccion de alcohol', maxAttempts: 2})).toLowerCase();
    return response === 'true';
  }
  catch (error) {
    console.warn('Deteccion de alcohol por IA no disponible, se usan palabras de riesgo:', error.message);
    const riskWords = ['trago', 'copa', 'bebida', 'brebaje', 'fermentado', 'destilado', 'macerado'];
    return details.some((item) => riskWords.some((word) => containsWord(item.nombre_producto, word)));
  }
};

// Analiza un texto libre (descripcion de gasto) y determina si menciona alcohol
const analyzeAlcoholText = async (text) => {
  if (!text || !text.trim()) {
    return false;
  }
  if (containsAlcoholKeyword(text)) {
    return true;
  }
  if (isInnocuousProduct(text)) {
    return false;
  }
  try {
    const prompt = `Analiza este texto de un gasto de viaje y responde SOLO con "true" si menciona claramente bebidas alcohólicas (cerveza, vino, licor, chicha, singani, aguardiente, cóctel, trago o cualquier bebida con alcohol) o una propina. Si no es claramente alcohol ni propina, responde "false". Responde SOLO "true" o "false", sin explicación. Texto: ${text}`;
    const response = (await geminiService.generateText(prompt, {taskName: 'deteccion de alcohol en texto', maxAttempts: 2})).toLowerCase();
    return response === 'true';
  }
  catch (error) {
    console.warn('Deteccion de alcohol en texto por IA no disponible, se usan palabras de riesgo:', error.message);
    const riskWords = ['trago', 'copa', 'bebida', 'brebaje', 'fermentado', 'destilado', 'macerado'];
    return riskWords.some((word) => containsWord(text, word));
  }
};

// Recalcula el indicador de alcohol del viaje a partir de sus gastos, sin consultar a la IA
const updateAlcoholInTrip = async (tripId) => {
  try {
    const {data: expenses} = await supabase
      .from('Gasto')
      .select('tiene_alcohol')
      .eq('id_viaje', tripId);
    const result = (expenses || []).some((expense) => expense.tiene_alcohol === true);
    await supabase.from('Viaje').update({tiene_alcohol: result}).eq('id_viaje', tripId);
    return result;
  }
  catch (error) {
    console.warn('Error en updateAlcoholInTrip:', error.message);
    return false;
  }
};

module.exports = {
  analyzeAlcohol,
  analyzeAlcoholText,
  updateAlcoholInTrip,
  containsAlcoholKeyword,
};