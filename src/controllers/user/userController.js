const supabase = require('../../config/supabase');
const bcrypt = require('bcrypt');
const userService = require('../../services/user/userService');
const userImportService = require('../../services/user/userImportService');
const auditLogService = require('../../services/shared/auditLogService');
const tokenService = require('../../services/user/tokenService');
const storageService = require('../../services/shared/storageService');
const saltRounds = 10;

// Columnas que se devuelven al administrar usuarios (sin hash ni datos de sesion)
const userPublicColumns = 'id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, activo, id_rol, id_cargo, id_seccion, id_jefe_directo, carnet_identidad, codigo_dependencia, foto_perfil';

// Campos que el administrador puede enviar al crear o editar un usuario
const dependencyCodeError = 'La dependencia de Oracle debe tener 3 dígitos';
const editableUserFields = ['nombre', 'apellido_paterno', 'apellido_materno', 'email_corporativo', 'telefono', 'id_cargo', 'id_rol', 'id_jefe_directo', 'id_seccion', 'carnet_identidad', 'codigo_dependencia', 'activo'];

// Deja solo los campos que el administrador puede enviar
const pickEditableFields = (body, extraFields = []) => {
  const allowed = [...editableUserFields, ...extraFields];
  return Object.fromEntries(Object.entries(body || {}).filter(([key]) => allowed.includes(key)));
};

// Obtiene el perfil del usuario autenticado
const getMe = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, carnet_identidad, id_rol, foto_perfil, id_seccion, Seccion(nombre), id_jefe_directo, Jefe:id_jefe_directo(nombre, apellido_paterno), Cargo(nombre, monto_diario, monto_diario_usd), Rol(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Foto de perfil actual del usuario, para borrarla del almacenamiento cuando se reemplaza o se quita
const getCurrentPhoto = async (userId) => {
  const {data} = await supabase.from('Usuario').select('foto_perfil').eq('id_usuario', userId).maybeSingle();
  return data?.foto_perfil || null;
};

// Actualiza los datos basicos del usuario autenticado
const updateMe = async (req, res) => {
  const userId = req.user.id_usuario;
  const {telefono, email_corporativo, foto_perfil} = req.body;
  const fieldsToUpdate = {};
  if (telefono !== undefined) {
    fieldsToUpdate.telefono = telefono?.trim() || null;
  }
  if (email_corporativo !== undefined) {
    const email = String(email_corporativo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({error: 'El correo corporativo no es válido'});
    }
    const {data: emailOwner} = await supabase.from('Usuario').select('id_usuario').eq('email_corporativo', email).neq('id_usuario', userId).maybeSingle();
    if (emailOwner) {
      return res.status(400).json({error: 'Ese correo ya está registrado por otro usuario'});
    }
    fieldsToUpdate.email_corporativo = email;
  }
  // La foto se sube por /me/photo; aqui solo se permite quitarla (no poner una URL cualquiera)
  let removedPhoto = null;
  if (foto_perfil === null || foto_perfil === '') {
    fieldsToUpdate.foto_perfil = null;
    removedPhoto = await getCurrentPhoto(userId);
  }
  const {data, error} = await supabase
    .from('Usuario')
    .update(fieldsToUpdate)
    .eq('id_usuario', userId)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre, monto_diario, monto_diario_usd)')
    .single();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  await storageService.removeFiles([removedPhoto]);
  return res.json(data);
};

// Actualiza la foto de perfil del usuario autenticado
const updateMyPhoto = async (req, res) => {
  const userId = req.user.id_usuario;
  if (!req.file) {
    return res.status(400).json({error: 'No se recibió ninguna imagen'});
  }
  const upload = await storageService.uploadFile('perfiles', req.file, `${userId}_`);
  if (upload.error) {
    return res.status(500).json({error: upload.error});
  }
  const previousPhoto = await getCurrentPhoto(userId);
  const {data, error} = await supabase
    .from('Usuario')
    .update({foto_perfil: upload.url})
    .eq('id_usuario', userId)
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, id_rol, foto_perfil, id_seccion, Seccion(nombre), Cargo(nombre, monto_diario, monto_diario_usd)')
    .single();
  if (error) {
    await storageService.removeFiles([upload.url]);
    return res.status(500).json({error: error.message});
  }
  await storageService.removeFiles([previousPhoto]);
  return res.json(data);
};

