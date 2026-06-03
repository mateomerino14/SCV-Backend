const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')
const malasPalabras = require('../utils/palabrasProhibidas')

function contieneMalasPalabras(texto) {
  const textoLimpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?;:]/g, '')

  const palabras = textoLimpio.split(' ')

  for (const palabra of palabras) {
    if (malasPalabras.includes(palabra)) {
      return true
    }
  }

  return false
}

router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('Comentario').select('*')

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.put('/:id', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), async (req, res) => {
  const descripcion = req.body.descripcion

  if (contieneMalasPalabras(descripcion)) {
    return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })
  }

  const comentarioActualizado = {
    descripcion,
    fecha: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('Comentario')
    .update(comentarioActualizado)
    .eq('id_comentario', req.params.id)
    .select()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.post('/', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), async (req, res) => {
  const comentarioNuevo = {
    descripcion: req.body.descripcion,
    fecha: new Date().toISOString(),
    id_usuario: req.body.id_usuario,
    id_viaje: req.body.id_viaje,
    tipo: 'OBSERVACION',
  }

  if (contieneMalasPalabras(comentarioNuevo.descripcion)) {
    return res.status(400).json({ error: 'El comentario contiene palabras inapropiadas' })
  }

  const { data, error } = await supabase
    .from('Comentario')
    .insert(comentarioNuevo)
    .select()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.delete('/:id', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Comentario')
    .delete()
    .eq('id_comentario', req.params.id)
    .select()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

module.exports = router;