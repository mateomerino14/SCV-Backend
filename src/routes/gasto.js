const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const multer = require('multer')
const SibApiV3Sdk = require('sib-api-v3-sdk')
const htmlPdf = require('html-pdf-node')
const { actualizarAlcoholEnViaje } = require('../utils/alcoholUtils')
const { validarPlazoViaje } = require('../utils/tolerancia')

const upload = multer({ storage: multer.memoryStorage() })

const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

const calcularRetenciones = (monto, tipo, esInternacional) => {
  const montoNum = parseFloat(monto)
  if (esInternacional || tipo === 'F' || tipo === 'R') {
    return { base_imponible: montoNum, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: montoNum }
  }
  if (tipo === 'C') {
    const base = parseFloat((montoNum / 0.92).toFixed(2))
    const iue = parseFloat((base * 0.05).toFixed(2))
    const it = parseFloat((base * 0.03).toFixed(2))
    return { base_imponible: base, retencion_rc_iva: 0, retencion_iue: iue, retencion_it: it, importe_costo: base }
  }
  if (tipo === 'S') {
    const base = parseFloat((montoNum / 0.84).toFixed(2))
    const rc_iva = parseFloat((base * 0.13).toFixed(2))
    const it = parseFloat((base * 0.03).toFixed(2))
    return { base_imponible: base, retencion_rc_iva: rc_iva, retencion_iue: 0, retencion_it: it, importe_costo: base }
  }
  return { base_imponible: montoNum, retencion_rc_iva: 0, retencion_iue: 0, retencion_it: 0, importe_costo: montoNum }
}

const calcularMontoDesdeSubitems = (subitems) => {
  if (!Array.isArray(subitems) || subitems.length === 0) return null
  return parseFloat(subitems.reduce((s, si) => s + parseFloat(si.monto || 0), 0).toFixed(2))
}

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function convertirGrupo(n) {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  let resultado = ''
  const c = Math.floor(n / 100)
  const resto = n % 100
  if (c > 0) resultado += CENTENAS[c] + ' '
  if (resto >= 10 && resto <= 19) {
    resultado += ESPECIALES[resto - 10]
  } else {
    const d = Math.floor(resto / 10)
    const u = resto % 10
    if (d === 2 && u > 0) {
      resultado += 'VEINTI' + UNIDADES[u]
    } else {
      if (d > 0) resultado += DECENAS[d]
      if (d > 0 && u > 0) resultado += ' Y '
      if (u > 0) resultado += UNIDADES[u]
    }
  }
  return resultado.trim()
}

function numeroALetras(num, moneda = 'BOLIVIANOS') {
  const entero = Math.floor(num)
  const centavos = Math.round((num - entero) * 100)

  if (entero === 0) return `CERO 00/100 ${moneda}`

  let resultado = ''
  const millones = Math.floor(entero / 1000000)
  const miles = Math.floor((entero % 1000000) / 1000)
  const resto = entero % 1000

  if (millones > 0) {
    resultado += (millones === 1 ? 'UN MILLÓN ' : convertirGrupo(millones) + ' MILLONES ')
  }
  if (miles > 0) {
    resultado += (miles === 1 ? 'MIL ' : convertirGrupo(miles) + ' MIL ')
  }
  if (resto > 0) {
    resultado += convertirGrupo(resto)
  }

  resultado = resultado.trim()
  const centavosStr = centavos.toString().padStart(2, '0')
  return `${resultado} ${centavosStr}/100 ${moneda}`
}

