const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const malasPalabras = require('../utils/palabrasProhibidas')

function contieneMalasPalabras(texto) {
  const textoLimpio = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?;:]/g, '')
  const palabras = textoLimpio.split(' ')
  for (const palabra of palabras) {
    if (malasPalabras.includes(palabra)) return true
  }
  return false
}

router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('Viaje').select('*')
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.get('/dashboard', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario

  const { data: viajesBorrador } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', id_usuario)
    .eq('estado', 'BORRADOR')
    .order('fecha_inicio', { ascending: false })

  const { data: viajesEnCurso } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', id_usuario)
    .eq('estado', 'EN_CURSO')
    .order('fecha_inicio', { ascending: false })

  const viajesEnCursoConGasto = await Promise.all(
    (viajesEnCurso || []).map(async (viaje) => {
      const { data: gastos } = await supabase
        .from('Gasto')
        .select('monto_total, es_gasto_internacional')
        .eq('id_viaje', viaje.id_viaje)

      const gastoAcumulado = (gastos || [])
        .filter(g => !g.es_gasto_internacional)
        .reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)

      const gastoAcumuladoUsd = (gastos || [])
        .filter(g => !!g.es_gasto_internacional)
        .reduce((sum, g) => sum + parseFloat(g.monto_total || 0), 0)

      return { ...viaje, gastoAcumulado, gastoAcumuladoUsd }
    })
  )

  const { data: viajesRecientes, error: recientesError } = await supabase
  .from('Viaje')
  .select('*')
  .eq('id_usuario', id_usuario)
  .neq('estado', 'EN_CURSO')
  .neq('estado', 'BORRADOR')
  .order('fecha_inicio', { ascending: false })
  .limit(15)

  if (recientesError) return res.status(500).json({ error: recientesError.message })

  return res.json({
    viajesBorrador: viajesBorrador || [],
    viajesEnCurso: viajesEnCursoConGasto,
    viajesRecientes: viajesRecientes || []
  })
})

const CATEGORIA_ESTADOS = {
  BORRADOR: ['BORRADOR'],
  PREVIO: ['EN_REVISION_VIAJE', 'APROBADO_VIAJE', 'EN_REVISION_TESORERO'],
  GASTOS: ['EN_CURSO', 'EN_REVISION', 'APROBADO_SUPERVISOR', 'APROBADO_FINAL'],
}

router.get('/historial', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario
  const { pagina = 1, limite = 20, filtro = 'TODOS' } = req.query
  const paginaNum = Math.max(1, parseInt(pagina))
  const limiteNum = Math.max(1, Math.min(100, parseInt(limite)))
  const desde = (paginaNum - 1) * limiteNum
  const hasta = desde + limiteNum - 1

  let query = supabase
    .from('Viaje')
    .select('*', { count: 'exact' })
    .eq('id_usuario', id_usuario)

  if (filtro === 'RECHAZADO_PREVIO') {
    query = query.eq('estado', 'RECHAZADO').eq('fue_iniciado', false)
  } else if (filtro === 'RECHAZADO_GASTOS') {
    query = query.eq('estado', 'RECHAZADO').eq('fue_iniciado', true)
  } else if (filtro === 'PREVIO') {
    query = query.or(`estado.in.(${CATEGORIA_ESTADOS.PREVIO.join(',')}),and(estado.eq.RECHAZADO,fue_iniciado.eq.false)`)
  } else if (filtro === 'GASTOS') {
    query = query.or(`estado.in.(${CATEGORIA_ESTADOS.GASTOS.join(',')}),and(estado.eq.RECHAZADO,fue_iniciado.eq.true)`)
  } else if (filtro !== 'TODOS') {
    query = query.eq('estado', filtro)
  }

  const { data, error, count } = await query
    .order('fecha_inicio', { ascending: false })
    .range(desde, hasta)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ viajes: data || [], total: count || 0, pagina: paginaNum, limite: limiteNum })
})

router.get('/:id', authMiddleware, async (req, res) => {
  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))')
    .eq('id_viaje', req.params.id)
    .single()
  if (viajeError) return res.status(500).json({ error: viajeError.message })

  const { data: gastos, error: gastosError } = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', req.params.id)
  if (gastosError) return res.status(500).json({ error: gastosError.message })

  const { data: comentarios } = await supabase
    .from('Comentario')
    .select('*')
    .eq('id_viaje', req.params.id)
    .order('fecha', { ascending: false })

  return res.json({ viaje, gastos: gastos || [], comentarios: comentarios || [] })
})

