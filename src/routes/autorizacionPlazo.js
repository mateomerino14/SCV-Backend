const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')
const SibApiV3Sdk = require('sib-api-v3-sdk')

const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

const DIAS_TOLERANCIA = 4

const formatFecha = (f) => {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

const enviarCorreo = async (to, subject, htmlContent) => {
  if (!to || to.length === 0) return
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  await api.sendTransacEmail({
    sender: { name: 'Sistema de Viáticos', email: 'mateomerino988@gmail.com' },
    to, subject, htmlContent,
  })
}

const obtenerRevisoresActivos = async () => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, activo, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', 'REVISOR')
  if (error) return []
  return (data || []).filter(u => u.email_corporativo && u.email_corporativo.trim() !== '')
}

// ── Empleado: solicitar autorización ─────────────────────────────────────────

router.post('/viaje/:id_viaje/solicitar', authMiddleware, async (req, res) => {
  const { id_viaje } = req.params
  const { motivo } = req.body
  const id_usuario = req.user.id_usuario

  if (!motivo?.trim()) return res.status(400).json({ error: 'Debes indicar el motivo del retraso' })
  if (motivo.length > 500) return res.status(400).json({ error: 'El motivo no puede superar los 500 caracteres' })

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('id_usuario, motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno)')
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso sobre este viaje' })

  const { data: existente } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('id_solicitud')
    .eq('id_viaje', id_viaje)
    .eq('estado', 'PENDIENTE')
    .maybeSingle()

  if (existente) return res.status(400).json({ error: 'Ya existe una solicitud pendiente para este viaje' })

  const { data: solicitud, error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .insert({ id_viaje, id_empleado: id_usuario, motivo: motivo.trim() })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  try {
    const revisores = await obtenerRevisoresActivos()
    const to = revisores.map(r => ({ email: r.email_corporativo, name: `${r.nombre} ${r.apellido_paterno}` }))
    const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
      <h2 style="font-size:16pt;margin-bottom:12px;">Solicitud de Autorización de Plazo</h2>
      <p style="margin-bottom:8px;">${viaje.Usuario?.nombre} ${viaje.Usuario?.apellido_paterno} solicita autorización para seguir registrando gastos del viaje "${viaje.motivo}" fuera del plazo de tolerancia.</p>
      <p style="margin-bottom:8px;"><strong>Motivo:</strong> ${motivo.trim()}</p>
      <p style="font-size:10pt;color:#666;margin-top:16px;">Ingresa al sistema para aprobar o rechazar esta solicitud.</p>
    </div>`
    await enviarCorreo(to, `Solicitud de Autorización de Plazo — Viaje de ${viaje.Usuario?.nombre}`, html)
  } catch (e) {
    console.warn('Error notificando revisores:', e.message)
  }

  return res.json({ message: 'Solicitud enviada correctamente', solicitud })
})

router.get('/viaje/:id_viaje/estado', authMiddleware, async (req, res) => {
  const { id_viaje } = req.params
  const id_usuario = req.user.id_usuario

  const { data: viaje } = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', id_viaje).single()
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso sobre este viaje' })

  const { data, error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*')
    .eq('id_viaje', id_viaje)
    .order('fecha_solicitud', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })

  if (data && data.estado === 'APROBADA' && data.fecha_respuesta) {
    const limiteExtendido = new Date(data.fecha_respuesta)
    limiteExtendido.setDate(limiteExtendido.getDate() + DIAS_TOLERANCIA)
    const hoy = new Date().toISOString().split('T')[0]
    const limiteExtendidoStr = limiteExtendido.toISOString().split('T')[0]
    data.extension_vencida = hoy > limiteExtendidoStr
    data.limite_extendido = limiteExtendidoStr
  }

  return res.json(data || null)
})

// ── Revisor: gestionar solicitudes ───────────────────────────────────────────

router.get('/pendientes', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select(`*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))`)
    .eq('estado', 'PENDIENTE')
    .order('fecha_solicitud', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/historial', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select(`*, Viaje(id_viaje, motivo, origen, destino, fecha_inicio, fecha_fin, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, Cargo(nombre)))`)
    .in('estado', ['APROBADA', 'RECHAZADA'])
    .order('fecha_respuesta', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.post('/:id_solicitud/aprobar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_solicitud } = req.params
  const id_revisor = req.user.id_usuario

  const { data: solicitud } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Viaje(motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', id_solicitud)
    .single()

  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
  if (solicitud.estado !== 'PENDIENTE') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' })

  const fechaRespuesta = new Date()
  const { error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({ estado: 'APROBADA', id_revisor, fecha_respuesta: fechaRespuesta.toISOString() })
    .eq('id_solicitud', id_solicitud)

  if (error) return res.status(500).json({ error: error.message })

  try {
    const empleado = solicitud.Viaje?.Usuario
    if (empleado?.email_corporativo) {
      const inicioStr = formatFecha(fechaRespuesta.toISOString().split('T')[0])
      const limiteExtendido = new Date(fechaRespuesta)
      limiteExtendido.setDate(limiteExtendido.getDate() + DIAS_TOLERANCIA)
      const limiteStr = formatFecha(limiteExtendido.toISOString().split('T')[0])

      const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
        <h2 style="font-size:16pt;margin-bottom:12px;">Autorización Aprobada</h2>
        <p style="margin-bottom:8px;">Tu solicitud para seguir registrando gastos del viaje "${solicitud.Viaje?.motivo}" fuera del plazo ha sido aprobada.</p>
        <p style="margin-bottom:8px;">Ya puedes continuar registrando tus gastos. Tu nuevo plazo es del <strong>${inicioStr}</strong> al <strong>${limiteStr}</strong> para completar tus registros. Si necesitas más tiempo después de esa fecha, deberás solicitar una nueva autorización.</p>
      </div>`
      await enviarCorreo([{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }], `Autorización Aprobada — ${solicitud.Viaje?.motivo}`, html)
    }
  } catch (e) {
    console.warn('Error notificando al empleado:', e.message)
  }

  return res.json({ message: 'Solicitud aprobada correctamente' })
})

