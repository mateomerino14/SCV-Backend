const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')
const malasPalabras = require('../utils/palabrasProhibidas')
const SibApiV3Sdk = require('sib-api-v3-sdk')
const htmlPdf = require('html-pdf-node')

const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

function contieneMalasPalabras(texto) {
  const textoLimpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?;:]/g, '')
  const palabras = textoLimpio.split(' ')
  for (const palabra of palabras) {
    if (malasPalabras.includes(palabra)) return true
  }
  return false
}

const CARGO_TESORERO = 'asistente de caja y tesorería'

const normalizarCargo = (nombre) =>
  (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const formatFecha = (f) => {
  const [y, m, d] = f.split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const calcularGastos = (gastos, viaje) => {
  const nacionales = (gastos || []).filter(g => !g.es_gasto_internacional)
  const internacionales = (gastos || []).filter(g => !!g.es_gasto_internacional)
  const gastoAcumulado = nacionales.reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
  const gastoAcumuladoUsd = internacionales.reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
  const excedePresupuesto = gastoAcumulado > parseFloat(viaje.monto_asignado)
  const excedePresupuestoUsd = gastoAcumuladoUsd > parseFloat(viaje.monto_asignado_usd || 0)
  return { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd }
}

const obtenerUsuariosActivos = async () => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, email_corporativo, nombre, apellido_paterno, Cargo!inner(nombre, activo)')
    .eq('activo', true)
    .eq('Cargo.activo', true)
  if (error) return []
  return (data || []).filter(u => u.email_corporativo && u.email_corporativo.trim() !== '')
}

const generarRendicionHTML = (viaje, revisor, codigoViaje, gastos) => {
  const empleado = viaje.Usuario
  const fechaHoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodo = `${formatFecha(viaje.fecha_inicio)} al ${formatFecha(viaje.fecha_fin)}`
  const gastosNacionales = (gastos || []).filter(g => !g.es_gasto_internacional)
  const gastosInternacionales = (gastos || []).filter(g => !!g.es_gasto_internacional)
  const totalNacional = gastosNacionales.reduce((s, g) => s + parseFloat(g.monto_total || 0), 0)
  const totalUsd = gastosInternacionales.reduce((s, g) => s + parseFloat(g.monto_total || 0), 0)
  const montoAsignado = parseFloat(viaje.monto_asignado)
  const montoAsignadoUsd = parseFloat(viaje.monto_asignado_usd || 0)
  const saldoNacional = montoAsignado - totalNacional
  const saldoUsd = montoAsignadoUsd - totalUsd
  const excedeNacional = saldoNacional < 0
  const excedeUsd = saldoUsd < 0
  const esInternacional = viaje.tipo === 'Internacional'

  const filaGasto = (g, esInter) => {
    const fecha = g.fecha_gasto ? g.fecha_gasto.split('T')[0] : ''
    const tieneFactura = !!g.Factura
    const nombre = tieneFactura ? (g.Proveedor?.nombre || 'Sin proveedor') : (g.Categoria_Gasto?.nombre || 'Sin categoría')
    const tipo = { F: 'Factura', R: 'Recibo', C: 'Compra', S: 'Servicio' }[g.tipo] || g.tipo || ''
    const monto = parseFloat(g.monto_total || 0).toFixed(2)
    const moneda = esInter ? 'USD' : 'Bs'
    return `<tr>
      <td style="padding:4px 8px;border:1px solid #ddd;">${fecha}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${nombre}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${tipo}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${monto} ${moneda}</td>
    </tr>`
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
    <tr><th style="width:35%">Código</th><td style="padding:4px 8px;border:1px solid #ddd;">${codigoViaje}</td></tr>
    <tr><th>Empleado</th><td style="padding:4px 8px;border:1px solid #ddd;">${empleado?.nombre} ${empleado?.apellido_paterno}</td></tr>
    <tr><th>Cargo</th><td style="padding:4px 8px;border:1px solid #ddd;">${empleado?.Cargo?.nombre || ''}</td></tr>
    <tr><th>Motivo</th><td style="padding:4px 8px;border:1px solid #ddd;">${viaje.motivo}</td></tr>
    <tr><th>Origen</th><td style="padding:4px 8px;border:1px solid #ddd;">${viaje.origen || '—'}</td></tr>
    <tr><th>Destino</th><td style="padding:4px 8px;border:1px solid #ddd;">${viaje.destino}</td></tr>
    <tr><th>Período</th><td style="padding:4px 8px;border:1px solid #ddd;">${periodo}</td></tr>
    <tr><th>Tipo de Viaje</th><td style="padding:4px 8px;border:1px solid #ddd;">${viaje.tipo}</td></tr>
    <tr><th>Transporte</th><td style="padding:4px 8px;border:1px solid #ddd;">${viaje.transporte || '—'}</td></tr>
    <tr><th>Fecha Aprobación Final</th><td style="padding:4px 8px;border:1px solid #ddd;">${fechaHoy}</td></tr>
    <tr><th>Revisado y aprobado por</th><td style="padding:4px 8px;border:1px solid #ddd;">${revisor?.nombre} ${revisor?.apellido_paterno}</td></tr>
  </table>
  <div class="seccion">Gastos Nacionales (Bs)</div>
  ${gastosNacionales.length > 0 ? `
  <table>
    <tr><th style="width:15%">Fecha</th><th style="width:40%">Concepto</th><th style="width:20%">Tipo</th><th style="width:25%;text-align:right">Monto</th></tr>
    ${gastosNacionales.map(g => filaGasto(g, false)).join('')}
  </table>` : `<p style="font-size:10pt;color:#666;margin-bottom:10px;">No hay gastos nacionales registrados</p>`}
  <div class="resumen-row"><span>Fondo asignado (Bs)</span><span>Bs. ${montoAsignado.toFixed(2)}</span></div>
  <div class="resumen-row"><span>Total gastado (Bs)</span><span>Bs. ${totalNacional.toFixed(2)}</span></div>
  <div class="resumen-total" style="color:${excedeNacional ? '#870002' : '#155724'}">
    <span>${excedeNacional ? 'Exceso a reembolsar (Bs)' : 'Saldo a devolver (Bs)'}</span>
    <span>Bs. ${Math.abs(saldoNacional).toFixed(2)}</span>
  </div>
  ${esInternacional ? `
  <div class="seccion">Gastos Internacionales (USD)</div>
  ${gastosInternacionales.length > 0 ? `
  <table>
    <tr><th style="width:15%">Fecha</th><th style="width:40%">Concepto</th><th style="width:20%">Tipo</th><th style="width:25%;text-align:right">Monto</th></tr>
    ${gastosInternacionales.map(g => filaGasto(g, true)).join('')}
  </table>` : `<p style="font-size:10pt;color:#666;margin-bottom:10px;">No hay gastos internacionales registrados</p>`}
  <div class="resumen-row"><span>Fondo asignado (USD)</span><span>USD ${montoAsignadoUsd.toFixed(2)}</span></div>
  <div class="resumen-row"><span>Total gastado (USD)</span><span>USD ${totalUsd.toFixed(2)}</span></div>
  <div class="resumen-total" style="color:${excedeUsd ? '#870002' : '#155724'}">
    <span>${excedeUsd ? 'Exceso a reembolsar (USD)' : 'Saldo a devolver (USD)'}</span>
    <span>USD ${Math.abs(saldoUsd).toFixed(2)}</span>
  </div>` : ''}
  <div class="firma-area">
    <div class="firma-nombre">${revisor?.nombre} ${revisor?.apellido_paterno}</div>
    <div class="firma-cargo">REVISOR — MAXAM FANEXA</div>
  </div>
</body></html>`
}

const generarResultadoEmpleadoHTML = (viaje, codigoViaje, resumen) => {
  const empleado = viaje.Usuario
  const { totalNacional, totalUsd, saldoNacional, saldoUsd, excedeNacional, excedeUsd, esInternacional } = resumen

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
  <p class="cuerpo">Estimado(a) ${empleado?.nombre} ${empleado?.apellido_paterno},</p>
  <p class="cuerpo">Le informamos que la rendición de gastos correspondiente al viaje ${codigoViaje} (${viaje.motivo}) ha sido aprobada de forma definitiva.</p>
  <div class="resultado-box">
    <div class="resultado-fila"><span>Fondo asignado (Bs)</span><span>Bs. ${parseFloat(viaje.monto_asignado).toFixed(2)}</span></div>
    <div class="resultado-fila"><span>Total gastado (Bs)</span><span>Bs. ${totalNacional.toFixed(2)}</span></div>
    <div class="resultado-fila total" style="color:${excedeNacional ? '#870002' : '#155724'}">
      <span>${excedeNacional ? 'Monto a reembolsarle (Bs)' : 'Monto que debe devolver (Bs)'}</span>
      <span>Bs. ${Math.abs(saldoNacional).toFixed(2)}</span>
    </div>
    ${esInternacional ? `
    <div class="resultado-fila" style="margin-top:12px;"><span>Fondo asignado (USD)</span><span>USD ${parseFloat(viaje.monto_asignado_usd || 0).toFixed(2)}</span></div>
    <div class="resultado-fila"><span>Total gastado (USD)</span><span>USD ${totalUsd.toFixed(2)}</span></div>
    <div class="resultado-fila total" style="color:${excedeUsd ? '#870002' : '#155724'}">
      <span>${excedeUsd ? 'Monto a reembolsarle (USD)' : 'Monto que debe devolver (USD)'}</span>
      <span>USD ${Math.abs(saldoUsd).toFixed(2)}</span>
    </div>` : ''}
  </div>
  <p class="cuerpo">${(excedeNacional || excedeUsd)
    ? 'Tesorería se pondrá en contacto para coordinar el reembolso correspondiente.'
    : 'Por favor coordina con Tesorería la devolución del saldo pendiente.'}</p>
</body></html>`
}

const generarPDF = async (html) => {
  const file = { content: html }
  const options = { format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } }
  return await htmlPdf.generatePdf(file, options)
}

const enviarCorreo = async (to, subject, htmlContent, adjuntos = []) => {
  if (!to || to.length === 0) return
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  const payload = { sender: { name: 'Sistema de Viáticos', email: 'mateomerino988@gmail.com' }, to, subject, htmlContent }
  if (adjuntos.length > 0) payload.attachment = adjuntos
  await api.sendTransacEmail(payload)
}

const notificarTesorero = async (viaje, revisor, codigoViaje, gastos) => {
  const todosUsuarios = await obtenerUsuariosActivos()
  const tesoreros = todosUsuarios.filter(u => normalizarCargo(u.Cargo?.nombre) === normalizarCargo(CARGO_TESORERO))

  if (tesoreros.length === 0) {
    console.warn('[notificarTesorero] No se encontró ningún usuario activo con el cargo de tesorero y correo corporativo.')
    return
  }

  const to = tesoreros.map(t => ({ email: t.email_corporativo, name: `${t.nombre} ${t.apellido_paterno}` }))
  const htmlRendicion = generarRendicionHTML(viaje, revisor, codigoViaje, gastos)
  const pdfBuffer = await generarPDF(htmlRendicion)
  const pdfBase64 = pdfBuffer.toString('base64')
  const adjuntos = [{ content: pdfBase64, name: `Rendicion_Final_${codigoViaje.replace('/', '-')}.pdf` }]
  const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Rendición de Gastos — Aprobación Final</h2>
    <p style="margin-bottom:8px;">Se adjunta la rendición de gastos con aprobación final correspondiente al viaje <strong>${codigoViaje}</strong>.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`
  await enviarCorreo(to, `Rendición Final — ${codigoViaje}`, htmlCorreo, adjuntos)
}

const notificarEmpleado = async (viaje, codigoViaje, gastos) => {
  const empleado = viaje.Usuario
  if (!empleado?.email_corporativo) {
    console.warn(`[notificarEmpleado] El empleado ${empleado?.nombre} ${empleado?.apellido_paterno} (id_usuario ${empleado?.id_usuario}) no tiene email_corporativo registrado. No se envió el resultado de la rendición.`)
    throw new Error('El empleado no tiene correo corporativo registrado')
  }

  const { gastoAcumulado, gastoAcumuladoUsd } = calcularGastos(gastos, viaje)
  const esInternacional = viaje.tipo === 'Internacional'
  const montoAsignado = parseFloat(viaje.monto_asignado)
  const montoAsignadoUsd = parseFloat(viaje.monto_asignado_usd || 0)
  const saldoNacional = montoAsignado - gastoAcumulado
  const saldoUsd = montoAsignadoUsd - gastoAcumuladoUsd

  const resumen = {
    totalNacional: gastoAcumulado,
    totalUsd: gastoAcumuladoUsd,
    saldoNacional,
    saldoUsd,
    excedeNacional: saldoNacional < 0,
    excedeUsd: saldoUsd < 0,
    esInternacional,
  }

  const htmlResultado = generarResultadoEmpleadoHTML(viaje, codigoViaje, resumen)
  const pdfBuffer = await generarPDF(htmlResultado)
  const pdfBase64 = pdfBuffer.toString('base64')
  const adjuntos = [{ content: pdfBase64, name: `Resultado_Rendicion_${codigoViaje.replace('/', '-')}.pdf` }]

  const excede = resumen.excedeNacional || resumen.excedeUsd
  const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Tu rendición fue aprobada</h2>
    <p style="margin-bottom:8px;">La rendición de gastos del viaje <strong>${codigoViaje}</strong> fue aprobada de forma definitiva.</p>
    <p style="margin-bottom:8px;">${excede ? 'Se te reembolsará el saldo excedido.' : 'Debes devolver el saldo restante a la empresa.'} Revisa el detalle en el documento adjunto.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`

  await enviarCorreo(
    [{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }],
    `Resultado de tu Rendición de Gastos — ${codigoViaje}`,
    htmlCorreo,
    adjuntos
  )
}

router.get('/pendientes', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const id_revisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query
  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional)`)
    .eq('estado', 'APROBADO_SUPERVISOR')
    .neq('id_usuario', id_revisor)
  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)
  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json((data || []).map((viaje) => {
    const { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd } = calcularGastos(viaje.Gasto, viaje)
    const alertas = []
    if (excedePresupuesto || excedePresupuestoUsd) alertas.push('EXCESO_PRESUPUESTO')
    if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')
    return { ...viaje, gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd, alertas, estadoRevision: alertas.length > 0 ? 'OBSERVADO' : 'CONFORME' }
  }))
})

router.get('/mis-revisiones', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const id_revisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query
  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional), Comentario(*)`)
    .eq('id_revisor_asignado', id_revisor)
  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)
  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json((data || []).map((viaje) => {
    const { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd } = calcularGastos(viaje.Gasto, viaje)
    const alertas = []
    if (excedePresupuesto || excedePresupuestoUsd) alertas.push('EXCESO_PRESUPUESTO')
    if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')
    return { ...viaje, gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd, alertas, estadoRevision: alertas.length > 0 ? 'OBSERVADO' : 'CONFORME' }
  }))
})

