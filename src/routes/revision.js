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

const calcularGastos = (gastos, viaje) => {
  const nacionales = (gastos || []).filter(g => !g.es_gasto_internacional)
  const internacionales = (gastos || []).filter(g => !!g.es_gasto_internacional)
  const gastoAcumulado = nacionales.reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
  const gastoAcumuladoUsd = internacionales.reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)
  const excedePresupuesto = gastoAcumulado > parseFloat(viaje.monto_asignado)
  const excedePresupuestoUsd = gastoAcumuladoUsd > parseFloat(viaje.monto_asignado_usd || 0)
  return { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd }
}

router.get('/viajes-pendientes', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const id_supervisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre))`)
    .eq('estado', 'EN_REVISION_VIAJE')
    .is('id_supervisor_asignado', null)
    .neq('id_usuario', id_supervisor)

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/mis-viajes', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const id_supervisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Comentario(*)`)
    .eq('id_supervisor_asignado', id_supervisor)
    .or('estado.eq.EN_CURSO,and(fue_iniciado.eq.false,estado.in.(EN_REVISION_VIAJE,APROBADO_VIAJE,EN_REVISION_TESORERO,RECHAZADO))')

  if (fecha_inicio) query = query.gte('fecha_inicio', fecha_inicio)
  if (fecha_fin) query = query.lte('fecha_fin', fecha_fin)
  if (id_empleado) query = query.eq('id_usuario', id_empleado)

  const { data, error } = await query.order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.post('/viaje/:id_viaje/tomar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('estado, id_usuario, id_supervisor_asignado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.estado !== 'EN_REVISION_VIAJE') return res.status(400).json({ error: 'Este viaje no está disponible para revisión' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes revisar tu propio viaje' })
  if (viaje.id_supervisor_asignado) return res.status(409).json({ error: 'Este viaje ya fue tomado por otro supervisor' })

  const { error } = await supabase.from('Viaje').update({ id_supervisor_asignado: id_supervisor }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje tomado correctamente' })
})

router.post('/viaje/:id_viaje/devolver', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_supervisor_asignado, estado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No puedes devolver un viaje que no tomaste' })
  if (viaje.estado !== 'EN_REVISION_VIAJE') return res.status(400).json({ error: 'No puedes devolver este viaje' })

  const { error } = await supabase.from('Viaje').update({ id_supervisor_asignado: null }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje devuelto correctamente' })
})

router.get('/viaje/:id_viaje', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  if (viaje.id_supervisor_asignado && viaje.id_supervisor_asignado !== id_supervisor) {
    const { data: sup } = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', viaje.id_supervisor_asignado).single()
    return res.status(403).json({ error: `Este viaje está siendo revisado por ${sup?.nombre} ${sup?.apellido_paterno}` })
  }

  const { data: comentarios } = await supabase
    .from('Comentario').select('*').eq('id_viaje', id_viaje).eq('id_usuario', id_supervisor).order('fecha', { ascending: false })

  return res.json({ viaje, comentarios: comentarios || [] })
})

router.post('/viaje/:id_viaje/aprobar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_supervisor_asignado, estado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No tienes permiso para aprobar este viaje' })
  if (viaje.estado !== 'EN_REVISION_VIAJE') return res.status(400).json({ error: 'Este viaje no está en revisión previa' })

  const { error } = await supabase.from('Viaje').update({ estado: 'APROBADO_VIAJE' }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje aprobado por supervisor correctamente' })
})

