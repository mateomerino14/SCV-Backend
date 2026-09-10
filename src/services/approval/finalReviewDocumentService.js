const pdfService = require('../shared/pdfService')

// Formatea una fecha ISO a formato dia/mes/anio
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'})
};

// Genera una fila de la tabla de gastos para el documento de rendicion
const buildExpenseRow = (expense, isInternational) => {
  let date = ''
  if (expense.fecha_gasto) {
    date = expense.fecha_gasto.split('T')[0]
  }
  const hasInvoice = !!expense.Factura
  let name = expense.Categoria_Gasto?.nombre || 'Sin categoría'
  if (hasInvoice) {
    name = expense.Proveedor?.nombre || 'Sin proveedor'
  }
  const typeLabels = {F: 'Factura', R: 'Recibo', C: 'Compra', S: 'Servicio'}
  let type = expense.tipo || ''
  if (typeLabels[expense.tipo]) {
    type = typeLabels[expense.tipo]
  }
  const amount = parseFloat(expense.monto_total || 0).toFixed(2)
  let currency = 'Bs'
  if (isInternational) {
    currency = 'USD'
  }
  return `<tr>
      <td style="padding:4px 8px;border:1px solid #ddd;">${date}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${name}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${type}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${amount} ${currency}</td>
    </tr>`
};

