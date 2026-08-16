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

const CARGOS_MEMO = [
  'Asistente Administrativo de Seguros y Servicios',
  'Asistente Administrativo - Cargo y Descargo de Cta. Documentada',
  'Asistente de Caja y Tesorería',
  'Gerente RRHH',
  'Jefe de Recursos Humanos',
]

const CARGO_TESORERO = 'asistente de caja y tesorería'

const normalizarCargo = (nombre) =>
  (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const formatFecha = (f) => {
  const [y, m, d] = f.split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const generarMemoHTML = (viaje, aprobador, codigoViaje) => {
  const empleado = viaje.Usuario
  const fechaHoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodo = `${formatFecha(viaje.fecha_inicio)} al ${formatFecha(viaje.fecha_fin)}`
  const esAereo = (viaje.transporte || '').toLowerCase().includes('aéreo') || (viaje.transporte || '').toLowerCase().includes('aereo')
  const textoPasajes = esAereo
    ? `Asimismo, se autoriza la compra de pasajes aéreos correspondientes al trayecto indicado.`
    : `Asimismo, se autoriza la compra de pasajes terrestres correspondientes al trayecto indicado.`

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
    <strong>Ref.</strong> ${codigoViaje}<br><br>
    Cochabamba,<br>${fechaHoy}<br><br>
    ${empleado?.nombre} ${empleado?.apellido_paterno}<br>
    ${empleado?.Cargo?.nombre || ''}
  </div>
  <div class="asunto">Señor Gerente:</div>
  <p class="cuerpo">Por instrucciones de la Gerencia General, me permito comunicarle que el viaje registrado bajo el código ${codigoViaje}, con motivo de ${viaje.motivo}, correspondiente al período del ${periodo} con destino a ${viaje.destino}${viaje.origen ? ` partiendo desde ${viaje.origen}` : ''}, ha sido aprobado satisfactoriamente por esta instancia.</p>
  <p class="cuerpo">Se solicita proceder con los trámites administrativos y financieros correspondientes para la asignación y ejecución del fondo a rendir.</p>
  <p class="cuerpo">${textoPasajes}</p>
  <p class="cuerpo">El presente memorandum tiene carácter oficial y forma parte del expediente de rendición de cuentas del empleado mencionado.</p>
  <div class="despedida">Sin otro particular, reciba un cordial saludo.</div>
  <div class="firma-area">
    <div class="firma-nombre">${aprobador?.nombre} ${aprobador?.apellido_paterno}</div>
    <div class="firma-cargo">APROBADOR — MAXAM FANEXA</div>
  </div>
</body>
</html>`
}

const generarPDF = async (html) => {
  const file = { content: html }
  const options = { format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } }
  return await htmlPdf.generatePdf(file, options)
}

const obtenerUsuariosActivos = async () => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, email_corporativo, nombre, apellido_paterno, activo, Cargo(nombre, activo)')
    .eq('activo', true)

  if (error) {
    console.error('[obtenerUsuariosActivos] Error:', error)
    return []
  }

  return (data || []).filter(u =>
    u.email_corporativo &&
    u.email_corporativo.trim() !== '' &&
    u.Cargo?.activo === true
  )
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

const enviarMemo = async (viaje, aprobador, codigoViaje, todosUsuarios) => {
  const cargosMemoNorm = CARGOS_MEMO.map(c => normalizarCargo(c))
  const destinatarios = todosUsuarios.filter(u => {
    const cargoNorm = normalizarCargo(u.Cargo?.nombre)
    return cargosMemoNorm.includes(cargoNorm)
  })

  const tesoreros = todosUsuarios.filter(u => normalizarCargo(u.Cargo?.nombre) === normalizarCargo(CARGO_TESORERO))
  tesoreros.forEach(t => {
    const yaIncluido = destinatarios.some(d => d.email_corporativo === t.email_corporativo)
    if (!yaIncluido) destinatarios.push(t)
  })

  if (destinatarios.length === 0) return

  const to = destinatarios.map(d => ({ email: d.email_corporativo, name: `${d.nombre} ${d.apellido_paterno}` }))
  const htmlMemo = generarMemoHTML(viaje, aprobador, codigoViaje)
  const pdfBuffer = await generarPDF(htmlMemo)
  const pdfBase64 = pdfBuffer.toString('base64')
  const adjuntos = [{ content: pdfBase64, name: `Memorandum_${codigoViaje.replace('/', '-')}.pdf` }]
  const htmlCorreo = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Memorandum de Aprobación</h2>
    <p style="margin-bottom:8px;">Se adjunta el memorandum correspondiente al viaje <strong>${codigoViaje}</strong>. Se solicita la asignación y aprobación del fondo correspondiente.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`
  await enviarCorreo(to, `Memorandum de Aprobación — ${codigoViaje}`, htmlCorreo, adjuntos)
}

// ── FLUJO PREVIO: aprobar viaje antes de gastos (sin asignación previa) ─────

router.get('/viajes-pendientes', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const id_aprobador = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre))`)
    .eq('estado', 'APROBADO_VIAJE')
    .neq('id_usuario', id_aprobador)

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/mis-viajes', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const id_aprobador = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Comentario(*)`)
    .eq('id_aprobador_asignado', id_aprobador)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(APROBADO_VIAJE,EN_REVISION_TESORERO,RECHAZADO))')

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/viaje/:id_viaje', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_aprobador = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  const { data: comentarios } = await supabase
    .from('Comentario').select('*').eq('id_viaje', id_viaje).eq('id_usuario', id_aprobador).order('fecha', { ascending: false })

  return res.json({ viaje, comentarios: comentarios || [] })
})

