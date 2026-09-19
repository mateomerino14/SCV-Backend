const {GoogleGenerativeAI} = require('@google/generative-ai')

const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const geminiModel = geminiClient.getGenerativeModel({model: 'gemini-3.6-flash'})
// Modelo de respaldo, de menor carga, usado si el principal falla todos sus reintentos
const geminiFallbackModel = geminiClient.getGenerativeModel({model: 'gemini-3.5-flash-lite'})

const maxAttempts = 3

// Construye la instruccion enviada al modelo para interpretar el comprobante
const buildPrompt = () => {
  return `Analiza esta imagen de una factura o recibo boliviano y devuelve SOLO un JSON sin texto adicional ni backticks con esta estructura exacta:
{
  "proveedor": "nombre del proveedor o empresa emisora",
  "numero_factura": "número de factura",
  "nit": "NIT o CI del proveedor (solo números, máximo 10 dígitos)",
  "fecha_emision": "fecha en formato YYYY-MM-DD",
  "iva": monto_numerico_del_impuesto_en_dinero_NO_el_porcentaje,
  "monto": monto_numerico_sin_impuestos,
  "monto_total": monto_numerico_total_con_impuestos,
  "tipo_doc": "F si tiene IVA o impuesto, R si es recibo sin impuesto",
  "detalle": [
    { "nombre_producto": "descripcion del producto o servicio", "cantidad": numero, "precio": numero_decimal }
  ]
}

IMPORTANTE:
- El campo iva debe ser el MONTO EN DINERO del impuesto, no el porcentaje
- En facturas bolivianas "Importe" generalmente es el monto total con IVA incluido — úsalo como monto_total
- El IVA boliviano es del 13% sobre el subtotal — si no aparece explícito, calcúlalo como monto_total / 1.13 * 0.13
- Si no encuentras algún dato, usa null para números y "No Especificado" para textos
- La fecha debe estar en formato YYYY-MM-DD obligatoriamente
- Devuelve SOLO el JSON, sin explicaciones ni texto adicional`
}

// Verifica si la fecha extraida tiene un formato valido y real
const isValidEmissionDate = (value) => {
  if (!value || value === 'No Especificado') {
    return false
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// Normaliza la respuesta del modelo al formato que espera el sistema
const normalizeResult = (parsedData) => {
  return {
    proveedor: parsedData.proveedor || 'No Especificado',
    numero_factura: parsedData.numero_factura || 'No Especificado',
    nit: parsedData.nit || null,
    fecha_emision: parsedData.fecha_emision || '',
    fecha_emision_valida: isValidEmissionDate(parsedData.fecha_emision),
    iva: parsedData.iva || 0,
    monto: parsedData.monto || 0,
    monto_total: parsedData.monto_total || 0,
    tipo_doc: parsedData.tipo_doc || 'F',
    detalle: parsedData.detalle || [],
  }
}

// Extrae los datos de una factura enviando la imagen al modelo de vision
const extractInvoiceData = async (file, attempt = 1, useFallback = false) => {
  try {
    const imageBase64 = file.buffer.toString('base64')
    const model = useFallback ? geminiFallbackModel : geminiModel
    const result = await model.generateContent([
      {inlineData: {data: imageBase64, mimeType: file.mimetype}},
      buildPrompt(),
    ])
    const responseText = result.response.text().trim()
    const cleanJson = responseText.replace(/```json|```/g, '').trim()
    return normalizeResult(JSON.parse(cleanJson))
  }
  catch (error) {
    if (attempt < maxAttempts) {
      console.warn(`Intento ${attempt} fallido al extraer factura, reintentando...`, error.message)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      return extractInvoiceData(file, attempt + 1, useFallback)
    }
    if (!useFallback) {
      console.warn('Modelo principal agotó sus reintentos, probando con el modelo de respaldo...', error.message)
      return extractInvoiceData(file, 1, true)
    }
    throw error
  }
}

module.exports = {extractInvoiceData}