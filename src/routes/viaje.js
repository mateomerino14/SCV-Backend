const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')

router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('Viaje').select('*')
  if (error) {
    return res.status(500).json({ error: error.message })
  }
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
    .order('fecha_inicio', { ascending: false })

  if (recientesError) {
    return res.status(500).json({ error: recientesError.message })
  }

  return res.json({
    viajesEnCurso: viajesEnCursoConGasto,
    viajesRecientes: viajesRecientes || []
  })
})

router.put('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Viaje')
    .update(req.body)
    .eq('id_viaje', req.params.id)
    .select()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.post('/', authMiddleware, async (req, res) => {
  const { motivo, destino, fecha_inicio, fecha_fin, tipo, entorno_destino, monto_asignado } = req.body
  const id_usuario = req.user.id_usuario

  const { data, error } = await supabase
    .from('Viaje')
    .insert({ motivo, destino, fecha_inicio, fecha_fin, tipo, entorno_destino, monto_asignado, estado: 'EN_CURSO', id_usuario })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.delete('/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Viaje')
    .delete()
    .eq('id_viaje', req.params.id)
    .select()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

module.exports = router