// Genera el HTML de la rendicion final para tesoreria
const generateRenditionHtml = (trip, reviewer, tripCode, expenses) => {
  const employee = trip.Usuario
  const today = new Date().toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})
  const period = `${formatDate(trip.fecha_inicio)} al ${formatDate(trip.fecha_fin)}`
  const nationalExpenses = (expenses || []).filter((expense) => !expense.es_gasto_internacional)
  const internationalExpenses = (expenses || []).filter((expense) => !!expense.es_gasto_internacional)
  const totalNational = nationalExpenses.reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
  const totalUsd = internationalExpenses.reduce((sum, expense) => sum + parseFloat(expense.monto_total || 0), 0)
  const assignedAmount = parseFloat(trip.monto_asignado)
  const assignedAmountUsd = parseFloat(trip.monto_asignado_usd || 0)
  const nationalBalance = assignedAmount - totalNational
  const usdBalance = assignedAmountUsd - totalUsd
  const exceedsNational = nationalBalance < 0
  const exceedsUsd = usdBalance < 0
  const isInternational = trip.tipo === 'Internacional'
  let nationalTable = '<p style="font-size:10pt;color:#666;margin-bottom:10px;">No hay gastos nacionales registrados</p>'
  if (nationalExpenses.length > 0) {
    nationalTable = `<table>
    <tr><th style="width:15%">Fecha</th><th style="width:40%">Concepto</th><th style="width:20%">Tipo</th><th style="width:25%;text-align:right">Monto</th></tr>
    ${nationalExpenses.map((expense) => buildExpenseRow(expense, false)).join('')}
  </table>`
  }
  let internationalSection = ''
  if (isInternational) {
    let internationalTable = '<p style="font-size:10pt;color:#666;margin-bottom:10px;">No hay gastos internacionales registrados</p>'
    if (internationalExpenses.length > 0) {
      internationalTable = `<table>
    <tr><th style="width:15%">Fecha</th><th style="width:40%">Concepto</th><th style="width:20%">Tipo</th><th style="width:25%;text-align:right">Monto</th></tr>
    ${internationalExpenses.map((expense) => buildExpenseRow(expense, true)).join('')}
  </table>`
    }
    internationalSection = `<div class="seccion">Gastos Internacionales (USD)</div>
  ${internationalTable}
  <div class="resumen-row"><span>Fondo asignado (USD)</span><span>USD ${assignedAmountUsd.toFixed(2)}</span></div>
  <div class="resumen-row"><span>Total gastado (USD)</span><span>USD ${totalUsd.toFixed(2)}</span></div>
  <div class="resumen-total" style="color:${exceedsUsd ? '#870002' : '#155724'}">
    <span>${exceedsUsd ? 'Exceso a reembolsar (USD)' : 'Saldo a devolver (USD)'}</span>
    <span>USD ${Math.abs(usdBalance).toFixed(2)}</span>
  </div>`
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; padding: 36px 50px; line-height: 1.3; }
  .logo { font-size: 16pt; font-weight: bold; margin-bottom: 6px; }
  .titulo { font-size: 17pt; font-weight: bold; text-align: center; letter-spacing: 2px; margin: 18px 0 20px; }
  .seccion { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 6px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 10px; }
  th { background: #f0f0f0; padding: 5px 8px; border: 1px solid #ddd; text-align: left; font-size: 10pt; }
  .resumen-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11pt; }
  .resumen-total { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12pt; font-weight: bold; border-top: 2px solid #000; margin-top: 4px; }
  .firma-area { margin-top: 50px; text-align: center; }
  .firma-nombre { font-size: 11pt; font-weight: bold; }
  .firma-cargo { font-size: 10pt; text-transform: uppercase; }
</style>
</head><body>
  <div class="logo">MAXAM FANEXA</div>
  <div class="titulo">RENDICIÓN DE GASTOS — APROBACIÓN FINAL</div>
  <div class="seccion">Datos del Viaje</div>
  <table>
    <tr><th style="width:35%">Código</th><td style="padding:4px 8px;border:1px solid #ddd;">${tripCode}</td></tr>
    <tr><th>Empleado</th><td style="padding:4px 8px;border:1px solid #ddd;">${employee?.nombre} ${employee?.apellido_paterno}</td></tr>
    <tr><th>Cargo</th><td style="padding:4px 8px;border:1px solid #ddd;">${employee?.Cargo?.nombre || ''}</td></tr>
    <tr><th>Motivo</th><td style="padding:4px 8px;border:1px solid #ddd;">${trip.motivo}</td></tr>
    <tr><th>Origen</th><td style="padding:4px 8px;border:1px solid #ddd;">${trip.origen || '—'}</td></tr>
    <tr><th>Destino</th><td style="padding:4px 8px;border:1px solid #ddd;">${trip.destino}</td></tr>
    <tr><th>Período</th><td style="padding:4px 8px;border:1px solid #ddd;">${period}</td></tr>
    <tr><th>Tipo de Viaje</th><td style="padding:4px 8px;border:1px solid #ddd;">${trip.tipo}</td></tr>
    <tr><th>Transporte</th><td style="padding:4px 8px;border:1px solid #ddd;">${trip.transporte || '—'}</td></tr>
    <tr><th>Fecha Aprobación Final</th><td style="padding:4px 8px;border:1px solid #ddd;">${today}</td></tr>
    <tr><th>Revisado y aprobado por</th><td style="padding:4px 8px;border:1px solid #ddd;">${reviewer?.nombre} ${reviewer?.apellido_paterno}</td></tr>
  </table>
  <div class="seccion">Gastos Nacionales (Bs)</div>
  ${nationalTable}
  <div class="resumen-row"><span>Fondo asignado (Bs)</span><span>Bs. ${assignedAmount.toFixed(2)}</span></div>
  <div class="resumen-row"><span>Total gastado (Bs)</span><span>Bs. ${totalNational.toFixed(2)}</span></div>
  <div class="resumen-total" style="color:${exceedsNational ? '#870002' : '#155724'}">
    <span>${exceedsNational ? 'Exceso a reembolsar (Bs)' : 'Saldo a devolver (Bs)'}</span>
    <span>Bs. ${Math.abs(nationalBalance).toFixed(2)}</span>
  </div>
  ${internationalSection}
  <div class="firma-area">
    <div class="firma-nombre">${reviewer?.nombre} ${reviewer?.apellido_paterno}</div>
    <div class="firma-cargo">REVISOR — MAXAM FANEXA</div>
  </div>
</body></html>`
};

// Genera el HTML del resultado de la rendicion para el empleado
const generateEmployeeResultHtml = (trip, tripCode, summary) => {
  const employee = trip.Usuario
  let internationalBlock = ''
  if (summary.isInternational) {
    internationalBlock = `
    <div class="resultado-fila" style="margin-top:12px;"><span>Fondo asignado (USD)</span><span>USD ${parseFloat(trip.monto_asignado_usd || 0).toFixed(2)}</span></div>
    <div class="resultado-fila"><span>Total gastado (USD)</span><span>USD ${summary.totalUsd.toFixed(2)}</span></div>
    <div class="resultado-fila total" style="color:${summary.exceedsUsd ? '#870002' : '#155724'}">
      <span>${summary.exceedsUsd ? 'Monto a reembolsarle (USD)' : 'Monto que debe devolver (USD)'}</span>
      <span>USD ${Math.abs(summary.usdBalance).toFixed(2)}</span>
    </div>`
  }
  let closingText = 'Por favor coordina con Tesorería la devolución del saldo pendiente.'
  if (summary.exceedsNational || summary.exceedsUsd) {
    closingText = 'Tesorería se pondrá en contacto para coordinar el reembolso correspondiente.'
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; background: #fff; padding: 40px 60px; line-height: 1.4; }
  .logo-area { font-size: 18pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 24px; }
  .titulo { font-size: 18pt; font-weight: bold; text-align: center; letter-spacing: 1px; margin-bottom: 24px; }
  .cuerpo { text-align: justify; font-size: 12pt; margin-bottom: 14px; }
  .resultado-box { border: 2px solid #000; padding: 16px; margin: 20px 0; }
  .resultado-fila { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12pt; }
  .resultado-fila.total { font-weight: bold; font-size: 13pt; border-top: 1px solid #000; padding-top: 8px; margin-top: 4px; }
</style>
</head><body>
  <div class="logo-area">MAXAM FANEXA</div>
  <div class="titulo">RESULTADO DE RENDICIÓN DE CUENTAS</div>
  <p class="cuerpo">Estimado(a) ${employee?.nombre} ${employee?.apellido_paterno},</p>
  <p class="cuerpo">Le informamos que la rendición de gastos correspondiente al viaje ${tripCode} (${trip.motivo}) ha sido aprobada de forma definitiva.</p>
  <div class="resultado-box">
    <div class="resultado-fila"><span>Fondo asignado (Bs)</span><span>Bs. ${parseFloat(trip.monto_asignado).toFixed(2)}</span></div>
    <div class="resultado-fila"><span>Total gastado (Bs)</span><span>Bs. ${summary.totalNational.toFixed(2)}</span></div>
    <div class="resultado-fila total" style="color:${summary.exceedsNational ? '#870002' : '#155724'}">
      <span>${summary.exceedsNational ? 'Monto a reembolsarle (Bs)' : 'Monto que debe devolver (Bs)'}</span>
      <span>Bs. ${Math.abs(summary.nationalBalance).toFixed(2)}</span>
    </div>
    ${internationalBlock}
  </div>
  <p class="cuerpo">${closingText}</p>
</body></html>`
};

module.exports = {formatDate, generateRenditionHtml, generateEmployeeResultHtml, generatePdf: pdfService.generatePdf};