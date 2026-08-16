const htmlPdf = require('html-pdf-node')

// Formatea una fecha ISO a formato dia/mes/anio
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-')
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'})
};

// Genera el HTML del memorandum de aprobacion de un viaje
const generateMemoHtml = (trip, approver, tripCode) => {
  const employee = trip.Usuario
  const today = new Date().toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})
  const period = `${formatDate(trip.fecha_inicio)} al ${formatDate(trip.fecha_fin)}`
  const transport = (trip.transporte || '').toLowerCase()
  const isAirTravel = transport.includes('aéreo') || transport.includes('aereo')
  let ticketsText = 'Asimismo, se autoriza la compra de pasajes terrestres correspondientes al trayecto indicado.'
  if (isAirTravel) {
    ticketsText = 'Asimismo, se autoriza la compra de pasajes aéreos correspondientes al trayecto indicado.'
  }
  let originText = ''
  if (trip.origen) {
    originText = ` partiendo desde ${trip.origen}`
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; background: #fff; padding: 40px 60px; line-height: 1.15; }
  .logo-area { font-size: 18pt; font-weight: bold; color: #000; letter-spacing: 1px; margin-bottom: 30px; }
  .titulo { font-size: 20pt; font-weight: bold; text-align: center; letter-spacing: 2px; margin-bottom: 24px; }
  .ref-block { text-align: left; margin-left: auto; margin-bottom: 20px; max-width: 45%; font-size: 11pt; line-height: 1.6; font-style: italic; }
  .asunto { font-style: italic; font-size: 12pt; margin-bottom: 20px; }
  .cuerpo { text-align: justify; font-size: 12pt; line-height: 1.5; margin-bottom: 16px; font-style: italic; }
  .despedida { margin-top: 20px; font-size: 12pt; margin-bottom: 40px; font-style: italic; }
  .firma-area { margin-top: 20px; text-align: center; }
  .firma-nombre { font-size: 12pt; font-weight: bold; font-style: italic; }
  .firma-cargo { font-size: 11pt; text-transform: uppercase; font-style: italic; }
</style>
</head>
<body>
  <div class="logo-area">MAXAM FANEXA</div>
  <div class="titulo">MEMORANDUM</div>
  <div class="ref-block">
    <strong>Ref.</strong> ${tripCode}<br><br>
    Cochabamba,<br>${today}<br><br>
    ${employee?.nombre} ${employee?.apellido_paterno}<br>
    ${employee?.Cargo?.nombre || ''}
  </div>
  <div class="asunto">Señor Gerente:</div>
  <p class="cuerpo">Por instrucciones de la Gerencia General, me permito comunicarle que el viaje registrado bajo el código ${tripCode}, con motivo de ${trip.motivo}, correspondiente al período del ${period} con destino a ${trip.destino}${originText}, ha sido aprobado satisfactoriamente por esta instancia.</p>
  <p class="cuerpo">Se solicita proceder con los trámites administrativos y financieros correspondientes para la asignación y ejecución del fondo a rendir.</p>
  <p class="cuerpo">${ticketsText}</p>
  <p class="cuerpo">El presente memorandum tiene carácter oficial y forma parte del expediente de rendición de cuentas del empleado mencionado.</p>
  <div class="despedida">Sin otro particular, reciba un cordial saludo.</div>
  <div class="firma-area">
    <div class="firma-nombre">${approver?.nombre} ${approver?.apellido_paterno}</div>
    <div class="firma-cargo">APROBADOR — MAXAM FANEXA</div>
  </div>
</body>
</html>`
};

// Genera el PDF del memorandum a partir de su HTML
const generateMemoPdf = async (html) => {
  const file = {content: html}
  const options = {format: 'A4', margin: {top: '10mm', bottom: '10mm', left: '10mm', right: '10mm'}}
  return await htmlPdf.generatePdf(file, options)
};

module.exports = {generateMemoHtml, generateMemoPdf};