const formatFechaCorta = (f) => {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

const escapeHtml = (texto) =>
  (texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const generarReciboAgrupadoHTML = (gastos, empleado, numeroRecibo, tipo, esInternacional = false) => {
  const fechaHoy = new Date()
  const dia = fechaHoy.getDate()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const mes = meses[fechaHoy.getMonth()]
  const anio = fechaHoy.getFullYear()

  const moneda = esInternacional ? 'USD' : 'Bs'
  const monedaLetras = esInternacional ? 'DÓLARES AMERICANOS' : 'BOLIVIANOS'
  const esServicio = tipo === 'S'
  const labelRetencion = esServicio ? 'RETENCIÓN RC-IVA 13%' : 'RETENCIÓN IUE 5%'
  const tituloTipo = esServicio ? 'RECIBO PAGO DE SERVICIOS' : 'RECIBO DE COMPRAS'

  const totalImporte = gastos.reduce((s, g) => s + parseFloat(g.monto_total || 0), 0)
  const totalRetencion = esInternacional ? 0 : (esServicio
    ? gastos.reduce((s, g) => s + parseFloat(g.retencion_rc_iva || 0), 0)
    : gastos.reduce((s, g) => s + parseFloat(g.retencion_iue || 0), 0))
  const totalIt = esInternacional ? 0 : gastos.reduce((s, g) => s + parseFloat(g.retencion_it || 0), 0)
  const totalACancelar = gastos.reduce((s, g) => s + parseFloat(g.importe_costo || g.monto_total || 0), 0)

  const centroDeCosto = `${empleado?.numero_dependencia || ''} / ${empleado?.numero_seccion || ''}`.trim()
  const montoEnLetras = numeroALetras(totalImporte, monedaLetras)

  const filasGastos = gastos.map((g, i) => {
    const subitems = g.Gasto_Subitem || []
    const tramos = g.Gasto_Tramo_Moneda || []
    const desc = subitems.length > 0
      ? escapeHtml(subitems.map(si => `${si.descripcion}: ${parseFloat(si.monto).toFixed(2)}`).join('\n'))
      : escapeHtml(g.descripcion || g.Categoria_Gasto?.nombre || '')
    const tramosTexto = tramos.length > 0
      ? escapeHtml(tramos.map(t => `${parseFloat(t.monto_origen).toFixed(2)} ${t.moneda} → ${parseFloat(t.monto_usd).toFixed(2)} USD`).join('\n'))
      : '—'
    const fechaStr = formatFechaCorta(g.fecha_gasto)
    const colTramos = esInternacional ? `<td class="col-tramos">${tramosTexto}</td>` : ''
    return `
    <tr>
      <td class="col-n">${i + 1}</td>
      <td class="col-fecha">${fechaStr}</td>
      <td class="col-desc">${desc}</td>
      ${colTramos}
      <td class="col-importe">${parseFloat(g.monto_total || 0).toFixed(2)}</td>
    </tr>`
  }).join('')

  const filasMinimas = Math.max(0, 12 - gastos.length)
  const filasVacias = Array.from({ length: filasMinimas }).map((_, i) => {
    const colTramos = esInternacional ? `<td class="col-tramos"></td>` : ''
    return `
    <tr>
      <td class="col-n">${gastos.length + i + 1}</td>
      <td class="col-fecha"></td>
      <td class="col-desc"></td>
      ${colTramos}
      <td class="col-importe"></td>
    </tr>`
  }).join('')

  const filaRetencion = esInternacional ? '' : `<div class="totales-fila"><span>${labelRetencion}</span><span>${totalRetencion.toFixed(2)}</span></div>
        <div class="totales-fila"><span>RETENCIÓN IT 3%</span><span>${totalIt.toFixed(2)}</span></div>`

  const thTramos = esInternacional ? `<th class="col-tramos">TRAMOS DE CAMBIO</th>` : ''
  const descWidth = esInternacional ? '38' : '52'
  const tramosWidth = esInternacional ? '20' : '0'

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
  table.principal { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
  table.principal thead { display: table-header-group; }
  table.principal th { border: 1px solid #000; padding: 4px 6px; font-size: 10pt; font-weight: bold; text-align: center; }
  table.principal td { border: 1px solid #000; padding: 5px 6px; font-size: 9.5pt; height: 20px; }
  table.principal tr { page-break-inside: avoid; page-break-after: auto; }
  .col-n { width: 4%; text-align: center; }
  .col-fecha { width: 14%; text-align: center; }
  .col-desc { width: ${descWidth}%; white-space: pre-line; }
  .col-tramos { width: ${tramosWidth}%; white-space: pre-line; font-size: 9pt; }
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
      <div class="titulo">${tituloTipo}${esInternacional ? ' (INTERNACIONAL)' : ''}</div>
      <div class="numero">Nº ${numeroRecibo}</div>
    </div>

    <div class="fecha-linea">
      Lugar: Cochabamba &nbsp;&nbsp; de ${dia} &nbsp;&nbsp; de ${mes} &nbsp;&nbsp; de ${anio}
    </div>

    <table class="principal">
      <thead>
        <tr>
          <th class="col-n">Nº</th>
          <th class="col-fecha">FECHA</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          ${thTramos}
          <th class="col-importe">IMPORTE ${moneda.toUpperCase()}.</th>
        </tr>
      </thead>
      <tbody>
        ${filasGastos}
        ${filasVacias}
      </tbody>
    </table>

    <div class="zona-inferior">
      <div class="centro-costo">
        <p class="centro-costo-titulo">CENTRO DE COSTO</p>
        <div class="centro-costo-box">${centroDeCosto}</div>
      </div>
      <div class="totales">
        <div class="totales-fila"><span>TOTAL IMPORTE</span><span>${totalImporte.toFixed(2)}</span></div>
        ${filaRetencion}
        <div class="totales-fila"><span>IMPORTE A CANCELAR</span><span>${totalACancelar.toFixed(2)}</span></div>
      </div>
    </div>

    <div class="son-linea">
      <span>Son:</span>
      <span class="son-texto">${montoEnLetras}</span>
    </div>

    <div class="pie">
      <div class="pie-izq">
        <div class="linea-firma">Autorizado por</div>
      </div>
      <div class="pie-der">
        <p>Nombre: ${empleado?.nombre || ''} ${empleado?.apellido_paterno || ''}</p>
        <p>Firma:</p>
        <p>C.I.:</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

const generarReciboIndividualHTML = (gasto, empleado, numeroRecibo) => {
  const fechaHoy = new Date()
  const dia = fechaHoy.getDate()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const mes = meses[fechaHoy.getMonth()]
  const anio = fechaHoy.getFullYear()

  const esInternacional = !!gasto.es_gasto_internacional
  const moneda = esInternacional ? 'USD' : 'Bs'
  const monedaLetras = esInternacional ? 'DÓLARES AMERICANOS' : 'BOLIVIANOS'
  const esServicio = gasto.tipo === 'S'
  const labelRetencion = esServicio ? 'RETENCIÓN RC-IVA 13%' : 'RETENCIÓN IUE 5%'
  const tituloTipo = esServicio ? 'RECIBO PAGO DE SERVICIOS' : 'RECIBO DE COMPRAS'

  const subitems = gasto.Gasto_Subitem || []
  const tramos = gasto.Gasto_Tramo_Moneda || []
  const tieneSubitems = subitems.length > 0
  const tieneTramos = esInternacional && tramos.length > 0

  const totalImporte = parseFloat(gasto.monto_total || 0)
  const totalRetencion = esInternacional ? 0 : (esServicio ? parseFloat(gasto.retencion_rc_iva || 0) : parseFloat(gasto.retencion_iue || 0))
  const totalIt = esInternacional ? 0 : parseFloat(gasto.retencion_it || 0)
  const totalACancelar = parseFloat(gasto.importe_costo || gasto.monto_total || 0)

  const centroDeCosto = `${empleado?.numero_dependencia || ''} / ${empleado?.numero_seccion || ''}`.trim()
  const montoEnLetras = numeroALetras(totalImporte, monedaLetras)

  let filasGastos
  if (tieneSubitems) {
    filasGastos = subitems.map((si, i) => `
    <tr>
      <td class="col-n">${i + 1}</td>
      <td class="col-fecha">${formatFechaCorta(gasto.fecha_gasto)}</td>
      <td class="col-desc">${escapeHtml(si.descripcion)}</td>
      <td class="col-importe">${parseFloat(si.monto).toFixed(2)}</td>
    </tr>`).join('')
  } else {
    filasGastos = `
    <tr>
      <td class="col-n">1</td>
      <td class="col-fecha">${formatFechaCorta(gasto.fecha_gasto)}</td>
      <td class="col-desc">${escapeHtml(gasto.descripcion || gasto.Categoria_Gasto?.nombre || '')}</td>
      <td class="col-importe">${totalImporte.toFixed(2)}</td>
    </tr>`
  }

  const cantidadFilas = tieneSubitems ? subitems.length : 1
  const filasMinimas = Math.max(0, 10 - cantidadFilas)
  const filasVacias = Array.from({ length: filasMinimas }).map((_, i) => `
    <tr>
      <td class="col-n">${cantidadFilas + i + 1}</td>
      <td class="col-fecha"></td>
      <td class="col-desc"></td>
      <td class="col-importe"></td>
    </tr>`).join('')

  const filaRetencion = esInternacional ? '' : `<div class="totales-fila"><span>${labelRetencion}</span><span>${totalRetencion.toFixed(2)}</span></div>
        <div class="totales-fila"><span>RETENCIÓN IT 3%</span><span>${totalIt.toFixed(2)}</span></div>`

  const tramosHtml = tieneTramos ? `
    <div class="tramos-box">
      <p class="tramos-titulo">TRAMOS DE CAMBIO</p>
      ${tramos.map(t => `<p class="tramos-linea">${parseFloat(t.monto_origen).toFixed(2)} ${t.moneda} → ${parseFloat(t.monto_usd).toFixed(2)} USD (T/C: ${parseFloat(t.tipo_cambio).toFixed(4)})</p>`).join('')}
    </div>` : ''

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
      <div class="titulo">${tituloTipo}${esInternacional ? ' (INTERNACIONAL)' : ''}</div>
      <div class="numero">Nº ${numeroRecibo}</div>
    </div>

    <div class="fecha-linea">
      Lugar: Cochabamba &nbsp;&nbsp; de ${dia} &nbsp;&nbsp; de ${mes} &nbsp;&nbsp; de ${anio}
    </div>

    ${tramosHtml}

    <table class="principal">
      <thead>
        <tr>
          <th class="col-n">Nº</th>
          <th class="col-fecha">FECHA</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          <th class="col-importe">IMPORTE ${moneda.toUpperCase()}.</th>
        </tr>
      </thead>
      <tbody>
        ${filasGastos}
        ${filasVacias}
      </tbody>
    </table>

    <div class="zona-inferior">
      <div class="centro-costo">
        <p class="centro-costo-titulo">CENTRO DE COSTO</p>
        <div class="centro-costo-box">${centroDeCosto}</div>
      </div>
      <div class="totales">
        <div class="totales-fila"><span>TOTAL IMPORTE</span><span>${totalImporte.toFixed(2)}</span></div>
        ${filaRetencion}
        <div class="totales-fila"><span>IMPORTE A CANCELAR</span><span>${totalACancelar.toFixed(2)}</span></div>
      </div>
    </div>

    <div class="son-linea">
      <span>Son:</span>
      <span class="son-texto">${montoEnLetras}</span>
    </div>

    <div class="pie">
      <div class="pie-izq">
        <div class="linea-firma">Autorizado por</div>
      </div>
      <div class="pie-der">
        <p>Nombre: ${empleado?.nombre || ''} ${empleado?.apellido_paterno || ''}</p>
        <p>Firma:</p>
        <p>C.I.:</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

const generarPDF = async (html) => {
  const file = { content: html }
  const options = {
    format: 'A4',
    landscape: true,
    margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
    preferCSSPageSize: true,
  }
  return await htmlPdf.generatePdf(file, options)
}

const enviarCorreo = async (to, subject, htmlContent, adjuntos = []) => {
  if (!to || to.length === 0) return
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  const payload = {
    sender: { name: 'Sistema de Viáticos', email: 'mateomerino988@gmail.com' },
    to, subject, htmlContent,
  }
  if (adjuntos.length > 0) payload.attachment = adjuntos
  await api.sendTransacEmail(payload)
}

router.get('/:id_gasto/detalle', authMiddleware, async (req, res) => {
  try {
    const { id_gasto } = req.params
    const { data, error } = await supabase
      .from('Gasto')
      .select(`
        *,
        Categoria_Gasto(nombre),
        Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal),
        Factura(
          id_factura,
          numero_factura,
          fecha_emision,
          monto_parcial,
          Detalle_Factura(nombre_producto, cantidad, precio),
          Factura_Impuestos(
            Impuesto(porcentaje, nombre)
          )
        ),
        Imagen(url_archivo),
        Gasto_Tramo_Moneda(id_tramo, moneda, monto_origen, tipo_cambio, monto_usd),
        Gasto_Subitem(id_subitem, descripcion, monto)
      `)
      .eq('id_gasto', id_gasto)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Gasto no encontrado' })
    return res.json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/viaje/:id_viaje/recibo/:tipo', authMiddleware, async (req, res) => {
  try {
    const { id_viaje, tipo } = req.params
    const esInternacional = req.query.internacional === 'true'

    if (!['C', 'S'].includes(tipo)) {
      return res.status(400).json({ error: 'El tipo debe ser Compra (C) o Servicio (S)' })
    }

    const { data: viaje, error: viajeError } = await supabase
      .from('Viaje')
      .select('id_usuario, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo, numero_dependencia, numero_seccion)')
      .eq('id_viaje', id_viaje)
      .single()

    if (viajeError) return res.status(500).json({ error: viajeError.message })
    if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

    const empleado = viaje.Usuario
    if (!empleado?.email_corporativo) {
      return res.status(400).json({ error: 'El empleado no tiene un correo corporativo registrado' })
    }

    const { data: gastos, error: gastosError } = await supabase
      .from('Gasto')
      .select('*, Categoria_Gasto(nombre), Gasto_Subitem(id_subitem, descripcion, monto), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd)')
      .eq('id_viaje', id_viaje)
      .eq('tipo', tipo)
      .eq('es_gasto_internacional', esInternacional)
      .order('fecha_gasto', { ascending: true })

    if (gastosError) return res.status(500).json({ error: gastosError.message })
    if (!gastos || gastos.length === 0) {
      return res.status(400).json({ error: `No hay gastos ${esInternacional ? 'internacionales ' : ''}de tipo ${tipo === 'C' ? 'Compra' : 'Servicio'} sin factura registrados en este viaje` })
    }

    const { data: correlativoData, error: correlativoError } = await supabase.rpc('incrementar_correlativo_recibo')
    if (correlativoError) return res.status(500).json({ error: 'Error al generar el número de recibo' })
    const numeroRecibo = String(correlativoData).padStart(6, '0')
    const html = generarReciboAgrupadoHTML(gastos, empleado, numeroRecibo, tipo, esInternacional)
    const pdfBuffer = await generarPDF(html)
    const pdfBase64 = pdfBuffer.toString('base64')
    const nombreTipo = tipo === 'C' ? 'Compras' : 'Servicios'
    const adjuntos = [{ content: pdfBase64, name: `Recibo_${nombreTipo}${esInternacional ? '_Internacional' : ''}_${numeroRecibo}.pdf` }]

    const tituloCorreo = tipo === 'C' ? 'Recibo de Compras' : 'Recibo de Pago de Servicios'

    const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">${tituloCorreo}${esInternacional ? ' Internacional' : ''}</h2>
      <p style="margin-bottom:8px;">Se adjunta el recibo consolidado de ${nombreTipo.toLowerCase()} Nº ${numeroRecibo}, con ${gastos.length} gasto(s) registrado(s).</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
    </div>`

    await enviarCorreo(
      [{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }],
      `${tituloCorreo}${esInternacional ? ' Internacional' : ''} — Nº ${numeroRecibo}`,
      htmlCorreo,
      adjuntos
    )

    return res.json({ message: 'Recibo generado y enviado correctamente', cantidadGastos: gastos.length })
  } catch (error) {
    console.log('Error generando recibo agrupado:', error.message)
    return res.status(500).json({ error: error.message || 'Error al generar el recibo' })
  }
})

router.post('/:id_gasto/recibo', authMiddleware, async (req, res) => {
  try {
    const { id_gasto } = req.params

    const { data: gasto, error: gastoError } = await supabase
      .from('Gasto')
      .select('*, Categoria_Gasto(nombre), Gasto_Subitem(id_subitem, descripcion, monto), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Viaje(id_usuario, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo, numero_dependencia, numero_seccion))')
      .eq('id_gasto', id_gasto)
      .single()

    if (gastoError) return res.status(500).json({ error: gastoError.message })
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' })
    if (!['C', 'S'].includes(gasto.tipo)) {
      return res.status(400).json({ error: 'Solo se puede generar recibo para gastos de tipo Compra o Servicio sin factura' })
    }

    const empleado = gasto.Viaje?.Usuario
    if (!empleado?.email_corporativo) {
      return res.status(400).json({ error: 'El empleado no tiene un correo corporativo registrado' })
    }

    const { data: correlativoData, error: correlativoError } = await supabase.rpc('incrementar_correlativo_recibo')
    if (correlativoError) return res.status(500).json({ error: 'Error al generar el número de recibo' })
    const numeroRecibo = String(correlativoData).padStart(6, '0')

    const html = generarReciboIndividualHTML(gasto, empleado, numeroRecibo)
    const pdfBuffer = await generarPDF(html)
    const pdfBase64 = pdfBuffer.toString('base64')
    const nombreTipo = gasto.tipo === 'C' ? 'Compra' : 'Servicio'
    const adjuntos = [{ content: pdfBase64, name: `Recibo_${nombreTipo}_${numeroRecibo}.pdf` }]

    const tituloCorreo = gasto.tipo === 'C' ? 'Recibo de Compra' : 'Recibo de Pago de Servicio'

    const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">${tituloCorreo}</h2>
      <p style="margin-bottom:8px;">Se adjunta el recibo Nº ${numeroRecibo} correspondiente al gasto registrado.</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
    </div>`

    await enviarCorreo(
      [{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }],
      `${tituloCorreo} — Nº ${numeroRecibo}`,
      htmlCorreo,
      adjuntos
    )

    return res.json({ message: 'Recibo generado y enviado correctamente' })
  } catch (error) {
    console.log('Error generando recibo individual:', error.message)
    return res.status(500).json({ error: error.message || 'Error al generar el recibo' })
  }
})

router.post('/registrar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)

    if (!datos.id_viaje) return res.status(400).json({ error: 'El viaje es requerido' })

    const esInternacional = datos.es_gasto_internacional || false
    const usaTramos = esInternacional && Array.isArray(datos.tramos) && datos.tramos.length > 0
    const usaSubitems = Array.isArray(datos.subitems) && datos.subitems.length > 0

    let montoTotal = parseFloat(datos.monto_total)
    if (!esInternacional && usaSubitems) {
      const montoSubitems = calcularMontoDesdeSubitems(datos.subitems)
      if (montoSubitems !== null) montoTotal = montoSubitems
    }

    if (!montoTotal || isNaN(montoTotal) || montoTotal <= 0) return res.status(400).json({ error: 'El monto es requerido' })

    if (datos.fecha_gasto) {
      const validacion = await validarPlazoViaje(datos.id_viaje, datos.fecha_gasto)
      if (!validacion.valido) {
        return res.status(400).json({ error: validacion.error, requiereAutorizacion: !!validacion.requiereAutorizacion })
      }
    }

    let id_proveedor = null
    if (datos.proveedor) {
      const { data: provExistente } = await supabase.from('Proveedor').select('id_proveedor').ilike('nombre', datos.proveedor.trim()).limit(1).maybeSingle()
      if (provExistente) {
        id_proveedor = provExistente.id_proveedor
      } else {
        const { data: nuevoProv } = await supabase.from('Proveedor').insert({ nombre: datos.proveedor.trim() }).select().single()
        id_proveedor = nuevoProv?.id_proveedor
      }
    }

    const tipo = datos.tipo || 'S'
    const retenciones = calcularRetenciones(montoTotal, tipo, esInternacional)

    const primerTramo = usaTramos ? datos.tramos[0] : null
    const sumaMontoOrigen = usaTramos ? datos.tramos.reduce((s, t) => s + parseFloat(t.monto_origen), 0) : (datos.monto_moneda_origen || montoTotal)

    const { data: gasto, error: gastoError } = await supabase
      .from('Gasto')
      .insert({
        monto_total: montoTotal,
        fecha_gasto: datos.fecha_gasto,
        descripcion: datos.descripcion || '',
        tipo,
        id_viaje: datos.id_viaje,
        id_categoria: datos.id_categoria_gasto || null,
        id_proveedor,
        moneda: primerTramo?.moneda || datos.moneda || 'USD',
        tipo_cambio: primerTramo ? parseFloat(primerTramo.tipo_cambio) : (datos.tipo_cambio || 1),
        monto_moneda_origen: sumaMontoOrigen,
        es_gasto_internacional: esInternacional,
        base_imponible: retenciones.base_imponible,
        retencion_rc_iva: retenciones.retencion_rc_iva,
        retencion_iue: retenciones.retencion_iue,
        retencion_it: retenciones.retencion_it,
        importe_costo: retenciones.importe_costo,
      })
      .select()
      .single()

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    if (usaTramos) {
      const filasTramos = datos.tramos.map(t => ({
        id_gasto: gasto.id_gasto,
        moneda: t.moneda.trim().toUpperCase(),
        monto_origen: parseFloat(t.monto_origen),
        tipo_cambio: parseFloat(t.tipo_cambio),
        monto_usd: parseFloat((parseFloat(t.monto_origen) / parseFloat(t.tipo_cambio)).toFixed(2)),
      }))
      const { error: tramosError } = await supabase.from('Gasto_Tramo_Moneda').insert(filasTramos)
      if (tramosError) {
        await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
        return res.status(500).json({ error: tramosError.message })
      }
    }

    if (usaSubitems) {
      const filasSubitems = datos.subitems
        .filter(si => si.descripcion?.trim() && parseFloat(si.monto) > 0)
        .map(si => ({
          id_gasto: gasto.id_gasto,
          descripcion: si.descripcion.trim(),
          monto: parseFloat(si.monto),
        }))
      if (filasSubitems.length > 0) {
        const { error: subitemsError } = await supabase.from('Gasto_Subitem').insert(filasSubitems)
        if (subitemsError) {
          await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
          return res.status(500).json({ error: subitemsError.message })
        }
      }
    }

    if (req.file) {
      const extension = req.file.originalname.split('.').pop()
      const fileName = `gastos/${gasto.id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage.from('facturas').upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto: gasto.id_gasto })
      }
    }

    return res.json({ message: 'Gasto registrado correctamente', gasto })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.put('/:id_gasto/actualizar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)
    const { id_gasto } = req.params

    const esInternacional = datos.es_gasto_internacional || false
    const usaTramos = esInternacional && Array.isArray(datos.tramos) && datos.tramos.length > 0
    const usaSubitems = Array.isArray(datos.subitems) && datos.subitems.length > 0

    let montoTotal = parseFloat(datos.monto_total)
    if (!esInternacional && usaSubitems) {
      const montoSubitems = calcularMontoDesdeSubitems(datos.subitems)
      if (montoSubitems !== null) montoTotal = montoSubitems
    }

    if (!montoTotal || isNaN(montoTotal) || montoTotal <= 0) return res.status(400).json({ error: 'El monto es requerido' })

    let id_proveedor = null
    if (datos.proveedor) {
      const { data: provExistente } = await supabase.from('Proveedor').select('id_proveedor').ilike('nombre', datos.proveedor.trim()).limit(1).maybeSingle()
      if (provExistente) {
        id_proveedor = provExistente.id_proveedor
      } else {
        const { data: nuevoProv } = await supabase.from('Proveedor').insert({ nombre: datos.proveedor.trim() }).select().single()
        id_proveedor = nuevoProv?.id_proveedor
      }
    }

    const tipo = datos.tipo || 'S'
    const retenciones = calcularRetenciones(montoTotal, tipo, esInternacional)

    const primerTramo = usaTramos ? datos.tramos[0] : null
    const sumaMontoOrigen = usaTramos ? datos.tramos.reduce((s, t) => s + parseFloat(t.monto_origen), 0) : (datos.monto_moneda_origen || montoTotal)

    const { error: gastoError } = await supabase
      .from('Gasto')
      .update({
        monto_total: montoTotal,
        fecha_gasto: datos.fecha_gasto,
        descripcion: datos.descripcion || '',
        tipo,
        id_categoria: datos.id_categoria_gasto || null,
        id_proveedor,
        moneda: primerTramo?.moneda || datos.moneda || 'USD',
        tipo_cambio: primerTramo ? parseFloat(primerTramo.tipo_cambio) : (datos.tipo_cambio || 1),
        monto_moneda_origen: sumaMontoOrigen,
        es_gasto_internacional: esInternacional,
        base_imponible: retenciones.base_imponible,
        retencion_rc_iva: retenciones.retencion_rc_iva,
        retencion_iue: retenciones.retencion_iue,
        retencion_it: retenciones.retencion_it,
        importe_costo: retenciones.importe_costo,
      })
      .eq('id_gasto', id_gasto)

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    if (esInternacional) {
      await supabase.from('Gasto_Tramo_Moneda').delete().eq('id_gasto', id_gasto)
      if (usaTramos) {
        const filasTramos = datos.tramos.map(t => ({
          id_gasto: parseInt(id_gasto),
          moneda: t.moneda.trim().toUpperCase(),
          monto_origen: parseFloat(t.monto_origen),
          tipo_cambio: parseFloat(t.tipo_cambio),
          monto_usd: parseFloat((parseFloat(t.monto_origen) / parseFloat(t.tipo_cambio)).toFixed(2)),
        }))
        await supabase.from('Gasto_Tramo_Moneda').insert(filasTramos)
      }
    }

    await supabase.from('Gasto_Subitem').delete().eq('id_gasto', id_gasto)
    if (usaSubitems) {
      const filasSubitems = datos.subitems
        .filter(si => si.descripcion?.trim() && parseFloat(si.monto) > 0)
        .map(si => ({
          id_gasto: parseInt(id_gasto),
          descripcion: si.descripcion.trim(),
          monto: parseFloat(si.monto),
        }))
      if (filasSubitems.length > 0) {
        await supabase.from('Gasto_Subitem').insert(filasSubitems)
      }
    }

    if (!datos.mantener_imagen) {
      await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)
      if (req.file) {
        const extension = req.file.originalname.split('.').pop()
        const fileName = `gastos/${id_gasto}_${Date.now()}.${extension}`
        const { error: storageError } = await supabase.storage.from('facturas').upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
        if (!storageError) {
          const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
          await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto })
        }
      }
    }

    return res.json({ message: 'Gasto actualizado correctamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.delete('/:id_gasto', authMiddleware, async (req, res) => {
  try {
    const { id_gasto } = req.params
    const { data: gasto } = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', id_gasto).single()
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' })
    const id_viaje = gasto.id_viaje
    const { data: facturas } = await supabase.from('Factura').select('id_factura').eq('id_gasto', id_gasto)
    if (facturas && facturas.length > 0) {
      const idsFacturas = facturas.map((f) => f.id_factura)
      await supabase.from('Detalle_Factura').delete().in('id_factura', idsFacturas)
      await supabase.from('Factura_Impuestos').delete().in('id_factura', idsFacturas)
      await supabase.from('Factura').delete().in('id_factura', idsFacturas)
    }
    await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)
    const { error: deleteError } = await supabase.from('Gasto').delete().eq('id_gasto', id_gasto)
    if (deleteError) return res.status(500).json({ error: deleteError.message })
    actualizarAlcoholEnViaje(id_viaje).catch((e) => console.warn('Error alcohol al eliminar:', e.message))
    return res.json({ message: 'Gasto eliminado correctamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al eliminar el gasto' })
  }
})

module.exports = router;