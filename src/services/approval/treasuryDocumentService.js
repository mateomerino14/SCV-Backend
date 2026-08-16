const pdfService = require('../shared/pdfService')

// Genera el HTML de confirmacion de fondo asignado
const generateFundConfirmationHtml = (trip, treasurer, tripCode) => {
  const employee = trip.Usuario
  const today = new Date().toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})
  const isInternational = trip.tipo === 'Internacional'
  let internationalRow = ''
  if (isInternational) {
    internationalRow = `<div class="montos-fila"><span>Fondo Internacional (USD)</span><span><strong>USD ${parseFloat(trip.monto_asignado_usd || 0).toFixed(2)}</strong></span></div>`
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; background: #fff; padding: 40px 60px; line-height: 1.4; }
  .logo-area { font-size: 18pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 24px; }
  .titulo { font-size: 18pt; font-weight: bold; text-align: center; letter-spacing: 1px; margin-bottom: 24px; }
  .cuerpo { text-align: justify; font-size: 12pt; margin-bottom: 14px; }
  .montos-box { border: 1px solid #000; padding: 16px; margin: 20px 0; }
  .montos-fila { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12pt; }
  .firma-area { margin-top: 40px; text-align: center; }
  .firma-nombre { font-size: 11pt; font-weight: bold; }
  .firma-cargo { font-size: 10pt; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="logo-area">MAXAM FANEXA</div>
  <div class="titulo">CONFIRMACIÓN DE FONDO ASIGNADO</div>
  <p class="cuerpo">Estimado(a) ${employee?.nombre} ${employee?.apellido_paterno},</p>
  <p class="cuerpo">Le confirmamos que el fondo correspondiente al viaje ${tripCode} (${trip.motivo}) ha sido aprobado por Tesorería con fecha ${today}. Ya puede proceder a registrar sus gastos.</p>
  <div class="montos-box">
    <div class="montos-fila"><span>Fondo Nacional (Bs)</span><span><strong>Bs. ${parseFloat(trip.monto_asignado).toFixed(2)}</strong></span></div>
    ${internationalRow}
  </div>
  <p class="cuerpo">Cualquier consulta adicional puede dirigirla a Tesorería.</p>
  <div class="firma-area">
    <div class="firma-nombre">${treasurer?.nombre} ${treasurer?.apellido_paterno}</div>
    <div class="firma-cargo">TESORERÍA — MAXAM FANEXA</div>
  </div>
</body>
</html>`
};

module.exports = {generateFundConfirmationHtml, generatePdf: pdfService.generatePdf};