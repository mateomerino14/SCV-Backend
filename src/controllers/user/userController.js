const supabase = require('../../config/supabase')
const bcrypt = require('bcrypt')
const userService = require('../../services/user/userService')
const saltRounds = 10

// Obtiene el perfil del usuario autenticado
const getMe = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd), Rol(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza los datos basicos del usuario autenticado
const updateMe = async (req, res) => {
  const userId = req.user.id_usuario
  const {telefono, email_corporativo, foto_perfil} = req.body
  const fieldsToUpdate = {}
  if (telefono !== undefined) {
    fieldsToUpdate.telefono = telefono?.trim() || null
  }
  if (email_corporativo !== undefined) {
    fieldsToUpdate.email_corporativo = email_corporativo
  }
  if (foto_perfil !== undefined) {
    fieldsToUpdate.foto_perfil = foto_perfil
  }
  const {data, error} = await supabase
    .from('Usuario')
    .update(fieldsToUpdate)
    .eq('id_usuario', userId)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd)')
    .single()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza la foto de perfil del usuario autenticado
const updateMyPhoto = async (req, res) => {
  const userId = req.user.id_usuario
  if (!req.file) {
    return res.status(400).json({error: 'No se recibió ninguna imagen'})
  }
  const fileExtension = req.file.originalname.split('.').pop()
  const fileName = `perfiles/${userId}_${Date.now()}.${fileExtension}`
  const {error: storageError} = await supabase.storage
    .from('facturas')
    .upload(fileName, req.file.buffer, {contentType: req.file.mimetype})
  if (storageError) {
    return res.status(500).json({error: storageError.message})
  }
  const {data: urlData} = supabase.storage.from('facturas').getPublicUrl(fileName)
  const {data, error} = await supabase
    .from('Usuario')
    .update({foto_perfil: urlData.publicUrl})
    .eq('id_usuario', userId)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre, monto_diario, monto_diario_usd)')
    .single()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Cambia la contrasenia del usuario autenticado
const changeMyPassword = async (req, res) => {
  const userId = req.user.id_usuario
  const {contrasenia_actual, contrasenia_nueva} = req.body
  if (!contrasenia_actual || !contrasenia_nueva) {
    return res.status(400).json({error: 'Todos los campos son requeridos'})
  }
  if (contrasenia_nueva.length < 6) {
    return res.status(400).json({error: 'La nueva contraseña debe tener al menos 6 caracteres'})
  }
  const {data: user, error: userError} = await supabase
    .from('Usuario').select('contrasenia').eq('id_usuario', userId).single()
  if (userError || !user) {
    return res.status(404).json({error: 'Usuario no encontrado'})
  }
  const isPasswordValid = bcrypt.compareSync(contrasenia_actual, user.contrasenia)
  if (!isPasswordValid) {
    return res.status(400).json({error: 'La contraseña actual es incorrecta'})
  }
  const newPasswordHash = bcrypt.hashSync(contrasenia_nueva, saltRounds)
  const {error: updateError} = await supabase
    .from('Usuario')
    .update({contrasenia: newPasswordHash, ultima_cambio_contrasenia: new Date().toISOString()})
    .eq('id_usuario', userId)
  if (updateError) {
    return res.status(500).json({error: updateError.message})
  }
  else {
    return res.json({message: 'Contraseña actualizada correctamente'})
  }
};

// Lista todos los usuarios
const getAllUsers = async (req, res) => {
  const {data, error} = await supabase.from('Usuario').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un usuario existente, validando roles y cargos unicos
const updateUser = async (req, res) => {
  const userId = req.params.id
  const {data: currentUser} = await supabase
    .from('Usuario')
    .select('id_rol, id_cargo, activo')
    .eq('id_usuario', userId)
    .single()
  const payload = {...req.body}
  if (payload.telefono !== undefined) {
    payload.telefono = payload.telefono?.trim() || null
  }
  if (payload.contrasenia) {
    payload.contrasenia = bcrypt.hashSync(payload.contrasenia, saltRounds)
  }
  let newRole = currentUser?.id_rol
  if (payload.id_rol !== undefined) {
    newRole = payload.id_rol
  }
  let newPosition = currentUser?.id_cargo
  if (payload.id_cargo !== undefined) {
    newPosition = payload.id_cargo
  }
  let willBeActive = currentUser?.activo
  if (payload.activo !== undefined) {
    willBeActive = payload.activo
  }
  if (willBeActive) {
    const roleError = await userService.validateUniqueRole(newRole, userId)
    if (roleError) {
      return res.status(400).json({error: roleError})
    }
    const positionError = await userService.validateUniquePosition(newPosition, userId)
    if (positionError) {
      return res.status(400).json({error: positionError})
    }
  }
  const roleChanged = currentUser && payload.id_rol && payload.id_rol !== currentUser.id_rol
  const wasSuspended = currentUser && payload.activo === false && currentUser.activo === true
  if (roleChanged || wasSuspended) {
    payload.refresh_token_invalido_desde = new Date().toISOString()
    await userService.releaseAssignedTrips(userId)
  }
  const {data, error} = await supabase
    .from('Usuario').update(payload).eq('id_usuario', userId).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo usuario, validando rol y cargo unicos
const createUser = async (req, res) => {
  const body = {...req.body}
  if (body.telefono !== undefined) {
    body.telefono = body.telefono?.trim() || null
  }
  if (body.contrasenia) {
    body.contrasenia = bcrypt.hashSync(body.contrasenia, saltRounds)
  }
  const roleError = await userService.validateUniqueRole(body.id_rol, null)
  if (roleError) {
    return res.status(400).json({error: roleError})
  }
  const positionError = await userService.validateUniquePosition(body.id_cargo, null)
  if (positionError) {
    return res.status(400).json({error: positionError})
  }
  const {data, error} = await supabase.from('Usuario').insert(body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un usuario existente
const deleteUser = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario').delete().eq('id_usuario', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Verifica si un correo corporativo ya esta registrado
const checkEmail = async (req, res) => {
  const {email_corporativo} = req.body
  const {data, error} = await supabase
    .from('Usuario').select('id_usuario').eq('email_corporativo', email_corporativo).single()
  return res.json({exists: !!data && !error})
};

// Lista todos los empleados con datos basicos
const getEmployees = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, foto_perfil')
    .order('nombre', {ascending: true})
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data || [])
  }
};

// Lista todos los usuarios con datos completos
const getAllUsersDetailed = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, telefono, activo, foto_perfil, id_rol, numero_dependencia, numero_seccion, Cargo(id_cargo, nombre), Rol(nombre)')
    .order('nombre', {ascending: true})
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data || [])
  }
};

