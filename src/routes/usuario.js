const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const bcrypt = require('bcrypt')
const multer = require('multer')
const saltRounds = 10
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')

const upload = multer({ storage: multer.memoryStorage() })

router.get('/me', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario), Rol(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/me/actualizar', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario
  const { telefono, email_corporativo, foto_perfil } = req.body
  const camposActualizar = {}
  if (telefono !== undefined) camposActualizar.telefono = telefono
  if (email_corporativo !== undefined) camposActualizar.email_corporativo = email_corporativo
  if (foto_perfil !== undefined) camposActualizar.foto_perfil = foto_perfil
  const { data, error } = await supabase
    .from('Usuario')
    .update(camposActualizar)
    .eq('id_usuario', id_usuario)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario)')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/me/foto', authMiddleware, upload.single('foto'), async (req, res) => {
  const id_usuario = req.user.id_usuario
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  const extension = req.file.originalname.split('.').pop()
  const fileName = `perfiles/${id_usuario}_${Date.now()}.${extension}`
  const { error: storageError } = await supabase.storage
    .from('facturas')
    .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
  if (storageError) return res.status(500).json({ error: storageError.message })
  const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
  const { data, error } = await supabase
    .from('Usuario')
    .update({ foto_perfil: urlData.publicUrl })
    .eq('id_usuario', id_usuario)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario)')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/me/cambiar-contrasenia', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario
  const { contrasenia_actual, contrasenia_nueva } = req.body
  if (!contrasenia_actual || !contrasenia_nueva) return res.status(400).json({ error: 'Todos los campos son requeridos' })
  if (contrasenia_nueva.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
  const { data: usuario, error: usuarioError } = await supabase
    .from('Usuario').select('contrasenia').eq('id_usuario', id_usuario).single()
  if (usuarioError || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
  const contraseniaValida = bcrypt.compareSync(contrasenia_actual, usuario.contrasenia)
  if (!contraseniaValida) return res.status(400).json({ error: 'La contraseña actual es incorrecta' })
  const nuevaHash = bcrypt.hashSync(contrasenia_nueva, saltRounds)
  const { error: updateError } = await supabase
    .from('Usuario')
    .update({ contrasenia: nuevaHash, ultima_cambio_contrasenia: new Date().toISOString() })
    .eq('id_usuario', id_usuario)
  if (updateError) return res.status(500).json({ error: updateError.message })
  return res.json({ message: 'Contraseña actualizada correctamente' })
})

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase.from('Usuario').select('*')
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  if (req.body.contrasenia) {
    req.body.contrasenia = bcrypt.hashSync(req.body.contrasenia, saltRounds)
  }
  const { data, error } = await supabase
    .from('Usuario').update(req.body).eq('id_usuario', req.params.id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  if (req.body.contrasenia) {
    req.body.contrasenia = bcrypt.hashSync(req.body.contrasenia, saltRounds)
  }
  const { data, error } = await supabase.from('Usuario').insert(req.body).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario').delete().eq('id_usuario', req.params.id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/check-email', async (req, res) => {
  const { email_corporativo } = req.body
  const { data, error } = await supabase
    .from('Usuario').select('id_usuario').eq('email_corporativo', email_corporativo).single()
  return res.json({ exists: !!data && !error })
})

router.get('/empleados', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR', 'REVISOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, foto_perfil')
    .order('nombre', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.get('/todos', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, telefono, activo, foto_perfil, id_rol, numero_dependencia, numero_seccion, Cargo(id_cargo, nombre), Rol(nombre)')
    .order('nombre', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data || [])
})

router.patch('/:id/activar', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario').update({ activo: true }).eq('id_usuario', req.params.id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.patch('/:id/suspender', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario').update({ activo: false }).eq('id_usuario', req.params.id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

module.exports = router;