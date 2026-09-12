const supabase = require('../../config/supabase')
const htmlPdf = require('html-pdf-node')
const numberToWords = require('../../utils/numberToWords')
const emailService = require('../shared/emailService')

// Escapa caracteres especiales de HTML para prevenir inyeccion
const escapeHtml = (text) => {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
};

// Formatea una fecha ISO a formato dia/mes/anio
const formatShortDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return `${day}/${month}/${year}`
};

// Obtiene el siguiente numero correlativo de recibo, formateado a 6 digitos
const getNextReceiptNumber = async () => {
  const {data: correlativeData, error} = await supabase.rpc('incrementar_correlativo_recibo')
  if (error) {
    return {error: 'Error al generar el número de recibo'}
  }
  else {
    return {receiptNumber: String(correlativeData).padStart(6, '0')}
  }
};

// Genera el PDF a partir de un contenido HTML
const generatePdf = async (html) => {
  const file = {content: html}
  const options = {
    format: 'A4',
    landscape: true,
    margin: {top: '5mm', bottom: '5mm', left: '5mm', right: '5mm'},
    preferCSSPageSize: true,
  }
  return await htmlPdf.generatePdf(file, options)
};

// Genera el HTML de un recibo agrupado por tipo de gasto
const generateGroupedReceiptHtml = (expenses, employee, receiptNumber, type, isInternational, tripId, motivo, supervisor) => {
  const today = new Date()
  const day = today.getDate()
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const month = monthNames[today.getMonth()]
  const year = today.getFullYear()
  const currency = isInternational ? 'USD' : 'Bs'
  const currencyWords = isInternational ? 'DÓLARES AMERICANOS' : 'BOLIVIANOS'
  const isService = type === 'S'
  const retentionLabel = isService ? 'RETENCIÓN RC-IVA 13%' : 'RETENCIÓN IUE 5%'
  const typeTitle = isService ? 'RECIBO PAGO DE SERVICIOS' : 'RECIBO DE COMPRAS'
  const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
  let totalRetention = 0
  if (!isInternational) {
    if (isService) {
      totalRetention = expenses.reduce((sum, expense) => sum + parseFloat(expense.retencion_rc_iva || 0), 0)
    }
    else {
      totalRetention = expenses.reduce((sum, expense) => sum + parseFloat(expense.retencion_iue || 0), 0)
    }
  }
  let totalIt = 0
  if (!isInternational) {
    totalIt = expenses.reduce((sum, expense) => sum + parseFloat(expense.retencion_it || 0), 0)
  }
  const totalToPay = expenses.reduce((sum, expense) => sum + parseFloat(expense.importe_costo || expense.monto_total || 0), 0)
  const costCenter = `${employee?.numero_dependencia || ''} / ${employee?.numero_seccion || ''}`.trim()
  const amountInWords = numberToWords.convertNumberToWords(totalAmount, currencyWords)
  const expenseRows = expenses.map((expense, index) => {
    const subItems = expense.Gasto_Subitem || []
    const exchangeSegments = expense.Gasto_Tramo_Moneda || []
    let description = ''
    if (subItems.length > 0) {
      description = escapeHtml(subItems.map((item) => `${item.descripcion}: ${parseFloat(item.monto).toFixed(2)}`).join('\n'))
    }
    else {
      description = escapeHtml(expense.descripcion || expense.Categoria_Gasto?.nombre || '')
    }
    let segmentsText = '—'
    if (exchangeSegments.length > 0) {
      segmentsText = escapeHtml(exchangeSegments.map((segment) => `${parseFloat(segment.monto_origen).toFixed(2)} ${segment.moneda} → ${parseFloat(segment.monto_usd).toFixed(2)} USD`).join('\n'))
    }
    const dateStr = formatShortDate(expense.fecha_gasto)
    let segmentsColumn = ''
    if (isInternational) {
      segmentsColumn = `<td class="col-tramos">${segmentsText}</td>`
    }
    return `
    <tr>
      <td class="col-n">${index + 1}</td>
      <td class="col-fecha">${dateStr}</td>
      <td class="col-desc">${description}</td>
      ${segmentsColumn}
      <td class="col-importe">${parseFloat(expense.monto_total || 0).toFixed(2)}</td>
    </tr>`
  }).join('')
  const minRows = Math.max(0, 12 - expenses.length)
  const emptyRows = Array.from({length: minRows}).map((_, index) => {
    let segmentsColumn = ''
    if (isInternational) {
      segmentsColumn = '<td class="col-tramos"></td>'
    }
    return `
    <tr>
      <td class="col-n">${expenses.length + index + 1}</td>
      <td class="col-fecha"></td>
      <td class="col-desc"></td>
      ${segmentsColumn}
      <td class="col-importe"></td>
    </tr>`
  }).join('')
  let retentionRow = ''
  if (!isInternational) {
    retentionRow = `<div class="totales-fila"><span>${retentionLabel}</span><span>${totalRetention.toFixed(2)}</span></div>
        <div class="totales-fila"><span>RETENCIÓN IT 3%</span><span>${totalIt.toFixed(2)}</span></div>`
  }
  let segmentsHeader = ''
  if (isInternational) {
    segmentsHeader = '<th class="col-tramos">TRAMOS DE CAMBIO</th>'
  }
  let descWidth = '52'
  let segmentsWidth = '0'
  if (isInternational) {
    descWidth = '38'
    segmentsWidth = '20'
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: landscape; margin: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; }
  .marco { border: 1.5px solid #000; padding: 16px 24px; width: 100%; min-height: 100vh; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .logo { font-size: 14pt; font-weight: bold; letter-spacing: 1px; width: 20%; }
  .titulo { font-size: 20pt; font-weight: bold; text-align: center; letter-spacing: 1px; flex: 1; }
  .numero { color: #c00000; font-size: 13pt; font-weight: bold; text-align: right; width: 20%; }
  .fecha-linea { font-size: 10.5pt; margin: 10px 0 14px; }
  .viaje-linea { font-size: 10.5pt; margin-bottom: 10px; display: flex; justify-content: space-between; gap: 16px; }
  table.principal { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
  table.principal thead { display: table-header-group; }
  table.principal th { border: 1px solid #000; padding: 4px 6px; font-size: 10pt; font-weight: bold; text-align: center; }
  table.principal td { border: 1px solid #000; padding: 5px 6px; font-size: 9.5pt; height: 20px; }
  table.principal tr { page-break-inside: avoid; page-break-after: auto; }
  .col-n { width: 4%; text-align: center; }
  .col-fecha { width: 14%; text-align: center; }
  .col-desc { width: ${descWidth}%; white-space: pre-line; }
  .col-tramos { width: ${segmentsWidth}%; white-space: pre-line; font-size: 9pt; }
  .col-importe { width: 30%; text-align: right; }
  .zona-inferior { display: flex; justify-content: space-between; margin-top: 4px; gap: 20px; page-break-inside: avoid; }
  .centro-costo { width: 55%; }
  .centro-costo-titulo { font-size: 9.5pt; font-weight: bold; margin-bottom: 4px; }
  .centro-costo-box { border: 1px solid #000; height: 60px; padding: 4px; font-size: 10pt; }
  .totales { width: 40%; border: 1px solid #000; }
  .totales-fila { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding: 4px 8px; font-size: 9.5pt; }
  .totales-fila:last-child { border-bottom: none; font-weight: bold; }
  .son-linea { margin-top: 14px; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
  .son-texto { flex: 1; border-bottom: 1px solid #000; padding-bottom: 2px; margin-right: 12px; }
  .pie { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
  .pie-izq { width: 45%; text-align: center; }
  .pie-izq .linea-firma { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; font-size: 9.5pt; }
  .pie-der { width: 45%; font-size: 10pt; }
  .pie-der p { margin-bottom: 18px; border-bottom: 1px solid #000; padding-bottom: 2px; }
</style>
</head>
<body>
  <div class="marco">
    <div class="header">
      <div class="logo">MAXAM | FANEXA</div>
      <div class="titulo">${typeTitle}${isInternational ? ' (INTERNACIONAL)' : ''}</div>
      <div class="numero">Nº ${receiptNumber}</div>
    </div>
    <div class="fecha-linea">
      Lugar: Cochabamba &nbsp;&nbsp; de ${day} &nbsp;&nbsp; de ${month} &nbsp;&nbsp; de ${year}
    </div>
    <div class="viaje-linea">
      <span>Nº de Viaje: ${tripId}</span>
      <span>Concepto: ${escapeHtml(motivo || '')}</span>
      <span>Monto: ${totalAmount.toFixed(2)} ${currency}</span>
    </div>
    <table class="principal">
      <thead>
        <tr>
          <th class="col-n">Nº</th>
          <th class="col-fecha">FECHA</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          ${segmentsHeader}
          <th class="col-importe">IMPORTE ${currency.toUpperCase()}.</th>
        </tr>
      </thead>
      <tbody>
        ${expenseRows}
        ${emptyRows}
      </tbody>
    </table>
    <div class="zona-inferior">
      <div class="centro-costo">
        <p class="centro-costo-titulo">CENTRO DE COSTO</p>
        <div class="centro-costo-box">${costCenter}</div>
      </div>
      <div class="totales">
        <div class="totales-fila"><span>TOTAL IMPORTE</span><span>${totalAmount.toFixed(2)}</span></div>
        ${retentionRow}
        <div class="totales-fila"><span>IMPORTE A CANCELAR</span><span>${totalToPay.toFixed(2)}</span></div>
      </div>
    </div>
    <div class="son-linea">
      <span>Son:</span>
      <span class="son-texto">${amountInWords}</span>
    </div>
    <div class="pie">
      <div class="pie-izq">
        <div class="linea-firma">${supervisor ? supervisor.nombre + ' ' + supervisor.apellido_paterno : 'Autorizado por'}</div>
      </div>
      <div class="pie-der">
        <p>Nombre: ${employee?.nombre || ''} ${employee?.apellido_paterno || ''}</p>
        <p>Firma:</p>
        <p>C.I.: ${employee?.carnet_identidad || ''}</p>
      </div>
    </div>
  </div>
</body>
</html>`
};

// Genera el HTML de un recibo individual por un solo gasto
const generateIndividualReceiptHtml = (expense, employee, receiptNumber, tripId, motivo, supervisor) => {
  const today = new Date()
  const day = today.getDate()
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const month = monthNames[today.getMonth()]
  const year = today.getFullYear()
  const isInternational = !!expense.es_gasto_internacional
  const currency = isInternational ? 'USD' : 'Bs'
  const currencyWords = isInternational ? 'DÓLARES AMERICANOS' : 'BOLIVIANOS'
  const isService = expense.tipo === 'S'
  const retentionLabel = isService ? 'RETENCIÓN RC-IVA 13%' : 'RETENCIÓN IUE 5%'
  const typeTitle = isService ? 'RECIBO PAGO DE SERVICIOS' : 'RECIBO DE COMPRAS'
  const subItems = expense.Gasto_Subitem || []
  const exchangeSegments = expense.Gasto_Tramo_Moneda || []
  const hasSubItems = subItems.length > 0
  const hasSegments = isInternational && exchangeSegments.length > 0
  const totalAmount = parseFloat(expense.monto_total || 0)
  let totalRetention = 0
  if (!isInternational) {
    if (isService) {
      totalRetention = parseFloat(expense.retencion_rc_iva || 0)
    }
    else {
      totalRetention = parseFloat(expense.retencion_iue || 0)
    }
  }
  let totalIt = 0
  if (!isInternational) {
    totalIt = parseFloat(expense.retencion_it || 0)
  }
  const totalToPay = parseFloat(expense.importe_costo || expense.monto_total || 0)
  const costCenter = `${employee?.numero_dependencia || ''} / ${employee?.numero_seccion || ''}`.trim()
  const amountInWords = numberToWords.convertNumberToWords(totalAmount, currencyWords)
  let expenseRows = ''
  if (hasSubItems) {
    expenseRows = subItems.map((item, index) => `
    <tr>
      <td class="col-n">${index + 1}</td>
      <td class="col-fecha">${formatShortDate(expense.fecha_gasto)}</td>
      <td class="col-desc">${escapeHtml(item.descripcion)}</td>
      <td class="col-importe">${parseFloat(item.monto).toFixed(2)}</td>
    </tr>`).join('')
  }
  else {
    expenseRows = `
    <tr>
      <td class="col-n">1</td>
      <td class="col-fecha">${formatShortDate(expense.fecha_gasto)}</td>
      <td class="col-desc">${escapeHtml(expense.descripcion || expense.Categoria_Gasto?.nombre || '')}</td>
      <td class="col-importe">${totalAmount.toFixed(2)}</td>
    </tr>`
  }
  let rowCount = 1
  if (hasSubItems) {
    rowCount = subItems.length
  }
  const minRows = Math.max(0, 10 - rowCount)
  const emptyRows = Array.from({length: minRows}).map((_, index) => `
    <tr>
      <td class="col-n">${rowCount + index + 1}</td>
      <td class="col-fecha"></td>
      <td class="col-desc"></td>
      <td class="col-importe"></td>
    </tr>`).join('')
  let retentionRow = ''
  if (!isInternational) {
    retentionRow = `<div class="totales-fila"><span>${retentionLabel}</span><span>${totalRetention.toFixed(2)}</span></div>
        <div class="totales-fila"><span>RETENCIÓN IT 3%</span><span>${totalIt.toFixed(2)}</span></div>`
  }
  let segmentsHtml = ''
  if (hasSegments) {
    segmentsHtml = `
    <div class="tramos-box">
      <p class="tramos-titulo">TRAMOS DE CAMBIO</p>
      ${exchangeSegments.map((segment) => `<p class="tramos-linea">${parseFloat(segment.monto_origen).toFixed(2)} ${segment.moneda} → ${parseFloat(segment.monto_usd).toFixed(2)} USD (T/C: ${parseFloat(segment.tipo_cambio).toFixed(4)})</p>`).join('')}
    </div>`
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: landscape; margin: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; }
  .marco { border: 1.5px solid #000; padding: 16px 24px; width: 100%; min-height: 100vh; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .logo { font-size: 14pt; font-weight: bold; letter-spacing: 1px; width: 20%; }
  .titulo { font-size: 20pt; font-weight: bold; text-align: center; letter-spacing: 1px; flex: 1; }
  .numero { color: #c00000; font-size: 13pt; font-weight: bold; text-align: right; width: 20%; }
  .fecha-linea { font-size: 10.5pt; margin: 10px 0 14px; }
  .viaje-linea { font-size: 10.5pt; margin-bottom: 10px; display: flex; justify-content: space-between; gap: 16px; }
  table.principal { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
  table.principal thead { display: table-header-group; }
  table.principal th { border: 1px solid #000; padding: 4px 6px; font-size: 10pt; font-weight: bold; text-align: center; }
  table.principal td { border: 1px solid #000; padding: 5px 6px; font-size: 9.5pt; height: 20px; }
  table.principal tr { page-break-inside: avoid; page-break-after: auto; }
  .col-n { width: 4%; text-align: center; }
  .col-fecha { width: 14%; text-align: center; }
  .col-desc { width: 52%; white-space: pre-line; }
  .col-importe { width: 30%; text-align: right; }
  .tramos-box { border: 1px solid #000; padding: 8px 10px; margin-bottom: 8px; }
  .tramos-titulo { font-size: 9.5pt; font-weight: bold; margin-bottom: 4px; }
  .tramos-linea { font-size: 9.5pt; line-height: 1.4; }
  .zona-inferior { display: flex; justify-content: space-between; margin-top: 4px; gap: 20px; page-break-inside: avoid; }
  .centro-costo { width: 55%; }
  .centro-costo-titulo { font-size: 9.5pt; font-weight: bold; margin-bottom: 4px; }
  .centro-costo-box { border: 1px solid #000; height: 60px; padding: 4px; font-size: 10pt; }
  .totales { width: 40%; border: 1px solid #000; }
  .totales-fila { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding: 4px 8px; font-size: 9.5pt; }
  .totales-fila:last-child { border-bottom: none; font-weight: bold; }
  .son-linea { margin-top: 14px; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
  .son-texto { flex: 1; border-bottom: 1px solid #000; padding-bottom: 2px; margin-right: 12px; }
  .pie { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
  .pie-izq { width: 45%; text-align: center; }
  .pie-izq .linea-firma { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; font-size: 9.5pt; }
  .pie-der { width: 45%; font-size: 10pt; }
  .pie-der p { margin-bottom: 18px; border-bottom: 1px solid #000; padding-bottom: 2px; }
</style>
</head>
<body>
  <div class="marco">
    <div class="header">
      <div class="logo">MAXAM | FANEXA</div>
      <div class="titulo">${typeTitle}${isInternational ? ' (INTERNACIONAL)' : ''}</div>
      <div class="numero">Nº ${receiptNumber}</div>
    </div>
    <div class="fecha-linea">
      Lugar: Cochabamba &nbsp;&nbsp; de ${day} &nbsp;&nbsp; de ${month} &nbsp;&nbsp; de ${year}
    </div>
    <div class="viaje-linea">
      <span>Nº de Viaje: ${tripId}</span>
      <span>Concepto: ${escapeHtml(motivo || '')}</span>
      <span>Monto: ${totalAmount.toFixed(2)} ${currency}</span>
    </div>
    ${segmentsHtml}
    <table class="principal">
      <thead>
        <tr>
          <th class="col-n">Nº</th>
          <th class="col-fecha">FECHA</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          <th class="col-importe">IMPORTE ${currency.toUpperCase()}.</th>
        </tr>
      </thead>
      <tbody>
        ${expenseRows}
        ${emptyRows}
      </tbody>
    </table>
    <div class="zona-inferior">
      <div class="centro-costo">
        <p class="centro-costo-titulo">CENTRO DE COSTO</p>
        <div class="centro-costo-box">${costCenter}</div>
      </div>
      <div class="totales">
        <div class="totales-fila"><span>TOTAL IMPORTE</span><span>${totalAmount.toFixed(2)}</span></div>
        ${retentionRow}
        <div class="totales-fila"><span>IMPORTE A CANCELAR</span><span>${totalToPay.toFixed(2)}</span></div>
      </div>
    </div>
    <div class="son-linea">
      <span>Son:</span>
      <span class="son-texto">${amountInWords}</span>
    </div>
    <div class="pie">
      <div class="pie-izq">
        <div class="linea-firma">${supervisor ? supervisor.nombre + ' ' + supervisor.apellido_paterno : 'Autorizado por'}</div>
      </div>
      <div class="pie-der">
        <p>Nombre: ${employee?.nombre || ''} ${employee?.apellido_paterno || ''}</p>
        <p>Firma:</p>
        <p>C.I.: ${employee?.carnet_identidad || ''}</p>
      </div>
    </div>
  </div>
</body>
</html>`
};

// Genera y envia un recibo agrupado por viaje y tipo de gasto
const sendGroupedReceipt = async (tripId, type, isInternational) => {
  if (!['C', 'S'].includes(type)) {
    return {error: 'El tipo debe ser Compra (C) o Servicio (S)', status: 400}
  }
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('motivo, estado, id_usuario, id_supervisor_asignado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo, numero_dependencia, numero_seccion, carnet_identidad)')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'APROBADO_FINAL') {
    return {error: 'El recibo solo puede emitirse cuando el viaje está aprobado en su totalidad', status: 400}
  }
  const employee = trip.Usuario
  let supervisor = null
  if (trip.id_supervisor_asignado) {
    const {data: supervisorData} = await supabase
      .from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', trip.id_supervisor_asignado).single()
    supervisor = supervisorData
  }
  if (!employee?.email_corporativo) {
    return {error: 'El empleado no tiene un correo corporativo registrado', status: 400}
  }
  const {data: expenses, error: expensesError} = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Gasto_Subitem(id_subitem, descripcion, monto), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd)')
    .eq('id_viaje', tripId)
    .eq('tipo', type)
    .eq('es_gasto_internacional', isInternational)
    .order('fecha_gasto', {ascending: true})
  if (expensesError) {
    return {error: expensesError.message, status: 500}
  }
  if (!expenses || expenses.length === 0) {
    let internationalLabel = ''
    if (isInternational) {
      internationalLabel = 'internacionales '
    }
    let typeLabel = 'Compra'
    if (type === 'S') {
      typeLabel = 'Servicio'
    }
    return {error: `No hay gastos ${internationalLabel}de tipo ${typeLabel} sin factura registrados en este viaje`, status: 400}
  }
  const {receiptNumber, error: numberError} = await getNextReceiptNumber()
  if (numberError) {
    return {error: numberError, status: 500}
  }
  const html = generateGroupedReceiptHtml(expenses, employee, receiptNumber, type, isInternational, tripId, trip.motivo, supervisor)
  const pdfBuffer = await generatePdf(html)
  const pdfBase64 = pdfBuffer.toString('base64')
  let typeName = 'Compras'
  if (type === 'S') {
    typeName = 'Servicios'
  }
  let internationalSuffix = ''
  if (isInternational) {
    internationalSuffix = '_Internacional'
  }
  const attachments = [{content: pdfBase64, name: `Recibo_${typeName}${internationalSuffix}_${receiptNumber}.pdf`}]
  let emailTitle = 'Recibo de Compras'
  if (type === 'S') {
    emailTitle = 'Recibo de Pago de Servicios'
  }
  let internationalEmailSuffix = ''
  if (isInternational) {
    internationalEmailSuffix = ' Internacional'
  }
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">${emailTitle}${internationalEmailSuffix}</h2>
      <p style="margin-bottom:8px;">Se adjunta el recibo consolidado de ${typeName.toLowerCase()} Nº ${receiptNumber}, con ${expenses.length} gasto(s) registrado(s).</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
    </div>`
  await emailService.sendEmail(
    [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
    `${emailTitle}${internationalEmailSuffix} — Nº ${receiptNumber}`,
    emailHtml,
    attachments
  )
  return {message: 'Recibo generado y enviado correctamente', expenseCount: expenses.length}
};

// Genera y envia un recibo individual por un solo gasto
const sendIndividualReceipt = async (expenseId) => {
  const {data: expense, error: expenseError} = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Gasto_Subitem(id_subitem, descripcion, monto), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Viaje(id_viaje, motivo, estado, id_usuario, id_supervisor_asignado, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo, numero_dependencia, numero_seccion, carnet_identidad))')
    .eq('id_gasto', expenseId)
    .single()
  if (expenseError) {
    return {error: expenseError.message, status: 500}
  }
  if (!expense) {
    return {error: 'Gasto no encontrado', status: 404}
  }
  if (!['C', 'S'].includes(expense.tipo)) {
    return {error: 'Solo se puede generar recibo para gastos de tipo Compra o Servicio sin factura', status: 400}
  }
  if (expense.Viaje?.estado !== 'APROBADO_FINAL') {
    return {error: 'El recibo solo puede emitirse cuando el viaje está aprobado en su totalidad', status: 400}
  }
  const employee = expense.Viaje?.Usuario
  if (!employee?.email_corporativo) {
    return {error: 'El empleado no tiene un correo corporativo registrado', status: 400}
  }
  let supervisor = null
  if (expense.Viaje?.id_supervisor_asignado) {
    const {data: supervisorData} = await supabase
      .from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', expense.Viaje.id_supervisor_asignado).single()
    supervisor = supervisorData
  }
  const {receiptNumber, error: numberError} = await getNextReceiptNumber()
  if (numberError) {
    return {error: numberError, status: 500}
  }
  const html = generateIndividualReceiptHtml(expense, employee, receiptNumber, expense.Viaje?.id_viaje, expense.Viaje?.motivo, supervisor)
  const pdfBuffer = await generatePdf(html)
  const pdfBase64 = pdfBuffer.toString('base64')
  let typeName = 'Compra'
  if (expense.tipo === 'S') {
    typeName = 'Servicio'
  }
  const attachments = [{content: pdfBase64, name: `Recibo_${typeName}_${receiptNumber}.pdf`}]
  let emailTitle = 'Recibo de Compra'
  if (expense.tipo === 'S') {
    emailTitle = 'Recibo de Pago de Servicio'
  }
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">${emailTitle}</h2>
      <p style="margin-bottom:8px;">Se adjunta el recibo Nº ${receiptNumber} correspondiente al gasto registrado.</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
    </div>`
  await emailService.sendEmail(
    [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
    `${emailTitle} — Nº ${receiptNumber}`,
    emailHtml,
    attachments
  )
  return {message: 'Recibo generado y enviado correctamente'}
};

module.exports = {sendGroupedReceipt, sendIndividualReceipt};