router.post('/viaje/:id_viaje/aprobar', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_aprobador = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_aprobador) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje.estado !== 'APROBADO_VIAJE') return res.status(400).json({ error: 'Este viaje no está en aprobación previa' })

  const { error } = await supabase
    .from('Viaje')
    .update({ estado: 'EN_REVISION_TESORERO', id_aprobador_asignado: id_aprobador })
    .eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })

  const { data: aprobador } = await supabase
    .from('Usuario').select('nombre, apellido_paterno, email_corporativo, Cargo(nombre)').eq('id_usuario', id_aprobador).single()

  const anio = new Date().getFullYear()
  const codigoViaje = `VIA-${id_viaje}/${anio}`

  try {
    const todosUsuarios = await obtenerUsuariosActivos()
    await enviarMemo(viaje, aprobador, codigoViaje, todosUsuarios)
  } catch (emailError) {
    console.error('[POST /aprobador/viaje/:id_viaje/aprobar] Error enviando memo:', emailError)
  }

  return res.json({ message: 'Viaje aprobado, memo enviado a tesorería correctamente' })
})

router.post('/viaje/:id_viaje/rechazar', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_aprobador = req.user.id_usuario
  const { data: viaje } = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision').eq('id_viaje', id_viaje).single()
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_aprobador) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje.estado !== 'APROBADO_VIAJE') return res.status(400).json({ error: 'Este viaje no está en aprobación previa' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_aprobador)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', viaje.ciclo_revision || 1)

  if (!obsExistentes || obsExistentes.length === 0) return res.status(400).json({ error: 'Debes agregar al menos una observación antes de rechazar' })
  const { error } = await supabase
    .from('Viaje')
    .update({ estado: 'RECHAZADO', id_aprobador_asignado: id_aprobador })
    .eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/viaje/:id_viaje/comentario', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
  const { id_viaje } = req.params
  const { descripcion } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })

  const { data: viaje } = await supabase.from('Viaje').select('ciclo_revision').eq('id_viaje', id_viaje).single()

  const { error } = await supabase.from('Comentario').insert({
    descripcion: descripcion.trim(), fecha: new Date().toISOString(), id_usuario, id_viaje: parseInt(id_viaje), tipo: 'OBSERVACION',
    ciclo_revision: viaje?.ciclo_revision || 1,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario agregado correctamente' })
})

router.put('/viaje/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
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

router.delete('/viaje/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['APROBADOR']), async (req, res) => {
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