// Activa un usuario, validando rol y cargo unicos
const activateUser = async (req, res) => {
  const userId = req.params.id
  const {data: user} = await supabase
    .from('Usuario').select('id_rol, id_cargo').eq('id_usuario', userId).single()
  if (user) {
    const roleError = await userService.validateUniqueRole(user.id_rol, userId)
    if (roleError) {
      return res.status(400).json({error: roleError})
    }
    const positionError = await userService.validateUniquePosition(user.id_cargo, userId)
    if (positionError) {
      return res.status(400).json({error: positionError})
    }
  }
  const {data, error} = await supabase
    .from('Usuario').update({activo: true}).eq('id_usuario', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Suspende un usuario y libera sus viajes asignados
const suspendUser = async (req, res) => {
  await userService.releaseAssignedTrips(req.params.id)
  const {data, error} = await supabase
    .from('Usuario')
    .update({
      activo: false,
      refresh_token_invalido_desde: new Date().toISOString(),
    })
    .eq('id_usuario', req.params.id)
    .select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Obtiene el nombre del cargo del usuario autenticado
const getMyPosition = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json({cargo: data?.Cargo?.nombre || null})
  }
};

module.exports = {getMe, updateMe, updateMyPhoto, changeMyPassword, getAllUsers, updateUser, createUser, deleteUser, checkEmail, getEmployees, getAllUsersDetailed, activateUser, suspendUser, getMyPosition};