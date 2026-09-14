const supabase = require('../../config/supabase')
const pdfService = require('../shared/pdfService')

const vatRate = 0.13

const symbologyRows = [
  ['F', 'Compra Bien/Servicio c/factura'],
  ['C', 'Compra de Bien sin factura'],
  ['A', 'Servicio, Alquiler sin factura'],
  ['R', 'Docto. sin IVA, sin Retencion'],
]

// Escapa caracteres especiales de HTML para prevenir inyeccion
const escapeHtml = (text) => {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Extrae la cuenta contable de Oracle a partir del nombre de la categoria
const extractOracleAccount = (categoryName) => {
  if (!categoryName) {
    return ''
  }
  const match = categoryName.match(/^(\d{6})\s+(.+)$/)
  if (!match) {
    return categoryName
  }
  return `${match[1]} ${match[2]}`
}

// Traduce el tipo interno del gasto al codigo de simbologia de Oracle
const toOracleExpenseType = (internalType) => {
  if (internalType === 'S') {
    return 'A'
  }
  return internalType
}

// Calcula el desglose fiscal de un gasto
const getExpenseTaxValues = (expense) => {
  const isInternational = !!expense.es_gasto_internacional
  const amount = parseFloat(expense.monto_total) || 0
  const hasInvoice = !!expense.Factura
  if (isInternational) {
    return {vat: 0, rcIva: 0, iue: 0, it: 0, cost: amount}
  }
  if (expense.tiene_alcohol) {
    return {vat: 0, rcIva: 0, iue: 0, it: 0, cost: amount}
  }
  if (hasInvoice) {
    const partial = parseFloat(expense.Factura?.monto_parcial || 0)
    const vat = parseFloat((partial * vatRate).toFixed(2))
    return {vat, rcIva: 0, iue: 0, it: 0, cost: amount}
  }
  return {
    vat: 0,
    rcIva: parseFloat(expense.retencion_rc_iva || 0),
    iue: parseFloat(expense.retencion_iue || 0),
    it: parseFloat(expense.retencion_it || 0),
    cost: parseFloat(expense.importe_costo || amount),
  }
}

// Arma la descripcion visible de un gasto segun tenga factura o subitems
const getExpenseDescription = (expense) => {
  const hasInvoice = !!expense.Factura
  if (hasInvoice) {
    const products = (expense.Factura?.Detalle_Factura || [])
      .map((detail) => `${detail.nombre_producto}${detail.cantidad ? ` x${detail.cantidad}` : ''}`)
      .join(', ')
    return escapeHtml((products || expense.descripcion || `Factura N° ${expense.Factura?.numero_factura || ''}`).toUpperCase())
  }
  const subitems = expense.Gasto_Subitem || []
  if (subitems.length > 0) {
    return escapeHtml(subitems.map((subitem) => `${subitem.descripcion}: ${parseFloat(subitem.monto).toFixed(2)}`).join(', ').toUpperCase())
  }
  return escapeHtml((expense.descripcion || expense.Categoria_Gasto?.nombre || '').toUpperCase())
}

// Arma el texto de los tramos de cambio de moneda de un gasto internacional
const buildTramosText = (expense) => {
  const installments = expense.Gasto_Tramo_Moneda || []
  if (installments.length === 0) {
    return ''
  }
  return escapeHtml(installments.map((installment) => `${parseFloat(installment.monto_origen).toFixed(2)} ${installment.moneda} → ${parseFloat(installment.monto_usd).toFixed(2)} USD`).join(' | '))
}

// Formatea una fecha a dia/mes/anio
const formatDate = (dateInput) => {
  if (!dateInput) {
    return ''
  }
  const date = new Date(dateInput)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Genera el HTML de la planilla de rendicion de cuentas
const generateStatementHtml = (trip, expenses, dayJustifications) => {
  const employee = trip.Usuario
  const responsable = `${employee?.nombre || ''} ${employee?.apellido_paterno || ''}`.trim().toUpperCase()
  const cargo = employee?.Cargo?.nombre?.toUpperCase() || ''
  const costCenter = employee?.numero_seccion || ''

  let totalImporteFactura = 0
  let totalImporteBs = 0
  let totalImporteUsd = 0
  let totalVat = 0
  let totalRcIva = 0
  let totalIue = 0
  let totalIt = 0
  let totalCostBs = 0
  let totalCostUsd = 0

  const rows = expenses.map((expense, index) => {
    const amount = parseFloat(expense.monto_total) || 0
    const isInternational = !!expense.es_gasto_internacional
    const hasInvoice = !!expense.Factura
    const {vat, rcIva, iue, it, cost} = getExpenseTaxValues(expense)
    const oracleValue = escapeHtml(extractOracleAccount(expense.Categoria_Gasto?.nombre))
    const oracleType = toOracleExpenseType(expense.tipo)
    const detailText = getExpenseDescription(expense)
    const tramosText = buildTramosText(expense)
    const currency = isInternational ? 'USD' : 'Bs'
    if (isInternational) {
      totalImporteUsd += amount
      totalCostUsd += cost
    }
    else {
      totalImporteBs += amount
      totalCostBs += cost
    }
    if (hasInvoice) {
      totalImporteFactura += amount
    }
    totalVat += vat
    totalRcIva += rcIva
    totalIue += iue
    totalIt += it
    const rowClass = isInternational ? 'fila-internacional' : 'fila-nacional'
    return `
    <tr class="${rowClass}">
      <td class="col-n">${index + 1}</td>
      <td class="col-fecha">${formatDate(expense.Factura?.fecha_emision || expense.fecha_gasto)}</td>
      <td class="col-oracle">${oracleValue}</td>
      <td class="col-detalle">${detailText}</td>
      <td class="col-tipo">${oracleType}</td>
      <td class="col-doc">${escapeHtml(expense.Factura?.numero_factura || '')}</td>
      <td class="col-nit">${escapeHtml(expense.Proveedor?.numero_doc_fiscal || '')}</td>
      <td class="col-importe-fact">${hasInvoice ? amount.toFixed(2) : ''}</td>
      <td class="col-tramos">${tramosText}</td>
      <td class="col-importe">${amount.toFixed(2)} ${currency}</td>
      <td class="col-num">${vat.toFixed(2)}</td>
      <td class="col-num">${rcIva.toFixed(2)}</td>
      <td class="col-num">${iue.toFixed(2)}</td>
      <td class="col-num">${it.toFixed(2)}</td>
      <td class="col-num">${cost.toFixed(2)}</td>
    </tr>`
  }).join('')

  const assignedAmount = parseFloat(trip.monto_asignado) || 0
  const assignedAmountUsd = parseFloat(trip.monto_asignado_usd || 0)
  const remaining = assignedAmount - totalImporteBs
  const remainingUsd = assignedAmountUsd - totalImporteUsd
  const balanceRows = [
    ['Fondo Recibido', assignedAmount, assignedAmountUsd],
    ['Saldo en mi poder', remaining, remainingUsd],
    ['Importe a Devolver', remaining > 0 ? remaining : 0, remainingUsd > 0 ? remainingUsd : 0],
    ['Importe a Reembolsar', remaining < 0 ? Math.abs(remaining) : 0, remainingUsd < 0 ? Math.abs(remainingUsd) : 0],
  ]

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: landscape; margin: 0; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; }
  .marco { border: 1.5px solid #000; padding: 12px 16px; width: 100%; min-height: 100vh; }
  .header { display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 8px; gap: 10px; }
  .logo { font-size: 11pt; font-weight: bold; width: 15%; display: flex; align-items: center; }
  .titulo { font-size: 14pt; font-weight: bold; text-align: center; flex: 1; background: #4a90d9; color: #fff; display: flex; align-items: center; justify-content: center; }
  .simbologia { width: 30%; border: 1px solid #000; font-size: 7.5pt; }
  .simbologia-titulo { background: #4a90d9; color: #fff; font-weight: bold; text-align: center; padding: 2px; }
  .simbologia-fila { display: flex; border-top: 1px solid #ccc; }
  .simbologia-fila span:first-child { width: 20px; font-weight: bold; text-align: center; border-right: 1px solid #ccc; }
  .simbologia-fila span:last-child { padding: 1px 4px; }
  .info-box { border: 1px solid #000; background: #eaf3fb; padding: 4px 8px; margin-bottom: 8px; display: grid; grid-template-columns: repeat(4, auto 1fr); gap: 3px 8px; font-size: 8pt; }
  .info-label { font-weight: bold; color: #1a5276; }
  table.principal { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.principal th { background: #4a90d9; color: #fff; border: 1px solid #1b4f91; padding: 3px; font-size: 7pt; text-align: center; }
  table.principal td { border: 1px solid #b0c4d4; padding: 3px 4px; font-size: 7.5pt; }
  .fila-nacional { background: #f4f9fd; }
  .fila-internacional { background: #fdeeee; }
  .col-n { text-align: center; width: 2%; }
  .col-fecha { text-align: center; width: 6%; }
  .col-oracle { width: 12%; }
  .col-detalle { width: 18%; }
  .col-tipo { text-align: center; width: 5%; }
  .col-doc { text-align: center; width: 8%; }
  .col-nit { text-align: center; width: 6%; }
  .col-importe-fact { text-align: right; width: 6%; }
  .col-tramos { width: 10%; font-size: 6.5pt; }
  .col-importe { text-align: right; width: 8%; }
  .col-num { text-align: right; width: 5%; }
  .totales-fila td { background: #bfe0f5; font-weight: bold; text-align: right; }
  .totales-fila td:first-child { text-align: left; }
  .zona-inferior { display: flex; gap: 16px; margin-bottom: 10px; }
  .balance-table { width: 45%; border-collapse: collapse; }
  .balance-table th { background: #4a90d9; color: #fff; padding: 3px; font-size: 7.5pt; }
  .balance-table td { border: 1px solid #b0c4d4; padding: 3px 8px; font-size: 8pt; }
  .observaciones { flex: 1; border: 1px solid #000; padding: 4px 8px; font-size: 8pt; }
  .observaciones-titulo { font-weight: bold; margin-bottom: 4px; }
  .firmas { display: flex; justify-content: space-between; margin-top: 30px; gap: 10px; }
  .firma-bloque { flex: 1; text-align: center; }
  .firma-linea { border-top: 1px solid #000; margin-top: 30px; padding-top: 4px; font-size: 7.5pt; font-weight: bold; }
  .firma-rol { font-size: 7pt; }
</style>
</head>
<body>
  <div class="marco">
    <div class="header">
      <div class="logo">MAXAM | FANEXA</div>
      <div class="titulo">PLANILLA DE RENDICIÓN DE CUENTAS</div>
      <div class="simbologia">
        <div class="simbologia-titulo">SIMBOLOGÍA</div>
        ${symbologyRows.map(([symbol, description]) => `
        <div class="simbologia-fila"><span>${symbol}</span><span>${description}</span></div>`).join('')}
      </div>
    </div>
    <div class="info-box">
      <span class="info-label">RESPONSABLE:</span><span>${escapeHtml(responsable)}</span>
      <span class="info-label">CARGO:</span><span>${escapeHtml(cargo)}</span>
      <span class="info-label">MEMORANDUM:</span><span>V-${trip.id_viaje}</span>
      <span class="info-label">FECHA:</span><span>${formatDate(trip.fecha_inicio)}</span>
      <span class="info-label">MOTIVO:</span><span>${escapeHtml(trip.motivo?.toUpperCase() || '')}</span>
      <span class="info-label">SECCIÓN:</span><span>${escapeHtml(costCenter)}</span>
    </div>
    <table class="principal">
      <thead>
        <tr>
          <th>N°</th><th>FECHA</th><th>CUENTA/ORACLE</th><th>DETALLE</th><th>TIPO GASTO</th>
          <th>N° DOCUMENTO</th><th>NIT</th><th>IMPORTE FACT./REC.</th><th>TRAMOS DE CAMBIO</th>
          <th>IMPORTE Bs./USD</th><th>I.V.A.</th><th>RC-IVA</th><th>IUE</th><th>IT</th><th>IMPORTE COSTO/GASTO</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totales-fila">
          <td colspan="7">Sumas Totales (Bs)</td>
          <td>${totalImporteFactura.toFixed(2)}</td>
          <td></td>
          <td>${totalImporteBs.toFixed(2)}</td>
          <td>${totalVat.toFixed(2)}</td>
          <td>${totalRcIva.toFixed(2)}</td>
          <td>${totalIue.toFixed(2)}</td>
          <td>${totalIt.toFixed(2)}</td>
          <td>${totalCostBs.toFixed(2)}</td>
        </tr>
        <tr class="totales-fila">
          <td colspan="9">Sumas Totales (USD)</td>
          <td>${totalImporteUsd.toFixed(2)}</td>
          <td></td><td></td><td></td>
          <td>${totalCostUsd.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <div class="zona-inferior">
      <table class="balance-table">
        <thead><tr><th>CONC.</th><th>Bs</th><th>USD</th></tr></thead>
        <tbody>
          ${balanceRows.map(([label, bsValue, usdValue]) => `
          <tr><td>${label}</td><td style="text-align:right">${bsValue.toFixed(2)}</td><td style="text-align:right">${usdValue.toFixed(2)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="observaciones">
        <p class="observaciones-titulo">OBSERVACIONES:</p>
        ${dayJustifications.length === 0
          ? '<p>—</p>'
          : dayJustifications.map((item) => {
            const label = item.fecha_justificada ? formatDate(item.fecha_justificada) : 'Hoteles'
            return `<p><strong>${label}:</strong> ${escapeHtml(item.descripcion)}</p>`
          }).join('')}
      </div>
    </div>
    <div class="firmas">
      <div class="firma-bloque"><div class="firma-linea">Preparado por</div><div class="firma-rol">Responsable</div></div>
      <div class="firma-bloque"><div class="firma-linea">Vo/ Bo</div><div class="firma-rol">Jefe de Área</div></div>
      <div class="firma-bloque"><div class="firma-linea">Vo/ Bo</div><div class="firma-rol">Gerente de Área</div></div>
      <div class="firma-bloque"><div class="firma-linea">Verificado por</div><div class="firma-rol">Contabilidad</div></div>
      <div class="firma-bloque"><div class="firma-linea">Aprobado por</div><div class="firma-rol">Gerencia Administrativa</div></div>
    </div>
  </div>
</body>
</html>`
}

// Genera el PDF de la planilla de rendicion de cuentas de un viaje aprobado
const generateStatementPdf = async (tripId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, numero_seccion, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.estado !== 'APROBADO_FINAL') {
    return {error: 'La planilla en PDF solo está disponible cuando el viaje está aprobado en su totalidad', status: 400}
  }
  const {data: expenses, error: expensesError} = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', tripId)
    .order('fecha_gasto', {ascending: true})
  if (expensesError) {
    return {error: expensesError.message, status: 500}
  }
  const {data: comments} = await supabase
    .from('Comentario')
    .select('descripcion, fecha_justificada, tipo')
    .eq('id_viaje', tripId)
    .eq('tipo', 'JUSTIFICACION')
    .order('fecha', {ascending: true})
  const dayJustifications = comments || []
  const html = generateStatementHtml(trip, expenses || [], dayJustifications)
  const pdfBuffer = await pdfService.generatePdf(html)
  return {buffer: pdfBuffer, fileName: `Rendicion_${tripId}_${(trip.motivo || 'viaje').replace(/\s+/g, '_')}.pdf`}
}

module.exports = {generateStatementPdf}
