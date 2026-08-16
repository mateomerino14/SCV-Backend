const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const malasPalabras = require('../utils/palabrasProhibidas')
const SibApiV3Sdk = require('sib-api-v3-sdk')
const htmlPdf = require('html-pdf-node')

const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

const CARGO_TESORERO = 'asistente de caja y tesorería'

const normalizarCargo = (nombre) =>
  (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function contieneMalasPalabras(texto) {
  const textoLimpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?;:]/g, '')
  const palabras = textoLimpio.split(' ')
  for (const palabra of palabras) {
    if (malasPalabras.includes(palabra)) return true
  }
  return false
}

// ── Middleware: solo usuarios con cargo de tesorero, sin importar el rol ────

async function requiereCargoTesorero(req, res, next) {
  const { data: usuario } = await supabase
    .from('Usuario')
    .select('id_usuario, Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()

  if (!usuario || normalizarCargo(usuario.Cargo?.nombre) !== normalizarCargo(CARGO_TESORERO)) {
    return res.status(403).json({ error: 'No tienes el cargo requerido para acceder a esta sección' })
  }

  next()
}

const formatFecha = (f) => {
  const [y, m, d] = f.split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

const generarConfirmacionHTML = (viaje, tesorero, codigoViaje) => {
  const empleado = viaje.Usuario
  const fechaHoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const esInternacional = viaje.tipo === 'Internacional'

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
  <p class="cuerpo">Estimado(a) ${empleado?.nombre} ${empleado?.apellido_paterno},</p>
  <p class="cuerpo">Le confirmamos que el fondo correspondiente al viaje ${codigoViaje} (${viaje.motivo}) ha sido aprobado por Tesorería con fecha ${fechaHoy}. Ya puede proceder a registrar sus gastos.</p>
  <div class="montos-box">
    <div class="montos-fila"><span>Fondo Nacional (Bs)</span><span><strong>Bs. ${parseFloat(viaje.monto_asignado).toFixed(2)}</strong></span></div>
    ${esInternacional ? `<div class="montos-fila"><span>Fondo Internacional (USD)</span><span><strong>USD ${parseFloat(viaje.monto_asignado_usd || 0).toFixed(2)}</strong></span></div>` : ''}
  </div>
  <p class="cuerpo">Cualquier consulta adicional puede dirigirla a Tesorería.</p>
  <div class="firma-area">
    <div class="firma-nombre">${tesorero?.nombre} ${tesorero?.apellido_paterno}</div>
    <div class="firma-cargo">TESORERÍA — MAXAM FANEXA</div>
  </div>
</body>
</html>`
}

const enviarConfirmacionAlEmpleado = async (viaje, tesorero, codigoViaje) => {
  const empleado = viaje.Usuario
  if (!empleado?.email_corporativo) return

  const htmlConfirmacion = generarConfirmacionHTML(viaje, tesorero, codigoViaje)
  const pdfBuffer = await generarPDF(htmlConfirmacion)
  const pdfBase64 = pdfBuffer.toString('base64')
  const adjuntos = [{ content: pdfBase64, name: `Confirmacion_Fondo_${codigoViaje.replace('/', '-')}.pdf` }]
  const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Fondo Aprobado</h2>
    <p style="margin-bottom:8px;">Tu fondo para el viaje <strong>${codigoViaje}</strong> ha sido aprobado. Ya puedes registrar tus gastos.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`

  await enviarCorreo(
    [{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }],
    `Fondo Aprobado — ${codigoViaje}`,
    htmlCorreo,
    adjuntos
  )
}

// ── Endpoints (sin asignación previa) ────────────────────────────────────────

router.get('/viajes-pendientes', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const id_tesorero = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre))`)
    .eq('estado', 'EN_REVISION_TESORERO')
    .neq('id_usuario', id_tesorero)

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/mis-viajes', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const id_tesorero = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Comentario(*)`)
    .eq('id_tesorero_asignado', id_tesorero)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(EN_REVISION_TESORERO,RECHAZADO))')

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/:id_viaje', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje } = req.params
  const id_tesorero = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  const { data: comentarios } = await supabase
    .from('Comentario').select('*').eq('id_viaje', id_viaje).eq('id_usuario', id_tesorero).order('fecha', { ascending: false })

  return res.json({ viaje, comentarios: comentarios || [] })
})

