const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const router = require('express').Router()
const supabase = require('../config/supabase')
const { sendVerificationCode, validateEmailExists } = require('../utils/mailer')

const generarAccessToken = (usuario, contraseniavencida = false) => {
  return jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      email_corporativo: usuario.email_corporativo,
      id_rol: usuario.id_rol,
      contraseniavencida,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' } //15m de produccion, corregir en el use menu
  )
}

const generarRefreshToken = (usuario) => {
  return jwt.sign(
    { id_usuario: usuario.id_usuario },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )
}

const cookieOpciones = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

router.post('/', async (req, res) => {
  const { email_corporativo, contrasenia } = req.body

  const { data, error } = await supabase
    .from('Usuario')
    .select('*')
    .eq('email_corporativo', email_corporativo)
    .single()

  if (error || !data) return res.status(401).json({ error: 'Usuario no encontrado' })
  if (!data.activo) return res.status(401).json({ error: 'Tu cuenta está suspendida' })
  if (!await bcrypt.compare(contrasenia, data.contrasenia)) return res.status(401).json({ error: 'Contraseña incorrecta' })

  const ahora = new Date()
  const ultimoCambio = new Date(data.ultima_cambio_contrasenia || ahora)
  const ahoraFecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const ultimoCambioFecha = new Date(ultimoCambio.getFullYear(), ultimoCambio.getMonth(), ultimoCambio.getDate())
  const diasTranscurridos = Math.floor((ahoraFecha - ultimoCambioFecha) / (1000 * 60 * 60 * 24))
  const contraseniavencida = diasTranscurridos >= 90

  await supabase
    .from('Usuario')
    .update({ refresh_token_invalido_desde: null })
    .eq('id_usuario', data.id_usuario)

  const accessToken = generarAccessToken(data, contraseniavencida)
  const refreshToken = generarRefreshToken(data)

  res.cookie('refreshToken', refreshToken, cookieOpciones)
  return res.json({ token: accessToken, contraseniavencida })
})

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken
  if (!refreshToken) return res.status(401).json({ error: 'Sin refresh token' })

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

    const { data: usuario } = await supabase
      .from('Usuario')
      .select('*')
      .eq('id_usuario', decoded.id_usuario)
      .single()

    if (!usuario || !usuario.activo) {
      res.clearCookie('refreshToken', cookieOpciones)
      return res.status(401).json({ error: 'Usuario no válido' })
    }

    if (usuario.refresh_token_invalido_desde) {
      const tokenEmitidoEn = new Date(decoded.iat * 1000)
      const invalidoDesde = new Date(usuario.refresh_token_invalido_desde)
      if (tokenEmitidoEn < invalidoDesde) {
        res.clearCookie('refreshToken', cookieOpciones)
        return res.status(401).json({ error: 'Sesión invalidada, vuelve a iniciar sesión' })
      }
    }

    const ahora = new Date()
    const ultimoCambio = new Date(usuario.ultima_cambio_contrasenia || ahora)
    const ahoraFecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    const ultimoCambioFecha = new Date(ultimoCambio.getFullYear(), ultimoCambio.getMonth(), ultimoCambio.getDate())
    const diasTranscurridos = Math.floor((ahoraFecha - ultimoCambioFecha) / (1000 * 60 * 60 * 24))
    const contraseniavencida = diasTranscurridos >= 90

    const nuevoAccessToken = generarAccessToken(usuario, contraseniavencida)
    return res.json({ token: nuevoAccessToken })

  } catch (error) {
    res.clearCookie('refreshToken', cookieOpciones)
    return res.status(401).json({ error: 'Refresh token inválido' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', cookieOpciones)
  return res.json({ message: 'Sesión cerrada' })
})

router.post('/send-code', async (req, res) => {
  const { email_corporativo } = req.body
  try {
    const { data: usuario, error: userError } = await supabase
      .from('Usuario')
      .select('id_usuario, nombre')
      .eq('email_corporativo', email_corporativo)
      .single()

    if (userError || !usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const { valid, reason } = await validateEmailExists(email_corporativo)

    if (!valid) {
      return res.status(400).json({ error: reason || 'El correo no existe o no puede recibir mensajes' })
    }

    await supabase
      .from('Codigo_Verificacion')
      .update({ activo: false })
      .eq('id_usuario', usuario.id_usuario)

    const generateUniqueCode = async () => {
      let unique = false
      let code = ''
      while (!unique) {
        code = Math.floor(1000000 + Math.random() * 9000000).toString()
        const { data: existing } = await supabase
          .from('Codigo_Verificacion')
          .select('id_codigo')
          .eq('codigo', code)
          .eq('activo', true)
          .single()
        if (!existing) unique = true
      }
      return code
    }

    const code = await generateUniqueCode()
    const expiracion = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase
      .from('Codigo_Verificacion')
      .insert({ codigo: code, expiracion, activo: true, id_usuario: usuario.id_usuario })

    if (insertError) return res.status(500).json({ error: insertError.message })

    await sendVerificationCode(email_corporativo, usuario.nombre, code)
    return res.json({ message: 'Código enviado correctamente', expiracion })

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno del servidor' })
  }
})

router.post('/verify-code', async (req, res) => {
  const { email_corporativo, codigo } = req.body

  const { data: usuario, error: userError } = await supabase
    .from('Usuario')
    .select('id_usuario')
    .eq('email_corporativo', email_corporativo)
    .single()

  if (userError || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  const { data: codeData, error: codeError } = await supabase
    .from('Codigo_Verificacion')
    .select('*')
    .eq('id_usuario', usuario.id_usuario)
    .eq('activo', true)
    .single()

  if (codeError || !codeData) return res.status(400).json({ error: 'Código no encontrado' })

  if (new Date() > new Date(codeData.expiracion)) {
    await supabase.from('Codigo_Verificacion').update({ activo: false }).eq('id_codigo', codeData.id_codigo)
    return res.status(400).json({ error: 'Código expirado' })
  }

  if (codeData.codigo !== codigo) return res.status(400).json({ error: 'Código incorrecto' })

  await supabase.from('Codigo_Verificacion').update({ activo: false }).eq('id_codigo', codeData.id_codigo)

  const { data: usuarioCompleto } = await supabase
    .from('Usuario')
    .select('*')
    .eq('id_usuario', usuario.id_usuario)
    .single()

  await supabase
    .from('Usuario')
    .update({ refresh_token_invalido_desde: null })
    .eq('id_usuario', usuarioCompleto.id_usuario)

  const accessToken = generarAccessToken(usuarioCompleto)
  const refreshToken = generarRefreshToken(usuarioCompleto)

  res.cookie('refreshToken', refreshToken, cookieOpciones)
  return res.json({ message: 'Código verificado correctamente', token: accessToken })
})

module.exports = router;