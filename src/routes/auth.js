const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const router = require('express').Router()
const supabase = require('../config/supabase')
const { sendVerificationCode } = require('../utils/mailer')

router.post('/', async (req, res) => {
  const { email_corporativo, contrasenia } = req.body

  const { data, error } = await supabase
    .from('Usuario')
    .select('*')
    .eq('email_corporativo', email_corporativo)
    .single()

  if (error || !data) {
    return res.status(401).json({ error: 'Usuario no encontrado' })
  }

  if (!data.activo) {
    return res.status(401).json({ error: 'Tu cuenta está suspendida' })
  }

  if (!await bcrypt.compare(contrasenia, data.contrasenia)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' })
  }

  const ahora = new Date()
  const ultimoCambio = new Date(data.ultima_cambio_contrasenia || ahora)
  const diasTranscurridos = Math.floor(
    (ahora - ultimoCambio) / (1000 * 60 * 60 * 24)
  )
  const contraseniavencida = diasTranscurridos >= 90

const token = jwt.sign(
  {
    id_usuario: data.id_usuario,
    email_corporativo: data.email_corporativo,
    id_rol: data.id_rol,
    contraseniavencida,
  },
  process.env.JWT_SECRET,
  { expiresIn: '9h' }
)

return res.json({ token, contraseniavencida })
})

router.post('/send-code', async (req, res) => {
  const { email_corporativo } = req.body
  console.log('send-code llamado con:', email_corporativo)

  try {
    const { data: usuario, error: userError } = await supabase
      .from('Usuario')
      .select('id_usuario, nombre')
      .eq('email_corporativo', email_corporativo)
      .single()

    console.log('usuario encontrado:', usuario, 'error:', userError)

    if (userError || !usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
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
    console.log('código generado:', code)

    const expiracion = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase
      .from('Codigo_Verificacion')
      .insert({ codigo: code, expiracion, activo: true, id_usuario: usuario.id_usuario })

    if (insertError) {
      console.error('error al insertar código:', insertError)
      return res.status(500).json({ error: insertError.message })
    }

    console.log('intentando enviar correo a:', email_corporativo)
    await sendVerificationCode(email_corporativo, usuario.nombre, code)
    console.log('correo enviado correctamente')

    return res.json({ message: 'Código enviado correctamente', expiracion })

  } catch (e) {
    console.error('ERROR INESPERADO en send-code:', e)
    return res.status(500).json({ error: e.message || 'Error interno del servidor' })
  }
})

router.post('/verify-code', async (req, res) => {
  const { email_corporativo, codigo } = req.body
  console.log('verify-code llamado con:', { email_corporativo, codigo })
  const { data: usuario, error: userError } = await supabase
    .from('Usuario')
    .select('id_usuario')
    .eq('email_corporativo', email_corporativo)
    .single()

  if (userError || !usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { data: codeData, error: codeError } = await supabase
    .from('Codigo_Verificacion')
    .select('*')
    .eq('id_usuario', usuario.id_usuario)
    .eq('activo', true)
    .single()

  if (codeError || !codeData) {
    return res.status(400).json({ error: 'Código no encontrado' })
  }

  if (new Date() > new Date(codeData.expiracion)) {
    await supabase
      .from('Codigo_Verificacion')
      .update({ activo: false })
      .eq('id_codigo', codeData.id_codigo)
    return res.status(400).json({ error: 'Código expirado' })
  }

  if (codeData.codigo !== codigo) {
    return res.status(400).json({ error: 'Código incorrecto' })
  }

  await supabase
    .from('Codigo_Verificacion')
    .update({ activo: false })
    .eq('id_codigo', codeData.id_codigo)

  const { data: usuarioCompleto } = await supabase
    .from('Usuario')
    .select('*')
    .eq('id_usuario', usuario.id_usuario)
    .single()

  const token = jwt.sign(
    {
      id_usuario: usuarioCompleto.id_usuario,
      email_corporativo: usuarioCompleto.email_corporativo,
      id_rol: usuarioCompleto.id_rol,
    },
    process.env.JWT_SECRET,
    { expiresIn: '9h' }
  )

  return res.json({ message: 'Código verificado correctamente', token })
})
module.exports = router;