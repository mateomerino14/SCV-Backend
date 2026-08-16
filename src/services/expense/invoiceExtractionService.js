const FormData = require('form-data')
const axios = require('axios')
const cheerio = require('cheerio')
const Groq = require('groq-sdk')
const Jimp = require('jimp')
const QrCode = require('qrcode-reader')
const groqClient = new Groq({apiKey: process.env.GROQ_API_KEY})

// Limpia un texto quitando espacios extra
const cleanText = (text) => {
  return (text || '').replace(/\s+/g, ' ').trim()
};

// Lee el contenido de un codigo QR desde un buffer de imagen
const readQrFromBuffer = async (buffer) => {
  try {
    const image = await Jimp.read(buffer)
    const qr = new QrCode()
    return await new Promise((resolve) => {
      qr.callback = (error, value) => {
        if (error || !value?.result) {
          resolve(null)
        }
        else {
          resolve(value.result)
        }
      }
      qr.decode(image.bitmap)
    })
  }
  catch (error) {
    return null
  }
};

// Obtiene los datos de una factura consultando la pagina del QR del SIAT
const getDataFromSiatQr = async (qrUrl) => {
  try {
    const {data: html} = await axios.get(qrUrl, {
      timeout: 8000,
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
    })
    const $ = cheerio.load(html)
    const pairs = {}
    $('table tr').each((index, row) => {
      const cells = $(row).find('td, th')
      if (cells.length === 2) {
        const label = cleanText($(cells[0]).text())
        const value = cleanText($(cells[1]).text())
        if (label && label.endsWith(':')) {
          pairs[label.replace(':', '').toLowerCase()] = value
        }
      }
    })
    const invoiceNumber = pairs['número de factura'] || pairs['numero de factura'] || null
    const cuf = pairs['cuf'] || null
    const rawIssueDate = pairs['fecha emisión'] || pairs['fecha emision'] || null
    const rawTotalAmount = pairs['monto total'] || null
    const issuerTaxId = pairs['nit emisor'] || null
    const businessName = pairs['razón social'] || pairs['razon social'] || null
    let issueDate = ''
    if (rawIssueDate) {
      const dateOnly = rawIssueDate.split(' ')[0]
      const [day, month, year] = dateOnly.split('/')
      if (day && month && year) {
        issueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
    }
    let totalAmount = 0
    if (rawTotalAmount) {
      totalAmount = parseFloat(rawTotalAmount.replace(/[^\d.]/g, '')) || 0
    }
    const details = []
    $('table').each((index, table) => {
      const headerText = cleanText($(table).find('tr').first().text()).toLowerCase()
      if (headerText.includes('código') || headerText.includes('codigo')) {
        $(table).find('tr').slice(1).each((rowIndex, row) => {
          const cells = $(row).find('td')
          if (cells.length >= 5) {
            const productName = cleanText($(cells[1]).text())
            const quantity = parseFloat(cleanText($(cells[2]).text()).replace(',', '.')) || 1
            const priceText = cleanText($(cells[3]).text())
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0
            if (productName) {
              details.push({nombre_producto: productName, cantidad: quantity, precio: price})
            }
          }
        })
      }
    })
    if (!invoiceNumber && !cuf && details.length === 0) {
      return null
    }
    else {
      return {
        proveedor: businessName || 'No Especificado',
        numero_factura: invoiceNumber || 'No Especificado',
        nit: issuerTaxId || null,
        fecha_emision: issueDate,
        iva: 0,
        monto: totalAmount,
        monto_total: totalAmount,
        tipo_doc: 'F',
        detalle: details,
        extraido_por_qr: true,
      }
    }
  }
  catch (error) {
    console.warn('Error consultando QR SIAT:', error.message)
    return null
  }
};

// Extrae datos de facturas cuyo QR no apunta a la pagina del SIAT
const parseGenericQr = (qrText) => {
  try {
    let params = {}
    if (qrText.includes('http')) {
      const url = new URL(qrText)
      params = Object.fromEntries(url.searchParams.entries())
    }
    else if (qrText.includes('|')) {
      const parts = qrText.split('|')
      if (parts.length >= 4) {
        params = {
          nit: parts[0],
          numeroFactura: parts[1],
          fechaEmision: parts[2],
          montoTotal: parts[3],
          codigoControl: parts[4] || '',
        }
      }
    }
    else {
      return null
    }
    let normalizedDate = params.fechaEmision || params.fechaFactura || ''
    if (normalizedDate.includes('/')) {
      const [day, month, year] = normalizedDate.split('/')
      normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    const taxId = params.nit || params.nitEmisor || null
    const invoiceNumber = params.numeroFactura || params.nroFactura || null
    const totalAmount = parseFloat(params.montoTotal || params.monto || 0)
    if (!taxId && !invoiceNumber && !totalAmount) {
      return null
    }
    else {
      return {
        nit: taxId?.toString() || null,
        numero_factura: invoiceNumber?.toString() || 'No Especificado',
        fecha_emision: normalizedDate || '',
        monto_total: totalAmount,
        monto: totalAmount,
        iva: 0,
        proveedor: 'No Especificado',
        tipo_doc: 'F',
        detalle: [],
        extraido_por_qr: true,
      }
    }
  }
  catch (error) {
    return null
  }
};

// Extrae los datos de una factura usando OCR y un modelo de IA
const extractInvoiceWithOcr = async (fileBuffer, originalName, mimeType) => {
  const formData = new FormData()
  formData.append('file', fileBuffer, {
    filename: originalName,
    contentType: mimeType,
  })
  formData.append('language', 'spa')
  formData.append('isOverlayRequired', 'false')
  formData.append('OCREngine', '2')
  const ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
    headers: {...formData.getHeaders(), apikey: process.env.OCR_SPACE_API_KEY},
  })
  const extractedText = ocrResponse.data?.ParsedResults?.[0]?.ParsedText || ''
  const chatResponse = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Analiza este texto extraído de una factura y devuelve SOLO un JSON sin texto adicional ni backticks con esta estructura exacta:
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
    { "nombre_producto": "descripcion del producto", "cantidad": numero, "precio": numero_decimal }
  ]
}

IMPORTANTE: El campo iva debe ser el MONTO EN DINERO del impuesto, no el porcentaje.

Texto de la factura:
${extractedText}`
    }]
  })
  const responseText = chatResponse.choices[0]?.message?.content?.trim() || ''
  const parsedData = JSON.parse(responseText)
  return {
    proveedor: parsedData.proveedor || 'No Especificado',
    numero_factura: parsedData.numero_factura || 'No Especificado',
    nit: parsedData.nit || null,
    fecha_emision: parsedData.fecha_emision || '',
    iva: parsedData.iva || 0,
    monto: parsedData.monto || 0,
    monto_total: parsedData.monto_total || 0,
    tipo_doc: parsedData.tipo_doc || 'F',
    detalle: parsedData.detalle || [],
    extraido_por_qr: false,
  }
};

// Intenta extraer los datos de una factura, primero por QR y luego por OCR
const extractInvoiceData = async (file) => {
  const qrText = await readQrFromBuffer(file.buffer)
  if (qrText) {
    let qrData = null
    if (qrText.includes('siat.impuestos.gob.bo')) {
      qrData = await getDataFromSiatQr(qrText)
    }
    if (!qrData) {
      qrData = parseGenericQr(qrText)
    }
    if (qrData) {
      return qrData
    }
  }
  return await extractInvoiceWithOcr(file.buffer, file.originalname, file.mimetype)
};

module.exports = {extractInvoiceData};