router.post('/:id_solicitud/rechazar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_solicitud } = req.params
  const { observacion } = req.body
  const id_revisor = req.user.id_usuario

  if (!observacion?.trim()) return res.status(400).json({ error: 'Debes indicar el motivo del rechazo' })
  if (observacion.length > 500) return res.status(400).json({ error: 'La observación no puede superar los 500 caracteres' })

  const { data: solicitud } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .select('*, Viaje(motivo, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, email_corporativo))')
    .eq('id_solicitud', id_solicitud)
    .single()

  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
  if (solicitud.estado !== 'PENDIENTE') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' })

  const { error } = await supabase
    .from('Solicitud_Autorizacion_Plazo')
    .update({ estado: 'RECHAZADA', id_revisor, observacion_revisor: observacion.trim(), fecha_respuesta: new Date().toISOString() })
    .eq('id_solicitud', id_solicitud)

  if (error) return res.status(500).json({ error: error.message })

  try {
    const empleado = solicitud.Viaje?.Usuario
    if (empleado?.email_corporativo) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
        <h2 style="font-size:16pt;margin-bottom:12px;">Autorización Rechazada</h2>
        <p style="margin-bottom:8px;">Tu solicitud para el viaje "${solicitud.Viaje?.motivo}" fue rechazada.</p>
        <p style="margin-bottom:8px;"><strong>Motivo:</strong> ${observacion.trim()}</p>
      </div>`
      await enviarCorreo([{ email: empleado.email_corporativo, name: `${empleado.nombre} ${empleado.apellido_paterno}` }], `Autorización Rechazada — ${solicitud.Viaje?.motivo}`, html)
    }
  } catch (e) {
    console.warn('Error notificando al empleado:', e.message)
  }

  return res.json({ message: 'Solicitud rechazada correctamente' })
})

module.exports = router;