router.put('/:id_viaje/montos', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje } = req.params
  const { monto_asignado, monto_asignado_usd } = req.body

  if (monto_asignado === undefined || isNaN(parseFloat(monto_asignado)) || parseFloat(monto_asignado) < 0) {
    return res.status(400).json({ error: 'El monto asignado en Bs debe ser un número válido' })
  }

  const { data: viaje } = await supabase.from('Viaje').select('estado').eq('id_viaje', id_viaje).single()
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.estado !== 'EN_REVISION_TESORERO') return res.status(400).json({ error: 'Este viaje no está en revisión de tesorería' })

  const { error } = await supabase
    .from('Viaje')
    .update({
      monto_asignado: parseFloat(monto_asignado),
      monto_asignado_usd: monto_asignado_usd !== undefined ? parseFloat(monto_asignado_usd) || 0 : 0,
    })
    .eq('id_viaje', id_viaje)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Montos actualizados correctamente' })
})

router.post('/:id_viaje/aprobar', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje } = req.params
  const id_tesorero = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_tesorero) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje.estado !== 'EN_REVISION_TESORERO') return res.status(400).json({ error: 'Este viaje no está en revisión de tesorería' })

  const { error } = await supabase
    .from('Viaje')
    .update({ estado: 'EN_CURSO', fue_iniciado: true, id_tesorero_asignado: id_tesorero })
    .eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })

  const { data: tesorero } = await supabase
    .from('Usuario').select('nombre, apellido_paterno, Cargo(nombre)').eq('id_usuario', id_tesorero).single()

  const anio = new Date().getFullYear()
  const codigoViaje = `VIA-${id_viaje}/${anio}`

  try {
    await enviarConfirmacionAlEmpleado(viaje, tesorero, codigoViaje)
  } catch (emailError) {
    console.warn('Error enviando confirmación:', emailError.message)
  }

  return res.json({ message: 'Fondo aprobado y confirmación enviada al empleado correctamente' })
})

router.post('/:id_viaje/rechazar', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje } = req.params
  const id_tesorero = req.user.id_usuario

  const { data: viaje } = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision').eq('id_viaje', id_viaje).single()
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_tesorero) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje.estado !== 'EN_REVISION_TESORERO') return res.status(400).json({ error: 'Este viaje no está en revisión de tesorería' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_tesorero)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', viaje.ciclo_revision || 1)

  if (!obsExistentes || obsExistentes.length === 0) {
    return res.status(400).json({ error: 'Debes agregar al menos una observación antes de rechazar' })
  }

  const { error } = await supabase
    .from('Viaje')
    .update({ estado: 'RECHAZADO', id_tesorero_asignado: id_tesorero })
    .eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/:id_viaje/comentario', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje } = req.params
  const { descripcion } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })

  const { data: viaje } = await supabase.from('Viaje').select('ciclo_revision').eq('id_viaje', id_viaje).single()

  const { error } = await supabase.from('Comentario').insert({
    descripcion: descripcion.trim(), fecha: new Date().toISOString(),
    id_usuario, id_viaje: parseInt(id_viaje), tipo: 'OBSERVACION',
    ciclo_revision: viaje?.ciclo_revision || 1,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario agregado correctamente' })
})

router.put('/:id_viaje/comentario/:id_comentario', authMiddleware, requiereCargoTesorero, async (req, res) => {
  const { id_viaje, id_comentario } = req.params
  const { descripcion } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })
  const { data: comentario } = await supabase.from('Comentario').select('*').eq('id_comentario', id_comentario).eq('id_viaje', id_viaje).single()
  if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' })
  if (comentario.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para editar este comentario' })
  const { error } = await supabase.from('Comentario').update({ descripcion: descripcion.trim() }).eq('id_comentario', id_comentario)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario editado correctamente' })
})

router.delete('/:id_viaje/comentario/:id_comentario', authMiddleware, requiereCargoTesorero, async (req, res) => {
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