router.post('/viaje/:id_viaje/rechazar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_supervisor_asignado, estado, ciclo_revision').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No tienes permiso para rechazar este viaje' })
  if (viaje.estado !== 'EN_REVISION_VIAJE') return res.status(400).json({ error: 'Este viaje no está en revisión previa' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_supervisor)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', viaje.ciclo_revision || 1)

  if (!obsExistentes || obsExistentes.length === 0) {
    return res.status(400).json({ error: 'Debes agregar al menos una observación antes de rechazar' })
  }

  const { error } = await supabase
    .from('Viaje').update({ estado: 'RECHAZADO' }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/viaje/:id_viaje/comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
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

router.put('/viaje/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
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

router.delete('/viaje/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje, id_comentario } = req.params
  const id_usuario = req.user.id_usuario
  const { data: comentario } = await supabase.from('Comentario').select('*').eq('id_comentario', id_comentario).eq('id_viaje', id_viaje).single()
  if (!comentario) return res.status(404).json({ error: 'Comentario no encontrado' })
  if (comentario.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' })
  const { error } = await supabase.from('Comentario').delete().eq('id_comentario', id_comentario)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Comentario eliminado correctamente' })
})

router.get('/pendientes', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const id_supervisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional)`)
    .eq('estado', 'EN_REVISION')
    .is('id_supervisor_asignado', null)
    .neq('id_usuario', id_supervisor)

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

router.get('/mis-revisiones', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const id_supervisor = req.user.id_usuario
  const { fecha_inicio, fecha_fin, id_empleado } = req.query

  let query = supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional), Comentario(*)`)
    .eq('id_supervisor_asignado', id_supervisor)
    .in('estado', ['EN_REVISION', 'APROBADO_SUPERVISOR', 'RECHAZADO'])
    .eq('fue_iniciado', true)

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

router.post('/:id_viaje/tomar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('estado, id_usuario, id_supervisor_asignado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.estado !== 'EN_REVISION') return res.status(400).json({ error: 'Este viaje no está en revisión de gastos' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes revisar tu propio viaje' })
  if (viaje.id_supervisor_asignado) return res.status(409).json({ error: 'Este viaje ya fue tomado por otro supervisor' })

  const { error } = await supabase.from('Viaje').update({ id_supervisor_asignado: id_supervisor }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje tomado correctamente' })
})

router.post('/:id_viaje/devolver', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_supervisor_asignado, estado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No puedes devolver un viaje que no tomaste' })
  if (viaje.estado !== 'EN_REVISION') return res.status(400).json({ error: 'No puedes devolver un viaje ya procesado' })

  const { error } = await supabase.from('Viaje').update({ id_supervisor_asignado: null }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje devuelto correctamente' })
})

router.get('/:id_viaje', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select(`*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))`)
    .eq('id_viaje', id_viaje)
    .single()

  if (viajeError) return res.status(500).json({ error: viajeError.message })
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  if (viaje.id_supervisor_asignado && viaje.id_supervisor_asignado !== id_supervisor) {
    const { data: sup } = await supabase.from('Usuario').select('nombre, apellido_paterno').eq('id_usuario', viaje.id_supervisor_asignado).single()
    return res.status(403).json({ error: `Este viaje está siendo revisado por ${sup?.nombre} ${sup?.apellido_paterno}` })
  }

  const { data: gastos } = await supabase
    .from('Gasto')
    .select(`*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)`)
    .eq('id_viaje', id_viaje)

  const { data: comentarios } = await supabase
    .from('Comentario').select('*').eq('id_viaje', id_viaje).eq('id_usuario', id_supervisor).order('fecha', { ascending: false })

  const { gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd } = calcularGastos(gastos, viaje)
  const alertas = []
  if (excedePresupuesto || excedePresupuestoUsd) alertas.push('EXCESO_PRESUPUESTO')
  if (viaje.tiene_alcohol === true) alertas.push('ALCOHOL')

  return res.json({ viaje, gastos: gastos || [], comentarios: comentarios || [], gastoAcumulado, gastoAcumuladoUsd, excedePresupuesto, excedePresupuestoUsd, alertas })
})

router.post('/:id_viaje/aprobar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_supervisor_asignado, estado').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes aprobar tu propio viaje' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No tienes permiso para aprobar este viaje' })
  if (viaje.estado !== 'EN_REVISION') return res.status(400).json({ error: 'Este viaje no está en revisión de gastos' })

  const { error } = await supabase.from('Viaje').update({ estado: 'APROBADO_SUPERVISOR' }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Gastos aprobados por supervisor correctamente' })
})

router.post('/:id_viaje/rechazar', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const id_supervisor = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje').select('id_usuario, id_supervisor_asignado, estado, ciclo_revision').eq('id_viaje', id_viaje).single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario === id_supervisor) return res.status(403).json({ error: 'No puedes rechazar tu propio viaje' })
  if (viaje.id_supervisor_asignado !== id_supervisor) return res.status(403).json({ error: 'No tienes permiso para rechazar este viaje' })
  if (viaje.estado !== 'EN_REVISION') return res.status(400).json({ error: 'Este viaje no está en revisión de gastos' })

  const { data: obsExistentes } = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_supervisor)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', viaje.ciclo_revision || 1)
    .not('id_gasto', 'is', null)

  if (!obsExistentes || obsExistentes.length === 0) {
    return res.status(400).json({ error: 'Debes agregar al menos una observación a algún gasto antes de rechazar' })
  }

  const { error } = await supabase
    .from('Viaje').update({ estado: 'RECHAZADO' }).eq('id_viaje', id_viaje)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje rechazado correctamente' })
})

router.post('/:id_viaje/comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
  const { id_viaje } = req.params
  const { descripcion, id_gasto } = req.body
  const id_usuario = req.user.id_usuario
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })
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

router.put('/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
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

router.delete('/:id_viaje/comentario/:id_comentario', authMiddleware, roleMiddleware(['SUPERVISOR']), async (req, res) => {
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