router.get('/:id_viaje', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))`)
    .eq('id_viaje', id_viaje).single()
  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  const { data: gastos } = await supabase
    .from('Gasto')
    .select(`*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)`)
    .eq('id_viaje', id_viaje)
  const id_revisor = req.user.id_usuario
  const { data: comentarios } = await supabase
    .from('Comentario').select('*').eq('id_viaje', id_viaje).eq('id_usuario', id_revisor).order('fecha', { ascending: false })
  const { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd } = calcularGastos(gastos, viaje)
  const alertas = []
  if (excedePresupuesto || excedePresupuestoUsd) alertas.push('EXCESO_PRESUPUESTO')
  if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')
  return res.json({ viaje, gastos: gastos || [], comentarios: comentarios || [], gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd, alertas })
})

router.post('/:id_viaje/aprobar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_revisor) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje.estado !== 'APROBADO_SUPERVISOR') return res.status(400).json({ error: 'Este viaje no está en revisión final' })

  const { error } = await supabase.from('Viaje').update({ estado: 'APROBADO_FINAL', id_revisor_asignado: id_revisor }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })

  const { data: revisor } = await supabase
    .from('Usuario').select('nombre, apellido_paterno, Cargo(nombre)').eq('id_usuario', id_revisor).single()

  const { data: gastos } = await supabase
    .from('Gasto').select('*, Categoria_Gasto(nombre), Proveedor(nombre), Factura(numero_factura, monto_parcial)').eq('id_viaje', id_viaje)

  const anio = new Date().getFullYear()
  const codigoViaje = `VIA-${id_viaje}/${anio}`

  let advertenciaCorreo = null
  try {
    await notificarTesorero(viaje, revisor, codigoViaje, gastos || [])
  } catch (emailError) {
    console.error('[POST /revisor/:id_viaje/aprobar] Error enviando rendición a tesorero:', emailError)
    advertenciaCorreo = 'El viaje se aprobó pero hubo un problema al enviar la rendición al tesorero. Contacta al administrador del sistema.'
  }

  try {
    await notificarEmpleado(viaje, codigoViaje, gastos || [])
  } catch (emailError) {
    console.error('[POST /revisor/:id_viaje/aprobar] Error enviando resultado al empleado:', emailError)
    if (!advertenciaCorreo) {
      advertenciaCorreo = 'El viaje se aprobó pero hubo un problema al enviar el resultado al empleado. Contacta al administrador del sistema.'
    }
  }

  return res.json({ message: 'Viaje aprobado finalmente', advertencia: advertenciaCorreo })
})

router.post('/:id_viaje/rechazar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario
  const { data: viaje } = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision').eq('id_viaje', id_viaje).single()
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_revisor) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje.estado !== 'APROBADO_SUPERVISOR') return res.status(400).json({ error: 'Este viaje no está en revisión final' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_revisor)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', viaje.ciclo_revision || 1)
    .not('id_gasto', 'is', null)

  if (!obsExistentes || obsExistentes.length === 0) return res.status(400).json({ error: 'Debes agregar al menos una observación a algún gasto antes de rechazar' })
  const { error: updateError } = await supabase.from('Viaje').update({ estado: 'RECHAZADO', id_revisor_asignado: id_revisor }).eq('id_viaje', id_viaje)
  if (updateError) return res.status(500).json({ error: updateError.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/:id_viaje/comentario', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const { descripcion, id_gasto } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion || descripcion.trim() === '') return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })

  if (id_gasto) {
    const { data: gasto } = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', id_gasto).single()
    if (!gasto || gasto.id_viaje !== parseInt(id_viaje)) {
      return res.status(400).json({ error: 'El gasto no pertenece a este viaje' })
    }
  }

  const { data: viaje } = await supabase.from('Viaje').select('ciclo_revision').eq('id_viaje', id_viaje).single()

  const { error } = await supabase.from('Comentario').insert({
    descripcion: descripcion.trim(), fecha: new Date().toISOString(),
    id_usuario, id_viaje: parseInt(id_viaje), tipo: 'OBSERVACION',
    id_gasto: id_gasto || null,
    ciclo_revision: viaje?.ciclo_revision || 1,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario agregado correctamente' })
})

router.put('/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje, id_comentario } = req.params
  const { descripcion } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion || descripcion.trim() === '') return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })
  const { data: comentario } = await supabase.from('Comentario').select('*').eq('id_comentario', id_comentario).eq('id_viaje', id_viaje).single()
  if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' })
  if (comentario.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para editar este comentario' })
  const { error } = await supabase.from('Comentario').update({ descripcion: descripcion.trim() }).eq('id_comentario', id_comentario)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario editado correctamente' })
})

router.delete('/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje, id_comentario } = req.params
  const id_usuario = req.user.id_usuario
  const { data: comentario } = await supabase.from('Comentario').select('*').eq('id_comentario', id_comentario).eq('id_viaje', id_viaje).single()
  if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' })
  if (comentario.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' })
  const { error } = await supabase.from('Comentario').delete().eq('id_comentario', id_comentario)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario eliminado correctamente' })
})

module.exports = router;