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

  if (!await bcrypt.compare(contrasenia, data.contrasenia)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' })
  }

  const token = jwt.sign(
    { id_usuario: data.id_usuario, email_corporativo: data.email_corporativo, id_rol: data.id_rol },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )

  return res.json({ token })
})

router.post('/send-code', async (req, res) => {
  const { email_corporativo } = req.body

  const { data: usuario, error: userError } = await supabase
    .from('Usuario')
    .select('id_usuario, nombre')
    .eq('email_corporativo', email_corporativo)
    .single()

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
      if (!existing) {
        unique = true
      }
    }
    return code
  }

  const code = await generateUniqueCode()
  const expiracion = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase
    .from('Codigo_Verificacion')
    .insert({ codigo: code, expiracion, activo: true, id_usuario: usuario.id_usuario })

  if (insertError) {
    return res.status(500).json({ error: insertError.message })
  }

  try {
    await sendVerificationCode(email_corporativo, usuario.nombre, code)
  } catch (emailError) {
    return res.status(500).json({ error: 'Error al enviar el correo' })
  }

  return res.json({ message: 'Código enviado correctamente', expiracion })
})

router.post('/verify-code', async (req, res) => {
  const { email_corporativo, codigo } = req.body

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
    { id_usuario: usuarioCompleto.id_usuario, email_corporativo: usuarioCompleto.email_corporativo, id_rol: usuarioCompleto.id_rol },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )

  return res.json({ message: 'Código verificado correctamente', token })
})

module.exports = router