router.post('/', authMiddleware, async (req, res) => {
  const { motivo, origen, destino, fecha_inicio, fecha_fin, tipo, transporte, monto_asignado, monto_asignado_usd } = req.body
  const id_usuario = req.user.id_usuario

  const { data, error } = await supabase
    .from('Viaje')
    .insert({
      motivo,
      origen: origen || null,
      destino,
      fecha_inicio,
      fecha_fin,
      tipo,
      transporte: transporte || 'Terrestre',
      monto_asignado,
      monto_asignado_usd: monto_asignado_usd || 0,
      estado: 'BORRADOR',
      id_usuario,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Viaje')
    .update(req.body)
    .eq('id_viaje', req.params.id)
    .select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/:id/editar', authMiddleware, async (req, res) => {
  const { motivo, origen, destino, fecha_inicio, fecha_fin, tipo, transporte, monto_asignado, monto_asignado_usd } = req.body
  const id_usuario = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('estado, id_usuario, ciclo_revision')
    .eq('id_viaje', req.params.id)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para editar este viaje' })
  if (viaje.estado !== 'RECHAZADO' && viaje.estado !== 'BORRADOR') {
    return res.status(400).json({ error: 'Solo puedes editar viajes en borrador o rechazados' })
  }

  const updateData = {
    motivo,
    origen: origen || null,
    destino,
    fecha_inicio,
    fecha_fin,
    tipo,
    transporte: transporte || 'Terrestre',
    monto_asignado,
    monto_asignado_usd: monto_asignado_usd || 0,
  }

  if (viaje.estado === 'RECHAZADO') {
    updateData.estado = 'EN_REVISION_VIAJE'
    updateData.id_supervisor_asignado = null
    updateData.id_aprobador_asignado = null
    updateData.id_revisor_asignado = null
    updateData.id_tesorero_asignado = null
    updateData.ciclo_revision = (viaje.ciclo_revision || 1) + 1
  }

  const { error } = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({
    message: viaje.estado === 'RECHAZADO'
      ? 'Viaje reeditado y reenviado a revisión correctamente'
      : 'Borrador actualizado correctamente'
  })
})

router.put('/:id/enviar-revision', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('estado, id_usuario')
    .eq('id_viaje', req.params.id)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso sobre este viaje' })
  if (viaje.estado !== 'BORRADOR') return res.status(400).json({ error: 'Solo puedes enviar a revisión un viaje que esté en borrador' })

  const { error } = await supabase
    .from('Viaje')
    .update({ estado: 'EN_REVISION_VIAJE' })
    .eq('id_viaje', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ message: 'Viaje enviado a revisión correctamente' })
})

router.put('/:id/confirmar-finalizacion', authMiddleware, async (req, res) => {
  const { justificacion } = req.body
  const id_usuario = req.user.id_usuario

  const { data: viaje } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_viaje', req.params.id)
    .single()

  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' })
  if (viaje.id_usuario !== id_usuario) return res.status(403).json({ error: 'No tienes permiso para finalizar este viaje' })
  if (viaje.estado !== 'EN_CURSO' && viaje.estado !== 'RECHAZADO') {
    return res.status(400).json({ error: 'Solo puedes finalizar viajes en curso o rechazados (en fase de gastos)' })
  }

  if (justificacion && contieneMalasPalabras(justificacion)) {
    return res.status(400).json({ error: 'La justificación contiene palabras inapropiadas' })
  }

  const veniaRechazado = viaje.estado === 'RECHAZADO'

  const updateData = {
    estado: 'EN_REVISION',
    id_supervisor_asignado: null,
    id_aprobador_asignado: null,
    id_revisor_asignado: null,
  }

  if (veniaRechazado) {
    updateData.ciclo_revision = (viaje.ciclo_revision || 1) + 1
  }

  const { error: updateError } = await supabase
    .from('Viaje')
    .update(updateData)
    .eq('id_viaje', req.params.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  if (justificacion) {
    await supabase.from('Comentario').insert({
      descripcion: justificacion,
      fecha: new Date().toISOString(),
      id_usuario,
      id_viaje: parseInt(req.params.id),
      tipo: 'JUSTIFICACION',
      ciclo_revision: updateData.ciclo_revision || viaje.ciclo_revision || 1,
    })
  }

  return res.json({ message: 'Viaje enviado a revisión de gastos correctamente' })
})

router.delete('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Viaje')
    .delete()
    .eq('id_viaje', req.params.id)
    .select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

module.exports = router;