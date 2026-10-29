const fs = require('fs');
const path = require('path');
const pdfService = require('../shared/pdfService');
const {escapeDeep} = require('../../utils/htmlEscape');

const logoDataUri = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, '../../assets/logo-maxam-fanexa.jpg')).toString('base64')}`;
const longDateFormat = {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/La_Paz'};

// Formatea una fecha ISO (AAAA-MM-DD) como dia/mes/año
const formatDate = (isoString) => {
  const [year, month, day] = isoString.split('-');
  return `${day}/${month}/${year}`;
};

// Cuenta los dias del viaje contando el de salida y el de regreso
const countDays = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86400000) + 1;
};

// Formatea un monto con dos decimales y separador de miles
const formatAmount = (value) => (parseFloat(value) || 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2});

// Nombre completo del empleado con sus dos apellidos si los tiene
const fullNameOf = (person) => [person?.nombre, person?.apellido_paterno, person?.apellido_materno].filter(Boolean).join(' ');

// Texto de lo que se solicita comprar segun el medio de transporte del viaje
const purchaseTextOf = (trip) => {
  const transport = (trip.transporte || '').toLowerCase();
  if (transport.includes('aéreo') || transport.includes('aereo')) {
    return 'Se solicita la compra de los pasajes aéreos correspondientes al trayecto indicado.';
  }
  if (transport.includes('vehículo de empresa') || transport.includes('vehiculo de empresa')) {
    let text = `Se autoriza el uso del vehículo de la empresa con placa ${trip.placa_vehiculo || ''}`;
    if (parseFloat(trip.monto_combustible) > 0) {
      text += ` y se solicita el fondo de Bs ${formatAmount(trip.monto_combustible)} para combustible`;
    }
    return `${text}.`;
  }
  return 'Se solicita la compra de los pasajes terrestres correspondientes al trayecto indicado.';
};

// Texto de quien reserva el hospedaje
const lodgingTextOf = (trip) => {
  if (trip.gestion_hospedaje === 'Empresa') {
    return 'La empresa reserva el hospedaje';
  }
  return 'El empleado gestiona su hospedaje';
};

// Filas de la tabla de datos del viaje
const tripRowsOf = (trip) => {
  const rows = [
    ['Ruta', `${trip.origen || '—'} → ${trip.destino}`],
    ['Fechas', `Del ${formatDate(trip.fecha_inicio)} al ${formatDate(trip.fecha_fin)} (${countDays(trip.fecha_inicio, trip.fecha_fin)} días)`],
    ['Tipo de viaje', trip.tipo],
    ['Transporte', trip.transporte || 'Terrestre'],
  ];
  if (trip.placa_vehiculo) {
    rows.push(['Vehículo', trip.placa_vehiculo]);
  }
  rows.push(['Hospedaje', lodgingTextOf(trip)]);
  let fund = `Bs ${formatAmount(trip.monto_asignado)}`;
  if (parseFloat(trip.monto_asignado_usd) > 0) {
    fund += ` y USD ${formatAmount(trip.monto_asignado_usd)}`;
  }
  rows.push(['Fondo asignado', fund]);
  if (parseFloat(trip.monto_combustible) > 0) {
    rows.push(['De ese fondo, combustible', `Bs ${formatAmount(trip.monto_combustible)}`]);
  }
  return rows;
};

// Genera el HTML del memorandum de aprobacion de un viaje con membrete de MAXAM FANEXA
const generateMemoHtml = (rawTrip, rawApprover, rawTripCode) => {
  const trip = escapeDeep(rawTrip);
  const approver = escapeDeep(rawApprover);
  const [tripCode] = escapeDeep([rawTripCode]);
  const employee = trip.Usuario || {};
  const today = new Date().toLocaleDateString('es-ES', longDateFormat);
  const rows = tripRowsOf(trip).map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('');
  let signature = `<div class="firma-linea"></div>
      <div class="firma-nombre">${fullNameOf(approver)}</div>
      <div class="firma-cargo">${approver?.Cargo?.nombre || 'Aprobador'}</div>`;
  if (approver?.aprobacionAutomatica) {
    signature = `<div class="firma-nombre">Aprobación automática</div>
      <div class="firma-cargo">Sistema de Control de Viáticos</div>
      <div class="firma-nota">El titular del viaje es el aprobador; esta etapa se aprobó automáticamente.</div>`;
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10.5pt; color: #262626; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { padding: 34px 48px 28px; min-height: 100vh; display: flex; flex-direction: column; }
  .membrete { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 3px solid #e30613; }
  .membrete img { height: 34px; }
  .membrete-datos { text-align: right; font-size: 8pt; color: #595959; line-height: 1.5; }
  .titulo-bloque { margin: 26px 0 18px; display: flex; align-items: flex-end; justify-content: space-between; }
  .titulo { font-size: 22pt; font-weight: 800; letter-spacing: 4px; color: #404040; }
  .ref { font-size: 9pt; color: #595959; text-align: right; line-height: 1.6; }
  .ref strong { color: #262626; }
  .encabezado { display: grid; grid-template-columns: 70px 1fr; row-gap: 5px; font-size: 10pt; margin-bottom: 18px; padding: 12px 14px; background: #f5f5f5; border-left: 4px solid #e30613; border-radius: 2px; }
  .encabezado span:nth-child(odd) { font-weight: 700; color: #595959; }
  .cuerpo { text-align: justify; line-height: 1.6; margin-bottom: 12px; }
  .datos { width: 100%; border-collapse: collapse; margin: 6px 0 16px; font-size: 9.5pt; }
  .datos th { width: 32%; text-align: left; font-weight: 700; color: #404040; background: #f5f5f5; padding: 7px 10px; border-bottom: 1px solid #e0e0e0; }
  .datos td { padding: 7px 10px; border-bottom: 1px solid #e0e0e0; }
  .firma { margin-top: 46px; text-align: center; }
  .firma-linea { width: 220px; margin: 0 auto 6px; border-top: 1px solid #404040; }
  .firma-nombre { font-weight: 700; font-size: 10.5pt; }
  .firma-cargo { font-size: 9pt; color: #595959; text-transform: uppercase; letter-spacing: .5px; }
  .firma-nota { font-size: 8pt; color: #7f7f7f; margin-top: 4px; }
  .pie { margin-top: auto; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 7.5pt; color: #7f7f7f; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="pagina">
    <div class="membrete">
      <img src="${logoDataUri}" alt="MAXAM FANEXA">
      <div class="membrete-datos">MAXAM FANEXA<br>Sistema de Control de Viáticos</div>
    </div>
    <div class="titulo-bloque">
      <div class="titulo">MEMORÁNDUM</div>
      <div class="ref"><strong>Ref.</strong> ${tripCode}<br>Cochabamba, ${today}</div>
    </div>
    <div class="encabezado">
      <span>Para:</span><span>${fullNameOf(employee)}${employee.Cargo?.nombre ? ` — ${employee.Cargo.nombre}` : ''}</span>
      <span>Copia:</span><span>Tesorería, Recursos Humanos y Administración</span>
      <span>Asunto:</span><span>Autorización de viaje ${tripCode}</span>
    </div>
    <p class="cuerpo">Se autoriza el viaje de <strong>${fullNameOf(employee)}</strong>${employee.Cargo?.nombre ? `, ${employee.Cargo.nombre}` : ''}, con motivo de ${trip.motivo}, con los siguientes datos:</p>
    <table class="datos">${rows}</table>
    <p class="cuerpo">${purchaseTextOf(trip)} Se solicita también la asignación del fondo a rendir indicado.</p>
    <div class="firma">${signature}</div>
    <div class="pie"><span>MAXAM FANEXA — Documento generado por el Sistema de Control de Viáticos</span><span>${tripCode}</span></div>
  </div>
</body>
</html>`;
};

// Genera el PDF del memorandum a partir de su HTML
const generateMemoPdf = async (html) => {
  const options = {format: 'A4', margin: {top: '8mm', bottom: '8mm', left: '8mm', right: '8mm'}};
  return await pdfService.generatePdf(html, options);
};

module.exports = {generateMemoHtml, generateMemoPdf};
