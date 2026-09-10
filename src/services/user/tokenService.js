const jwt = require('jsonwebtoken')

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

// Genera el token de acceso de corta duracion
const generateAccessToken = (user, isPasswordExpired = false) => {
  return jwt.sign(
    {
      id_usuario: user.id_usuario,
      email_corporativo: user.email_corporativo,
      id_rol: user.id_rol,
      contraseniavencida: isPasswordExpired,
    },
    process.env.JWT_SECRET,
    {expiresIn: '15m'}
  )
};

// Genera el token de refresco de larga duracion
const generateRefreshToken = (user) => {
  return jwt.sign(
    {id_usuario: user.id_usuario},
    process.env.JWT_REFRESH_SECRET,
    {expiresIn: '7d'}
  )
};

// Calcula si la contrasenia del usuario esta vencida (mas de 90 dias)
const isPasswordExpired = (lastPasswordChange) => {
  const now = new Date()
  const lastChange = new Date(lastPasswordChange || now)
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const lastChangeDate = new Date(lastChange.getFullYear(), lastChange.getMonth(), lastChange.getDate())
  const daysElapsed = Math.floor((nowDate - lastChangeDate) / (1000 * 60 * 60 * 24))
  return daysElapsed >= 90
};

module.exports = {generateAccessToken, generateRefreshToken, isPasswordExpired, cookieOptions};