// Cambia la contrasena del usuario; con una temporal no se pide la actual
const changeMyPassword = async (req, res) => {
  const userId = req.user.id_usuario;
  const {contrasenia_actual, contrasenia_nueva} = req.body;
  if (!contrasenia_nueva) {
    return res.status(400).json({error: 'Todos los campos son requeridos'});
  }
  if (contrasenia_nueva.length < 8) {
    return res.status(400).json({error: 'La nueva contraseña debe tener al menos 8 caracteres'});
  }
  const {data: user, error: userError} = await supabase
    .from('Usuario').select('contrasenia, debe_cambiar_contrasenia').eq('id_usuario', userId).single();
  if (userError || !user) {
    return res.status(404).json({error: 'Usuario no encontrado'});
  }
  if (!user.debe_cambiar_contrasenia) {
    if (!contrasenia_actual) {
      return res.status(400).json({error: 'Todos los campos son requeridos'});
    }
    if (!bcrypt.compareSync(contrasenia_actual, user.contrasenia)) {
      return res.status(400).json({error: 'La contraseña actual es incorrecta'});
    }
  }
  if (bcrypt.compareSync(contrasenia_nueva, user.contrasenia)) {
    return res.status(400).json({error: 'La nueva contraseña no puede ser igual a la actual'});
  }
  const newPasswordHash = bcrypt.hashSync(contrasenia_nueva, saltRounds);
  const {data: updatedUser, error: updateError} = await supabase
    .from('Usuario')
    .update({
      contrasenia: newPasswordHash,
      ultima_cambio_contrasenia: new Date().toISOString(),
      debe_cambiar_contrasenia: false,
      motivo_cambio_contrasenia: null,
      // Cierra las demas sesiones abiertas (por ejemplo, si alguien mas conocia la clave)
      refresh_token_invalido_desde: new Date().toISOString(),
    })
    .eq('id_usuario', userId)
    .select('id_usuario, email_corporativo, id_rol')
    .single();
  if (updateError) {
    return res.status(500).json({error: updateError.message});
  }
  await auditLogService.logAudit(userId, 'CAMBIO_CLAVE');
  res.cookie('refreshToken', tokenService.generateRefreshToken(updatedUser), tokenService.cookieOptions);
  return res.json({message: 'Contraseña actualizada correctamente', token: tokenService.generateAccessToken(updatedUser, null)});
};

// Lista todos los usuarios
const getAllUsers = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, activo, foto_perfil, id_rol, id_cargo, id_seccion, Seccion(nombre), carnet_identidad, codigo_dependencia');
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Actualiza un usuario existente, validando roles y cargos unicos
const updateUser = async (req, res) => {
  const userId = req.params.id;
  const {data: currentUser} = await supabase
    .from('Usuario')
    .select('id_rol, id_cargo, activo')
    .eq('id_usuario', userId)
    .single();
  const payload = pickEditableFields(req.body, ['contrasenia']);
  if (payload.id_jefe_directo !== undefined && parseInt(payload.id_jefe_directo) === parseInt(userId)) {
    return res.status(400).json({error: 'Un usuario no puede ser su propio jefe directo'});
  }
  if (payload.telefono !== undefined) {
    payload.telefono = payload.telefono?.trim() || null;
  }
  if (payload.carnet_identidad !== undefined) {
    payload.carnet_identidad = payload.carnet_identidad?.trim() || null;
  }
  if (payload.codigo_dependencia !== undefined) {
    payload.codigo_dependencia = String(payload.codigo_dependencia || '').trim() || null;
    if (payload.codigo_dependencia && !/^\d{3}$/.test(payload.codigo_dependencia)) {
      return res.status(400).json({error: dependencyCodeError});
    }
  }
  if (payload.contrasenia) {
    // Una contrasena puesta por el administrador es temporal: el usuario debe cambiarla al entrar
    payload.contrasenia = bcrypt.hashSync(payload.contrasenia, saltRounds);
    payload.debe_cambiar_contrasenia = true;
    payload.motivo_cambio_contrasenia = 'TEMPORAL';
  }
  let newRole = currentUser?.id_rol;
  if (payload.id_rol !== undefined) {
    newRole = payload.id_rol;
  }
  let newPosition = currentUser?.id_cargo;
  if (payload.id_cargo !== undefined) {
    newPosition = payload.id_cargo;
  }
  let willBeActive = currentUser?.activo;
  if (payload.activo !== undefined) {
    willBeActive = payload.activo;
  }
  if (willBeActive) {
    const roleError = await userService.validateUniqueRole(newRole, userId);
    if (roleError) {
      return res.status(400).json({error: roleError});
    }
    const positionError = await userService.validateUniquePosition(newPosition, userId);
    if (positionError) {
      return res.status(400).json({error: positionError});
    }
  }
  const roleChanged = currentUser && payload.id_rol && parseInt(payload.id_rol) !== currentUser.id_rol;
  const wasSuspended = currentUser && payload.activo === false && currentUser.activo === true;
  if (roleChanged || wasSuspended) {
    payload.refresh_token_invalido_desde = new Date().toISOString();
    await userService.releaseAssignedTrips(userId);
  }
  const {data, error} = await supabase
    .from('Usuario').update(payload).eq('id_usuario', userId).select(userPublicColumns);
  if (error) {
    if (error.code === '23505') {
      return res.status(400).json({error: 'Ya existe un usuario con ese correo corporativo'});
    }
    return res.status(500).json({error: error.message});
  }
  else {
    if (payload.contrasenia) {
      await auditLogService.logAudit(parseInt(userId), 'CAMBIO_CLAVE');
    }
    return res.json(data);
  }
};

