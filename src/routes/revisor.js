const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')
const malasPalabras = require('../utils/palabrasProhibidas')

function contieneMalasPalabras(texto) {
  const textoLimpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?;:]/g, '')
  const palabras = textoLimpio.split(' ')
  for (const palabra of palabras) {
    if (malasPalabras.includes(palabra)) return true
  }
  return false
}

router.get('/pendientes', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const id_revisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total)`)
    .eq('estado', 'APROBADO_SUPERVISOR')
    .is('id_revisor_asignado', null)
    .neq('id_usuario', id_revisor)

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  return res.json((data || []).map((viaje) => {
    const gastoAcumulado = (viaje.Gasto || []).reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
    const excedePresupuesto = gastoAcumulado > parseFloat(viaje.monto_asignado)
    const alertas = []
    if (excedePresupuesto) alertas.push('EXCESO_PRESUPUESTO')
    if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')
    return { ...viaje, gastoAcumulado, excedePresupuesto, alertas, estadoRevision: alertas.length > 0 ? 'OBSERVADO' : 'CONFORME' }
  }))
})

router.get('/mis-revisiones', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const id_revisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total), Comentario(*)`)
    .eq('id_revisor_asignado', id_revisor)

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  return res.json((data || []).map((viaje) => {
    const gastoAcumulado = (viaje.Gasto || []).reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
    const excedePresupuesto = gastoAcumulado > parseFloat(viaje.monto_asignado)
    const alertas = []
    if (excedePresupuesto) alertas.push('EXCESO_PRESUPUESTO')
    if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')
    return { ...viaje, gastoAcumulado, excedePresupuesto, alertas, estadoRevision: alertas.length > 0 ? 'OBSERVADO' : 'CONFORME' }
  }))
})

router.post('/:id_viaje/tomar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('estado, id_usuario, id_revisor_asignado')
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.estado !== 'APROBADO_SUPERVISOR') return res.status(400).json({ error: 'Este viaje no está disponible para revisión final' })
  if (viaje.id_usuario === id_revisor) return res.status(403).json({ error: 'No puedes revisar tu propio viaje' })
  if (viaje.id_revisor_asignado) return res.status(409).json({ error: 'Este viaje ya fue tomado por otro revisor' })

  const { error } = await supabase
    .from('Viaje')
    .update({ id_revisor_asignado: id_revisor })
    .eq('id_viaje', id_viaje)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje tomado correctamente' })
})

router.post('/:id_viaje/devolver', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('id_revisor_asignado, estado')
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_revisor_asignado !== id_revisor) return res.status(403).json({ error: 'No puedes devolver un viaje que no tomaste' })
  if (viaje.estado !== 'APROBADO_SUPERVISOR') return res.status(400).json({ error: 'No puedes devolver un viaje ya procesado' })

  const { error } = await supabase
    .from('Viaje')
    .update({ id_revisor_asignado: null })
    .eq('id_viaje', id_viaje)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje devuelto correctamente' })
})

router.get('/:id_viaje', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  if (viaje.id_revisor_asignado && viaje.id_revisor_asignado !== id_revisor) {
    const { data: revisor } = await supabase
      .from('Usuario')
      .select('nombre, apellido_paterno')
      .eq('id_usuario', viaje.id_revisor_asignado)
      .single()
    return res.status(403).json({ error: `Este viaje está siendo revisado por ${revisor?.nombre} ${revisor?.apellido_paterno}` })
  }

  const { data: gastos } = await supabase
    .from('Gasto')
    .select(`*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo)`)
    .eq('id_viaje', id_viaje)

  const { data: comentarios } = await supabase
    .from('Comentario')
    .select('*')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_revisor)
    .order('fecha', { ascending: false })

  const gastoAcumulado = (gastos || []).reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
  const excedePresupuesto = gastoAcumulado > parseFloat(viaje.monto_asignado)
  const alertas = []
  if (excedePresupuesto) alertas.push('EXCESO_PRESUPUESTO')
  if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')

  return res.json({ viaje, gastos: gastos || [], comentarios: comentarios || [], gastoAcumulado, excedePresupuesto, alertas })
})

router.post('/:id_viaje/aprobar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_revisor_asignado').eq('id_viaje', id_viaje).single()

  if (viaje?.id_usuario === id_revisor) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje?.id_revisor_asignado !== id_revisor) return res.status(403).json({ error: 'No tienes permiso para aprobar este viaje' })

  const { error } = await supabase
    .from('Viaje').update({ estado: 'APROBADO_FINAL' }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje aprobado finalmente' })
})

router.post('/:id_viaje/rechazar', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_revisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_revisor_asignado').eq('id_viaje', id_viaje).single()

  if (viaje?.id_usuario === id_revisor) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje?.id_revisor_asignado !== id_revisor) return res.status(403).json({ error: 'No tienes permiso para rechazar este viaje' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_revisor)
    .eq('tipo', 'OBSERVACION')

  if (!obsExistentes || obsExistentes.length === 0) {
    return res.status(400).json({ error: 'Debes agregar al menos una observación antes de rechazar' })
  }

  const { error: updateError } = await supabase
    .from('Viaje').update({ estado: 'RECHAZADO', id_revisor_asignado: null }).eq('id_viaje', id_viaje)
  if (updateError) return res.status(500).json({ error: updateError.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/:id_viaje/comentario', authMiddleware, roleMiddleware(['REVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const { descripcion } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion || descripcion.trim() === '') return res.status(400).json({ error: 'La descripción es requerida' })
  if (descripcion.length > 300) return res.status(400).json({ error: 'El comentario no puede superar los 300 caracteres' })
  if (contieneMalasPalabras(descripcion)) return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })
  const { error } = await supabase.from('Comentario').insert({
    descripcion: descripcion.trim(),
    fecha: new Date().toISOString(),
    id_usuario,
    id_viaje: parseInt(id_viaje),
    tipo: 'OBSERVACION',
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