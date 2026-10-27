const supabase = require('../../config/supabase');
const pdfService = require('../shared/pdfService');
const tripCodeUtil = require('../../utils/tripCode');
const {escapeDeep} = require('../../utils/htmlEscape');
const {getExpenseRetentions, hasOriginCurrencyLines} = require('../../utils/retentions');
const {formatReceiptNumber} = require('../expense/receiptNumberService');
const {amountInBsOf, originalAmountLinesOf, summarizeStatement} = require('../../utils/expenseCurrency');

const vatRate = 0.13;

// Blanquea el placeholder que usa la IA cuando no logra extraer un dato
const cleanValue = (value) => {
  if (value === 'No Especificado') {
    return '';
  }
  return value || '';
};

const symbologyRows = [
  ['F', 'Compra Bien/Servicio c/factura'],
  ['C', 'Compra de Bien sin factura'],
  ['A', 'Servicio, Alquiler sin factura'],
  ['R', 'Docto. sin IVA, sin Retencion'],
];

// Normaliza el texto vacio; los datos ya llegan escapados (escapeDeep)
const escapeHtml = (text) => text || '';

// Extrae la cuenta contable de Oracle a partir del nombre de la categoria
const extractOracleAccount = (categoryName) => {
  if (!categoryName) {
    return '';
  }
  const match = categoryName.match(/^(\d{6})\s+(.+)$/);
  if (!match) {
    return categoryName;
  }
  return `${match[1]} ${match[2]}`;
};

// Traduce el tipo interno del gasto al codigo de simbologia de Oracle
const toOracleExpenseType = (internalType) => {
  if (internalType === 'S') {
    return 'A';
  }
  return internalType;
};

// Calcula el desglose fiscal de un gasto
const getExpenseTaxValues = (expense) => {
  const isInternational = !!expense.es_gasto_internacional;
  const amount = parseFloat(expense.monto_total) || 0;
  const hasInvoice = !!expense.Factura;
  if (isInternational) {
    return {vat: 0, rcIva: 0, iue: 0, it: 0, cost: amount};
  }
  if (expense.tiene_alcohol) {
    return {vat: 0, rcIva: 0, iue: 0, it: 0, cost: amount};
  }
  if (hasInvoice) {
    // Solo la factura (F) genera credito fiscal; el recibo (R) no lleva IVA
    if (expense.tipo !== 'F') {
      return {vat: 0, rcIva: 0, iue: 0, it: 0, cost: amount};
    }
    // El IVA es el 13% del total y se resta del costo, porque queda como credito fiscal
    const vat = parseFloat((amount * vatRate).toFixed(2));
    return {vat, rcIva: 0, iue: 0, it: 0, cost: parseFloat((amount - vat).toFixed(2))};
  }
  const retentions = getExpenseRetentions(expense);
  return {vat: 0, rcIva: retentions.retencion_rc_iva, iue: retentions.retencion_iue, it: retentions.retencion_it, cost: retentions.importe_costo};
};

// Arma la descripcion visible de un gasto segun tenga factura o subitems
const getExpenseDescription = (expense) => {
  const hasInvoice = !!expense.Factura;
  if (hasInvoice) {
    const products = (expense.Factura?.Detalle_Factura || [])
      .map((detail) => `${cleanValue(detail.nombre_producto)}${detail.cantidad ? ` x${detail.cantidad}` : ''}`)
      .join(', ');
    return escapeHtml((products || expense.descripcion || `Factura N° ${cleanValue(expense.Factura?.numero_factura)}`).toUpperCase());
  }
  const subitems = expense.Gasto_Subitem || [];
  if (subitems.length > 0) {
    let lineCurrency = '';
    if (hasOriginCurrencyLines(expense)) {
      lineCurrency = ` ${expense.moneda}`;
    }
    return escapeHtml(subitems.map((subitem) => `${subitem.descripcion}: ${parseFloat(subitem.monto).toFixed(2)}${lineCurrency}`).join(', ').toUpperCase());
  }
  return escapeHtml((expense.descripcion || expense.Categoria_Gasto?.nombre || '').toUpperCase());
};

// Texto del monto original de un gasto internacional, una linea por dato
const buildOriginalAmountText = (expense) => originalAmountLinesOf(expense).join('<br>');

