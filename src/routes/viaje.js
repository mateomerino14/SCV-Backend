const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const malasPalabras = require('../utils/palabrasProhibidas')

function contieneMalasPalabras(texto) {
  const textoLimpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?;:]/g, '')
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
        .select('monto_total')
        .eq('id_viaje', viaje.id_viaje)
      const gastoAcumulado = (gastos || []).reduce((sum, g) => sum + parseFloat(g.monto_total), 0)
      return { ...viaje, gastoAcumulado }
    })
  )

  const { data: viajesRecientes, error: recientesError } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', id_usuario)
    .neq('estado', 'EN_CURSO')
    .order('fecha_inicio', { ascending: false })

  if (recientesError) return res.status(500).json({ error: recientesError.message })

  return res.json({
    viajesEnCurso: viajesEnCursoConGasto,
    viajesRecientes: viajesRecientes || []
  })
})

router.get('/historial', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario
  const { data, error } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_usuario', id_usuario)
    .neq('estado', 'EN_CURSO')
    .order('fecha_inicio', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/:id', authMiddleware, async (req, res) => {
  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_viaje', req.params.id)
    .single()
  if (viajeError) return res.status(500).json({ error: viajeError.message })

  const { data: gastos, error: gastosError } = await supabase
    .from('Gasto')
    .select('*, Categoria_Gasto(nombre), Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal)')
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
  const { motivo, destino, fecha_inicio, fecha_fin, tipo, entorno_destino, monto_asignado } = req.body
  const id_usuario = req.user.id_usuario

  const { data, error } = await supabase
    .from('Viaje')
    .insert({ motivo, destino, fecha_inicio, fecha_fin, tipo, entorno_destino, monto_asignado, estado: 'EN_CURSO', id_usuario })
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

router.put('/:id/enviar-revision', authMiddleware, async (req, res) => {
  const { justificacion } = req.body
  const id_usuario = req.user.id_usuario

  const { data: viaje, error: viajeError } = await supabase
    .from('Viaje')
    .select('*')
    .eq('id_viaje', req.params.id)
    .single()

  if (viajeError || !viaje) return res.status(404).json({ error: 'Viaje no encontrado' })

  if (viaje.estado !== 'EN_CURSO' && viaje.estado !== 'RECHAZADO') {
    return res.status(400).json({ error: 'Solo se pueden enviar a revisión viajes en curso o rechazados' })
  }

  if (justificacion && contieneMalasPalabras(justificacion)) {
    return res.status(400).json({ error: 'La justificación contiene palabras inapropiadas' })
  }

  const { error: updateError } = await supabase
    .from('Viaje')
    .update({ estado: 'EN_REVISION' })
    .eq('id_viaje', req.params.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  if (justificacion) {
    const { error: comentarioError } = await supabase
      .from('Comentario')
      .insert({
        descripcion: justificacion,
        fecha: new Date().toISOString(),
        id_usuario,
        id_viaje: parseInt(req.params.id),
        tipo: 'JUSTIFICACION',
      })
    if (comentarioError) return res.status(500).json({ error: comentarioError.message })
  }

  return res.json({ message: 'Viaje enviado a revisión correctamente' })
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