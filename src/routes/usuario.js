const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const bcrypt = require('bcrypt')
const multer = require('multer')
const saltRounds = 10
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')

const upload = multer({ storage: multer.memoryStorage() })

const ROL_APROBADOR = 5
const ROL_REVISOR = 4

const ROLES_UNICOS = [
  { id: ROL_APROBADOR, nombre: 'Aprobador' },
  { id: ROL_REVISOR, nombre: 'Revisor' },
]

const CARGOS_UNICOS = [
  'Asistente Administrativo de Seguros y Servicios',
  'Asistente Administrativo - Cargo y Descargo de Cta. Documentada',
  'Asistente de Caja y Tesorería',
  'Gerente RRHH',
  'Jefe de Recursos Humanos',
]

const normalizarCargoTexto = (nombre) =>
  (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const CARGOS_UNICOS_NORM = CARGOS_UNICOS.map(normalizarCargoTexto)

async function validarRolUnico(id_rol, id_usuario_excluir) {
  const rolInfo = ROLES_UNICOS.find(r => r.id === parseInt(id_rol))
  if (!rolInfo) return null
  let query = supabase.from('Usuario').select('id_usuario').eq('id_rol', rolInfo.id).eq('activo', true)
  if (id_usuario_excluir) query = query.neq('id_usuario', id_usuario_excluir)
  const { data } = await query
  if (data && data.length > 0) return `Ya existe un usuario activo con el rol de ${rolInfo.nombre}. Solo puede haber uno en el sistema.`
  return null
}

async function validarCargoUnico(id_cargo, id_usuario_excluir) {
  if (!id_cargo) return null
  const { data: cargo } = await supabase.from('Cargo').select('nombre').eq('id_cargo', id_cargo).single()
  if (!cargo) return null

  const cargoNorm = normalizarCargoTexto(cargo.nombre)
  if (!CARGOS_UNICOS_NORM.includes(cargoNorm)) return null

  let query = supabase.from('Usuario').select('id_usuario, Cargo(nombre)').eq('activo', true)
  if (id_usuario_excluir) query = query.neq('id_usuario', id_usuario_excluir)
  const { data } = await query
  const yaExiste = (data || []).some(u => normalizarCargoTexto(u.Cargo?.nombre) === cargoNorm)
  if (yaExiste) return `Ya existe un usuario activo con el cargo de "${cargo.nombre}". Solo puede haber uno en el sistema.`
  return null
}

async function liberarViajesAsignados(id_usuario) {
  await supabase.from('Viaje')
    .update({ id_supervisor_asignado: null })
    .eq('id_supervisor_asignado', id_usuario)
    .in('estado', ['EN_REVISION_VIAJE', 'EN_REVISION'])

  await supabase.from('Viaje')
    .update({ id_aprobador_asignado: null })
    .eq('id_aprobador_asignado', id_usuario)
    .eq('estado', 'APROBADO_VIAJE')

  await supabase.from('Viaje')
    .update({ id_revisor_asignado: null })
    .eq('id_revisor_asignado', id_usuario)
    .eq('estado', 'APROBADO_SUPERVISOR')

  await supabase.from('Viaje')
    .update({ id_tesorero_asignado: null })
    .eq('id_tesorero_asignado', id_usuario)
    .eq('estado', 'EN_REVISION_TESORERO')
}

router.get('/me', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd), Rol(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.put('/me/actualizar', authMiddleware, async (req, res) => {
  const id_usuario = req.user.id_usuario
  const { telefono, email_corporativo, foto_perfil } = req.body
  const camposActualizar = {}
  if (telefono !== undefined) camposActualizar.telefono = telefono?.trim() || null
  if (email_corporativo !== undefined) camposActualizar.email_corporativo = email_corporativo
  if (foto_perfil !== undefined) camposActualizar.foto_perfil = foto_perfil
  const { data, error } = await supabase
    .from('Usuario')
    .update(camposActualizar)
    .eq('id_usuario', id_usuario)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd)')
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
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd)')
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
  const id_usuario = req.params.id

  const { data: usuarioActual } = await supabase
    .from('Usuario')
    .select('id_rol, id_cargo, activo')
    .eq('id_usuario', id_usuario)
    .single()

  const payload = { ...req.body }

  if (payload.telefono !== undefined) {
    payload.telefono = payload.telefono?.trim() || null
  }

  if (payload.contrasenia) {
    payload.contrasenia = bcrypt.hashSync(payload.contrasenia, saltRounds)
  }

  const rolACambiar = payload.id_rol !== undefined ? payload.id_rol : usuarioActual?.id_rol
  const cargoACambiar = payload.id_cargo !== undefined ? payload.id_cargo : usuarioActual?.id_cargo
  const quedaraActivo = payload.activo !== undefined ? payload.activo : usuarioActual?.activo

  if (quedaraActivo) {
    const errorRol = await validarRolUnico(rolACambiar, id_usuario)
    if (errorRol) return res.status(400).json({ error: errorRol })

    const errorCargo = await validarCargoUnico(cargoACambiar, id_usuario)
    if (errorCargo) return res.status(400).json({ error: errorCargo })
  }

  const rolCambio = usuarioActual && payload.id_rol && payload.id_rol !== usuarioActual.id_rol
  const suspendido = usuarioActual && payload.activo === false && usuarioActual.activo === true

  if (rolCambio || suspendido) {
    payload.refresh_token_invalido_desde = new Date().toISOString()
    await liberarViajesAsignados(id_usuario)
  }

  const { data, error } = await supabase
    .from('Usuario').update(payload).eq('id_usuario', id_usuario).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const body = { ...req.body }

  if (body.telefono !== undefined) {
    body.telefono = body.telefono?.trim() || null
  }

  if (body.contrasenia) {
    body.contrasenia = bcrypt.hashSync(body.contrasenia, saltRounds)
  }

  const errorRol = await validarRolUnico(body.id_rol, null)
  if (errorRol) return res.status(400).json({ error: errorRol })

  const errorCargo = await validarCargoUnico(body.id_cargo, null)
  if (errorCargo) return res.status(400).json({ error: errorCargo })

  const { data, error } = await supabase.from('Usuario').insert(body).select()
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

router.get('/empleados', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR', 'REVISOR', 'APROBADOR']), async (req, res) => {
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
  const id_usuario = req.params.id

  const { data: usuario } = await supabase
    .from('Usuario').select('id_rol, id_cargo').eq('id_usuario', id_usuario).single()

  if (usuario) {
    const errorRol = await validarRolUnico(usuario.id_rol, id_usuario)
    if (errorRol) return res.status(400).json({ error: errorRol })

    const errorCargo = await validarCargoUnico(usuario.id_cargo, id_usuario)
    if (errorCargo) return res.status(400).json({ error: errorCargo })
  }

  const { data, error } = await supabase
    .from('Usuario').update({ activo: true }).eq('id_usuario', req.params.id).select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.patch('/:id/suspender', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  await liberarViajesAsignados(req.params.id)
  const { data, error } = await supabase
    .from('Usuario')
    .update({
      activo: false,
      refresh_token_invalido_desde: new Date().toISOString(),
    })
    .eq('id_usuario', req.params.id)
    .select()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.get('/mi-cargo', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('Usuario')
    .select('Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ cargo: data?.Cargo?.nombre || null })
})

module.exports = router;