// Formatea una fecha a dia/mes/anio
const formatDate = (dateInput) => {
  if (!dateInput) {
    return '';
  }
  // Las fechas YYYY-MM-DD se formatean tal cual para no correrlas un dia por UTC
  const dateOnly = String(dateInput).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const date = new Date(dateInput);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Deja solo la justificacion mas reciente de cada dia (y la de hoteles al final)
const latestJustificationPerDay = (comments) => {
  const byDay = new Map();
  comments.forEach((comment) => {
    const key = comment.fecha_justificada || 'HOTEL';
    if (!byDay.has(key)) {
      byDay.set(key, comment);
    }
  });
  return [...byDay.values()].sort((first, second) => {
    if (!first.fecha_justificada) {
      return 1;
    }
    if (!second.fecha_justificada) {
      return -1;
    }
    return String(first.fecha_justificada).localeCompare(String(second.fecha_justificada));
  });
};

// Numero del documento del gasto: el de la factura, el del recibo original o, si no lo tiene, el que le asigno el sistema
const documentNumberOf = (expense, tripReceipts) => {
  if (expense.Factura) {
    return {number: cleanValue(expense.Factura.numero_factura), isSystem: false};
  }
  const original = String(expense.numero_recibo || '').trim();
  if (original) {
    return {number: original, isSystem: false};
  }
  const ownReceipt = (expense.Recibo || [])[0];
  if (ownReceipt) {
    return {number: formatReceiptNumber(ownReceipt.numero), isSystem: true};
  }
  const grouped = (tripReceipts || []).find((receipt) => !receipt.id_gasto && receipt.tipo === expense.tipo && !!receipt.es_gasto_internacional === !!expense.es_gasto_internacional);
  if (grouped) {
    return {number: formatReceiptNumber(grouped.numero), isSystem: true};
  }
  return {number: '', isSystem: false};
};

const fundLabel = 'SALDO ANTERIOR FONDO RECIBIDO';

// Filas del fondo recibido antes de los gastos: en Bs, y en un viaje internacional tambien en USD
const buildFundRows = (isInternationalTrip, fundBs, fundUsd) => {
  let funds = [[fundLabel, fundBs.toFixed(2)]];
  if (isInternationalTrip) {
    funds = [[`${fundLabel} (Bs)`, `${fundBs.toFixed(2)} Bs`], [`${fundLabel} (USD)`, `${fundUsd.toFixed(2)} USD`]];
  }
  let originalCell = '';
  if (isInternationalTrip) {
    originalCell = '<td></td>';
  }
  return funds.map(([label, value]) => `
    <tr class="fila-fondo">
      <td></td><td></td><td></td><td class="col-detalle">${label}</td><td></td><td></td><td></td><td></td>${originalCell}
      <td class="col-importe">${value}</td><td></td><td></td><td></td><td></td><td></td>
    </tr>`).join('');
};

// Clase de la celda del documento: en lila si el numero lo asigno el sistema
const documentClassOf = (documentInfo) => {
  if (documentInfo.isSystem) {
    return 'col-doc doc-sistema';
  }
  return 'col-doc';
};

// Filas de la tabla de justificaciones de excesos; sin justificaciones, una fila que lo indica
const buildJustificationRows = (dayJustifications) => {
  if (dayJustifications.length === 0) {
    return '<tr><td colspan="2" style="text-align:center">Sin excesos que justificar</td></tr>';
  }
  return dayJustifications.map((item) => {
    let label = 'Hoteles';
    if (item.fecha_justificada) {
      label = formatDate(item.fecha_justificada);
    }
    return `<tr><td class="justificaciones-fecha"><strong>${label}</strong></td><td>${escapeHtml(item.descripcion)}</td></tr>`;
  }).join('');
};

// Genera el HTML de la planilla de rendicion de cuentas
const generateStatementHtml = (rawTrip, rawExpenses, rawJustifications) => {
  const trip = escapeDeep(rawTrip);
  const expenses = escapeDeep(rawExpenses);
  const dayJustifications = escapeDeep(rawJustifications);
  const employee = trip.Usuario;
  const responsable = `${employee?.nombre || ''} ${employee?.apellido_paterno || ''}`.trim().toUpperCase();
  const cargo = employee?.Cargo?.nombre?.toUpperCase() || '';
  const costCenter = employee?.Seccion?.nombre || '';
  const isInternationalTrip = trip.tipo === 'Internacional';

  let totalImporteBs = 0;
  let totalVat = 0;
  let totalRcIva = 0;
  let totalIue = 0;
  let totalIt = 0;
  let totalCostBs = 0;

  const rows = expenses.map((expense, index) => {
    const amount = parseFloat(expense.monto_total) || 0;
    const isInternational = !!expense.es_gasto_internacional;
    const {vat, rcIva, iue, it, cost} = getExpenseTaxValues(expense);
    const oracleValue = escapeHtml(extractOracleAccount(expense.Categoria_Gasto?.nombre));
    const oracleType = toOracleExpenseType(expense.tipo);
    const detailText = getExpenseDescription(expense);
    const amountBs = amountInBsOf(expense);
    const documentInfo = documentNumberOf(expense, trip.Recibo);
    let rowClass = 'fila-nacional';
    if (isInternational) {
      rowClass = 'fila-internacional';
    }
    // Un gasto internacional antiguo sin tipo de cambio a Bs se muestra en USD y no entra en las sumas en Bs
    let amountText = `${amount.toFixed(2)} USD`;
    let costText = amountText;
    if (amountBs !== null) {
      amountText = amountBs.toFixed(2);
      costText = cost.toFixed(2);
      if (isInternational) {
        costText = amountBs.toFixed(2);
        totalCostBs += amountBs;
      }
      else {
        totalCostBs += cost;
      }
      totalImporteBs += amountBs;
    }
    totalVat += vat;
    totalRcIva += rcIva;
    totalIue += iue;
    totalIt += it;
    return `
    <tr class="${rowClass}">
      <td class="col-n">${index + 1}</td>
      <td class="col-fecha">${formatDate(expense.Factura?.fecha_emision || expense.fecha_gasto)}</td>
      <td class="col-oracle">${oracleValue}</td>
      <td class="col-detalle">${detailText}</td>
      <td class="col-tipo">${oracleType}</td>
      <td class="${documentClassOf(documentInfo)}">${escapeHtml(documentInfo.number)}</td>
      <td class="col-nit">${escapeHtml(cleanValue(expense.Proveedor?.numero_doc_fiscal))}</td>
      <td class="col-importe-fact">${amountText}</td>
      ${isInternationalTrip ? `<td class="col-original">${buildOriginalAmountText(expense)}</td>` : ''}
      <td class="col-importe"></td>
      <td class="col-num">${vat.toFixed(2)}</td>
      <td class="col-num">${rcIva.toFixed(2)}</td>
      <td class="col-num">${iue.toFixed(2)}</td>
      <td class="col-num">${it.toFixed(2)}</td>
      <td class="col-num">${costText}</td>
    </tr>`;
  }).join('');

  const {internationalUsd, balanceRows} = summarizeStatement(trip, expenses);
  const [, fundBs, fundUsd] = balanceRows[0];
  const fundRows = buildFundRows(isInternationalTrip, fundBs, fundUsd);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: landscape; margin: 0; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  table.principal th { background: #cfe2f3; color: #000; font-weight: bold; border: 1px solid #1b4f91; padding: 3px; font-size: 7pt; text-align: center; }
  table.principal td { border: 1px solid #b0c4d4; padding: 3px 4px; font-size: 7.5pt; }
  .fila-nacional { background: #f4f9fd; }
  .fila-internacional { background: #fdeeee; }
  .col-n { text-align: center; width: 2%; }
  .col-fecha { text-align: center; width: 6%; }
  .col-oracle { width: 12%; }
  .col-detalle { width: 18%; }
  .col-tipo { text-align: center; width: 5%; }
  .col-doc { text-align: center; width: 8%; }
  .doc-sistema { background: #e4dfec; color: #5b3fa0; font-weight: bold; }
  .leyenda-doc { font-size: 7pt; margin: -4px 0 8px; display: flex; align-items: center; gap: 6px; }
  .leyenda-doc span:first-child { display: inline-block; width: 24px; height: 10px; background: #e4dfec; border: 1px solid #b0c4d4; }
  .col-nit { text-align: center; width: 6%; }
  .col-importe-fact { text-align: right; width: 8%; }
  .fila-fondo td { background: #eaf3fb; font-weight: bold; }
  .col-original { width: 12%; font-size: 6.5pt; }
  .col-importe { text-align: right; width: 7%; }
  .col-num { text-align: right; width: 5%; }
  .totales-fila td { background: #bfe0f5; font-weight: bold; text-align: right; }
  .totales-fila td:first-child { text-align: left; }
  .zona-inferior { display: flex; gap: 16px; margin-bottom: 10px; }
  .balance-table { width: 45%; border-collapse: collapse; }
  .balance-table th { background: #cfe2f3; color: #000; font-weight: bold; padding: 3px; font-size: 7.5pt; }
  .balance-table td { border: 1px solid #b0c4d4; padding: 3px 8px; font-size: 8pt; }
  .justificaciones { flex: 1; border-collapse: collapse; align-self: flex-start; }
  .justificaciones th { background: #cfe2f3; color: #000; font-weight: bold; padding: 3px 6px; font-size: 7.5pt; border: 1px solid #1b4f91; text-align: left; }
  .justificaciones .justificaciones-titulo { background: #4a90d9; color: #fff; font-size: 8pt; }
  .justificaciones td { border: 1px solid #b0c4d4; padding: 3px 6px; font-size: 8pt; vertical-align: top; }
  .justificaciones .justificaciones-fecha { width: 70px; text-align: center; }
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
      <span class="info-label">MEMORANDUM:</span><span>${tripCodeUtil.buildTripCode(trip)}</span>
      <span class="info-label">FECHA:</span><span>${formatDate(trip.fecha_inicio)}</span>
      <span class="info-label">MOTIVO:</span><span>${escapeHtml(trip.motivo?.toUpperCase() || '')}</span>
      <span class="info-label">SECCIÓN:</span><span>${escapeHtml(costCenter)}</span>
    </div>
    <table class="principal">
      <thead>
        <tr>
          <th>N°</th><th>FECHA</th><th>CUENTA/ORACLE</th><th>DETALLE</th><th>TIPO GASTO</th>
          <th>N° DOCUMENTO</th><th>NIT</th><th>IMPORTE FACT./REC.</th>
          ${isInternationalTrip ? '<th>MONTO ORIGINAL</th>' : ''}<th>IMPORTE</th><th>I.V.A.</th><th>RC-IVA</th><th>IUE</th><th>IT</th><th>IMPORTE COSTO/GASTO</th>
        </tr>
      </thead>
      <tbody>
        ${fundRows}
        ${rows}
        <tr class="totales-fila">
          <td colspan="7">Sumas Totales (Bs)</td>
          <td>${totalImporteBs.toFixed(2)}</td>
          ${isInternationalTrip ? '<td></td>' : ''}
          <td>${fundBs.toFixed(2)}</td>
          <td>${totalVat.toFixed(2)}</td>
          <td>${totalRcIva.toFixed(2)}</td>
          <td>${totalIue.toFixed(2)}</td>
          <td>${totalIt.toFixed(2)}</td>
          <td>${totalCostBs.toFixed(2)}</td>
        </tr>
        ${isInternationalTrip ? `
        <tr class="totales-fila">
          <td colspan="7">Gastos internacionales en USD, para Oracle</td>
          <td>${internationalUsd.toFixed(2)} USD</td>
          <td></td>
          <td>${fundUsd.toFixed(2)} USD</td>
          <td colspan="5"></td>
        </tr>` : ''}
      </tbody>
    </table>
    <p class="leyenda-doc"><span></span><span>N° DOCUMENTO en lila: número de recibo que asignó el sistema, porque el gasto no tiene recibo original. Sin color: número de la factura o del recibo original.</span></p>
    <div class="zona-inferior">
      <table class="balance-table">
        <thead><tr><th>CONC.</th><th>Bs</th>${isInternationalTrip ? '<th>USD</th>' : ''}</tr></thead>
        <tbody>
          ${balanceRows.map(([label, bsValue, usdValue]) => `
          <tr><td>${label}</td><td style="text-align:right">${bsValue.toFixed(2)}</td>${isInternationalTrip ? `<td style="text-align:right">${usdValue.toFixed(2)}</td>` : ''}</tr>`).join('')}
        </tbody>
      </table>
      <table class="justificaciones">
        <thead>
          <tr><th colspan="2" class="justificaciones-titulo">JUSTIFICACIONES DE EXCESOS</th></tr>
          <tr><th class="justificaciones-fecha">FECHA</th><th>JUSTIFICACIÓN</th></tr>
        </thead>
        <tbody>
          ${buildJustificationRows(dayJustifications)}
        </tbody>
      </table>
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
</html>`;
};

// Genera el PDF de la planilla de rendicion de cuentas de un viaje aprobado
const generateStatementPdf = async (tripId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, Seccion(nombre), Cargo(nombre)), Recibo(numero, tipo, es_gasto_internacional, id_gasto)')
    .eq('id_viaje', tripId)
    .single();
  if (tripError) {
    return {error: tripError.message, status: 500};
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404};
  }
  if (trip.estado !== 'APROBADO_FINAL') {
    return {error: 'La planilla en PDF solo está disponible cuando el viaje está aprobado en su totalidad', status: 400};
  }
  const {data: expenses, error: expensesError} = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto), Recibo(numero)')
    .eq('id_viaje', tripId)
    .order('fecha_gasto', {ascending: true}).order('id_gasto', {ascending: true});
  if (expensesError) {
    return {error: expensesError.message, status: 500};
  }
  const {data: comments} = await supabase
    .from('Comentario')
    .select('descripcion, fecha_justificada, tipo')
    .eq('id_viaje', tripId)
    .eq('tipo', 'JUSTIFICACION')
    .order('fecha', {ascending: false});
  const dayJustifications = latestJustificationPerDay(comments || []);
  const html = generateStatementHtml(trip, expenses || [], dayJustifications);
  const pdfBuffer = await pdfService.generatePdf(html);
  // Nombre de archivo solo con letras, numeros y guiones, como exige la cabecera de descarga
  const safeReason = (trip.motivo || 'viaje')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'viaje';
  return {buffer: pdfBuffer, fileName: `Rendicion_${tripId}_${safeReason}.pdf`};
};

module.exports = {generateStatementPdf, generateStatementHtml, getExpenseTaxValues};