// Crea un nuevo usuario, validando rol y cargo unicos
const createUser = async (req, res) => {
  const body = pickEditableFields(req.body);
  const temporaryPassword = userService.generateTemporaryPassword();
  if (body.telefono !== undefined) {
    body.telefono = body.telefono?.trim() || null;
  }
  if (body.carnet_identidad !== undefined) {
    body.carnet_identidad = body.carnet_identidad?.trim() || null;
  }
  if (body.codigo_dependencia !== undefined) {
    body.codigo_dependencia = String(body.codigo_dependencia || '').trim() || null;
    if (body.codigo_dependencia && !/^\d{3}$/.test(body.codigo_dependencia)) {
      return res.status(400).json({error: dependencyCodeError});
    }
  }
  body.contrasenia = bcrypt.hashSync(temporaryPassword, saltRounds);
  body.debe_cambiar_contrasenia = true;
  body.motivo_cambio_contrasenia = 'TEMPORAL';
  const roleError = await userService.validateUniqueRole(body.id_rol, null);
  if (roleError) {
    return res.status(400).json({error: roleError});
  }
  const positionError = await userService.validateUniquePosition(body.id_cargo, null);
  if (positionError) {
    return res.status(400).json({error: positionError});
  }
  const {data, error} = await supabase.from('Usuario').insert(body).select(userPublicColumns);
  if (error) {
    if (error.code === '23505') {
      return res.status(400).json({error: 'Ya existe un usuario con ese correo corporativo'});
    }
    return res.status(500).json({error: error.message});
  }
  else {
    await userService.sendWelcomeEmail(data[0], temporaryPassword);
    return res.json(data);
  }
};

// Valida las filas del Excel de usuarios y devuelve lo que se crearia, sin guardar nada
const previewUserImport = async (req, res) => {
  const result = await userImportService.previewImport(req.body?.filas);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json(result);
  }
};

// Crea los usuarios validos del Excel y devuelve cuantos se crearon y que filas se omitieron
const importUsers = async (req, res) => {
  const result = await userImportService.importUsers(req.body?.filas);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  else {
    return res.json(result);
  }
};

// Elimina un usuario existente
const deleteUser = async (req, res) => {
  const previousPhoto = await getCurrentPhoto(req.params.id);
  const {data, error} = await supabase
    .from('Usuario').delete().eq('id_usuario', req.params.id).select(userPublicColumns);
  if (error) {
    return res.status(500).json({error: error.message});
  }
  await storageService.removeFiles([previousPhoto]);
  return res.json(data);
};

// Verifica si un correo corporativo ya esta registrado
const checkEmail = async (req, res) => {
  const {email_corporativo} = req.body;
  const {data, error} = await supabase
    .from('Usuario').select('id_usuario').eq('email_corporativo', email_corporativo).single();
  return res.json({exists: !!data && !error});
};

// Lista todos los empleados con datos basicos
const getEmployees = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, foto_perfil, id_seccion')
    .order('nombre', {ascending: true});
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data || []);
  }
};

// Lista todos los usuarios con datos completos
const getAllUsersDetailed = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, apellido_materno, email_corporativo, telefono, activo, foto_perfil, id_rol, id_seccion, Seccion(nombre), carnet_identidad, codigo_dependencia, id_jefe_directo, Jefe:id_jefe_directo(id_usuario, nombre, apellido_paterno), Cargo(id_cargo, nombre), Rol(nombre)')
    .order('nombre', {ascending: true});
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data || []);
  }
};

// Activa un usuario, validando rol y cargo unicos
const activateUser = async (req, res) => {
  const userId = req.params.id;
  const {data: user} = await supabase
    .from('Usuario').select('id_rol, id_cargo').eq('id_usuario', userId).single();
  if (user) {
    const roleError = await userService.validateUniqueRole(user.id_rol, userId);
    if (roleError) {
      return res.status(400).json({error: roleError});
    }
    const positionError = await userService.validateUniquePosition(user.id_cargo, userId);
    if (positionError) {
      return res.status(400).json({error: positionError});
    }
  }
  const {data, error} = await supabase
    .from('Usuario').update({activo: true}).eq('id_usuario', req.params.id).select(userPublicColumns);
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Suspende un usuario y libera sus viajes asignados
const suspendUser = async (req, res) => {
  await userService.releaseAssignedTrips(req.params.id);
  const {data, error} = await supabase
    .from('Usuario')
    .update({
      activo: false,
      refresh_token_invalido_desde: new Date().toISOString(),
    })
    .eq('id_usuario', req.params.id)
    .select(userPublicColumns);
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Obtiene el nombre del cargo del usuario autenticado
const getMyPosition = async (req, res) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('Cargo(nombre)')
    .eq('id_usuario', req.user.id_usuario)
    .single();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json({cargo: data?.Cargo?.nombre || null});
  }
};

module.exports = {getMe, updateMe, updateMyPhoto, changeMyPassword, getAllUsers, updateUser, createUser, deleteUser, checkEmail, getEmployees, getAllUsersDetailed, activateUser, suspendUser, getMyPosition, previewUserImport, importUsers};