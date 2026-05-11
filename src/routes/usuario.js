const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const bcrypt = require('bcrypt')
const saltRounds = 10
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')

router.get('/me', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, id_rol, Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase.from('Usuario').select('*')
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  if (req.body.contrasenia) {
    req.body.contrasenia = bcrypt.hashSync(req.body.contrasenia, saltRounds)
  }
  const { data, error } = await supabase
    .from('Usuario')
    .update(req.body)
    .eq('id_usuario', req.params.id)
    .select()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  if (req.body.contrasenia) {
    req.body.contrasenia = bcrypt.hashSync(req.body.contrasenia, saltRounds)
  }
  const { data, error } = await supabase
    .from('Usuario').insert(req.body).select()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .delete()
    .eq('id_usuario', req.params.id)
    .select()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  return res.json(data)
})

router.post('/check-email', async (req, res) => {
  const { email_corporativo } = req.body
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario')
    .eq('email_corporativo', email_corporativo)
    .single()
  return res.json({ exists: !!data && !error })
})

module.exports = router