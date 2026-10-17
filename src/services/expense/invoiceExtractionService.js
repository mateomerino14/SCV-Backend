const geminiService = require('../shared/geminiService');

// Construye la instruccion enviada al modelo para interpretar el comprobante
const buildPrompt = () => {
  return `Analiza esta imagen de una factura o recibo boliviano y devuelve SOLO un JSON sin texto adicional ni backticks con esta estructura exacta:
{
  "proveedor": "nombre del proveedor o empresa emisora",
  "numero_factura": "número de factura; si es un recibo o boleto sin número, su código (puede tener letras y símbolos)",
  "nit": "NIT o CI del proveedor (solo números, máximo 10 dígitos)",
  "fecha_emision": "fecha en formato YYYY-MM-DD",
  "iva": monto_numerico_del_impuesto_en_dinero_NO_el_porcentaje,
  "monto": monto_numerico_sin_impuestos,
  "monto_total": monto_numerico_total_con_impuestos,
  "tipo_doc": "F si tiene IVA o impuesto, R si es recibo sin impuesto",
  "detalle": [
    { "nombre_producto": "descripcion del producto o servicio", "cantidad": numero_decimal, "precio": numero_decimal }
  ]
}

IMPORTANTE:
- El campo iva debe ser el MONTO EN DINERO del impuesto, no el porcentaje
- En facturas bolivianas "Importe" generalmente es el monto total con IVA incluido — úsalo como monto_total
- El IVA boliviano es del 13% sobre el subtotal — si no aparece explícito, calcúlalo como monto_total / 1.13 * 0.13
- Si no encuentras algún dato, usa null para números y "No Especificado" para textos
- La fecha debe estar en formato YYYY-MM-DD obligatoriamente
- La cantidad puede tener decimales (por ejemplo 53.345 litros de combustible); usa como máximo 3 decimales
- En un recibo (R) no hay impuesto: iva es 0 y monto es igual a monto_total
- Devuelve SOLO el JSON, sin explicaciones ni texto adicional`;
};

// Verifica si la fecha extraida tiene un formato valido y real
const isValidEmissionDate = (value) => {
  if (!value || value === 'No Especificado') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Redondea la cantidad extraida a 3 decimales (litros, kilos o unidades)
const normalizeQuantity = (value) => {
  const quantity = parseFloat(value);
  if (!(quantity > 0)) {
    return 1;
  }
  return parseFloat(quantity.toFixed(3));
};

// Normaliza la respuesta del modelo al formato que espera el sistema
const normalizeResult = (parsedData) => {
  let docType = 'F';
  let amount = parsedData.monto || 0;
  let vat = parsedData.iva || 0;
  let total = parsedData.monto_total || 0;
  // El recibo no lleva IVA: el monto es el total pagado, sin descontar nada
  if (parsedData.tipo_doc === 'R') {
    docType = 'R';
    amount = parsedData.monto_total || parsedData.monto || 0;
    vat = 0;
    total = amount;
  }
  // Si la factura no trae subtotal e IVA coherentes con el total, el IVA se separa por dentro del total
  const totalNum = parseFloat(total) || 0;
  if (docType === 'F' && totalNum > 0 && Math.abs((parseFloat(amount) || 0) + (parseFloat(vat) || 0) - totalNum) > 0.02) {
    amount = parseFloat((totalNum / 1.13).toFixed(2));
    vat = parseFloat((totalNum - amount).toFixed(2));
  }
  return {
    proveedor: parsedData.proveedor || 'No Especificado',
    numero_factura: parsedData.numero_factura || 'No Especificado',
    nit: parsedData.nit || null,
    fecha_emision: parsedData.fecha_emision || '',
    fecha_emision_valida: isValidEmissionDate(parsedData.fecha_emision),
    iva: vat,
    monto: amount,
    monto_total: total,
    tipo_doc: docType,
    detalle: (parsedData.detalle || []).map((item) => ({...item, cantidad: normalizeQuantity(item?.cantidad)})),
  };
};

// Extrae los datos de una factura con el modelo de vision (y uno de respaldo si falla)
const extractInvoiceData = async (file) => {
  const imageBase64 = file.buffer.toString('base64');
  const responseText = await geminiService.generateText([
    {inlineData: {data: imageBase64, mimeType: file.mimetype}},
    buildPrompt(),
  ], {taskName: 'extraccion de factura'});
  const cleanJson = responseText.replace(/```json|```/g, '').trim();
  return normalizeResult(JSON.parse(cleanJson));
};

module.exports = {extractInvoiceData, normalizeResult};