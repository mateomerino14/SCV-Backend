const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const supabase = require('../../config/supabase')
const tokenService = require('../../services/user/tokenService')
const emailService = require('../../services/shared/emailService')

// Inicia sesion con correo corporativo y contrasenia
const login = async (req, res) => {
  const {email_corporativo, contrasenia} = req.body
  const {data, error} = await supabase
    .from('Usuario')
    .select('*')
    .eq('email_corporativo', email_corporativo)
    .single()
  if (error || !data) {
    return res.status(401).json({error: 'Usuario no encontrado'})
  }
  if (!data.activo) {
    return res.status(401).json({error: 'Tu cuenta está suspendida'})
  }
  const isPasswordValid = await bcrypt.compare(contrasenia, data.contrasenia)
  if (!isPasswordValid) {
    return res.status(401).json({error: 'Contraseña incorrecta'})
  }
  const passwordExpired = tokenService.isPasswordExpired(data.ultima_cambio_contrasenia)
  await supabase
    .from('Usuario')
    .update({refresh_token_invalido_desde: null})
    .eq('id_usuario', data.id_usuario)
  const accessToken = tokenService.generateAccessToken(data, passwordExpired)
  const refreshToken = tokenService.generateRefreshToken(data)
  res.cookie('refreshToken', refreshToken, tokenService.cookieOptions)
  return res.json({token: accessToken, contraseniavencida: passwordExpired})
};

// Genera un nuevo access token a partir del refresh token
const refresh = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken
  if (!refreshToken) {
    return res.status(401).json({error: 'Sin refresh token'})
  }
  try {
    const decodedToken = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const {data: user} = await supabase
      .from('Usuario')
      .select('*')
      .eq('id_usuario', decodedToken.id_usuario)
      .single()
    if (!user || !user.activo) {
      res.clearCookie('refreshToken', tokenService.cookieOptions)
      return res.status(401).json({error: 'Usuario no válido'})
    }
    if (user.refresh_token_invalido_desde) {
      const tokenIssuedAt = new Date(decodedToken.iat * 1000)
      const invalidSince = new Date(user.refresh_token_invalido_desde)
      if (tokenIssuedAt < invalidSince) {
        res.clearCookie('refreshToken', tokenService.cookieOptions)
        return res.status(401).json({error: 'Sesión invalidada, vuelve a iniciar sesión'})
      }
    }
    const passwordExpired = tokenService.isPasswordExpired(user.ultima_cambio_contrasenia)
    const newAccessToken = tokenService.generateAccessToken(user, passwordExpired)
    return res.json({token: newAccessToken})
  }
  catch (error) {
    res.clearCookie('refreshToken', tokenService.cookieOptions)
    return res.status(401).json({error: 'Refresh token inválido'})
  }
};

// Cierra la sesion del usuario
const logout = (req, res) => {
  res.clearCookie('refreshToken', tokenService.cookieOptions)
  return res.json({message: 'Sesión cerrada'})
};

// Genera un codigo de verificacion unico de 7 digitos
const generateUniqueCode = async () => {
  let unique = false
  let code = ''
  while (!unique) {
    code = Math.floor(1000000 + Math.random() * 9000000).toString()
    const {data: existing} = await supabase
      .from('Codigo_Verificacion')
      .select('id_codigo')
      .eq('codigo', code)
      .eq('activo', true)
      .single()
    if (!existing) {
      unique = true
    }
  }
  return code
};

// Envia un codigo de verificacion al correo del usuario
const sendCode = async (req, res) => {
  const {email_corporativo} = req.body
  try {
    const {data: user, error: userError} = await supabase
      .from('Usuario')
      .select('id_usuario, nombre')
      .eq('email_corporativo', email_corporativo)
      .single()
    if (userError || !user) {
      return res.status(404).json({error: 'Usuario no encontrado'})
    }
    const {valid, reason} = await emailService.validateEmailExists(email_corporativo)
    if (!valid) {
      return res.status(400).json({error: reason || 'El correo no existe o no puede recibir mensajes'})
    }
    await supabase
      .from('Codigo_Verificacion')
      .update({activo: false})
      .eq('id_usuario', user.id_usuario)
    const code = await generateUniqueCode()
    const expiration = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const {error: insertError} = await supabase
      .from('Codigo_Verificacion')
      .insert({codigo: code, expiracion: expiration, activo: true, id_usuario: user.id_usuario})
    if (insertError) {
      return res.status(500).json({error: insertError.message})
    }
    await emailService.sendVerificationCode(email_corporativo, user.nombre, code)
    return res.json({message: 'Código enviado correctamente', expiracion: expiration})
  }
  catch (error) {
    return res.status(500).json({error: error.message || 'Error interno del servidor'})
  }
};

// Verifica el codigo enviado y genera los tokens de sesion
const verifyCode = async (req, res) => {
  const {email_corporativo, codigo} = req.body
  const {data: user, error: userError} = await supabase
    .from('Usuario')
    .select('id_usuario')
    .eq('email_corporativo', email_corporativo)
    .single()
  if (userError || !user) {
    return res.status(404).json({error: 'Usuario no encontrado'})
  }
  const {data: codeData, error: codeError} = await supabase
    .from('Codigo_Verificacion')
    .select('*')
    .eq('id_usuario', user.id_usuario)
    .eq('activo', true)
    .single()
  if (codeError || !codeData) {
    return res.status(400).json({error: 'Código no encontrado'})
  }
  if (new Date() > new Date(codeData.expiracion)) {
    await supabase.from('Codigo_Verificacion').update({activo: false}).eq('id_codigo', codeData.id_codigo)
    return res.status(400).json({error: 'Código expirado'})
  }
  if (codeData.codigo !== codigo) {
    return res.status(400).json({error: 'Código incorrecto'})
  }
  await supabase.from('Codigo_Verificacion').update({activo: false}).eq('id_codigo', codeData.id_codigo)
  const {data: fullUser} = await supabase
    .from('Usuario')
    .select('*')
    .eq('id_usuario', user.id_usuario)
    .single()
  await supabase
    .from('Usuario')
    .update({refresh_token_invalido_desde: null})
    .eq('id_usuario', fullUser.id_usuario)
  const accessToken = tokenService.generateAccessToken(fullUser)
  const refreshToken = tokenService.generateRefreshToken(fullUser)
  res.cookie('refreshToken', refreshToken, tokenService.cookieOptions)
  return res.json({message: 'Código verificado correctamente', token: accessToken})
};

module.exports = {login, refresh, logout, sendCode, verifyCode};