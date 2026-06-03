const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const roleMiddleware = require('../middlewares/roleAuth')

router.get('/dashboard', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data: usuarios } = await supabase.from('Usuario').select('id_usuario, activo, id_rol, Rol(nombre)')
  const { data: viajes } = await supabase.from('Viaje').select('id_viaje, estado')
  const { data: cargos } = await supabase.from('Cargo').select('id_cargo, activo')

  const totalUsuarios = usuarios?.length || 0
  const usuariosActivos = usuarios?.filter((u) => u.activo).length || 0
  const totalCargos = cargos?.length || 0
  const cargosActivos = cargos?.filter((c) => c.activo).length || 0
  const viajesEnCurso = viajes?.filter((v) => v.estado === 'EN_CURSO').length || 0
  const viajesEnRevision = viajes?.filter((v) => v.estado === 'EN_REVISION').length || 0
  const viajesAprobados = viajes?.filter((v) => v.estado === 'APROBADO').length || 0
  const viajesRechazados = viajes?.filter((v) => v.estado === 'RECHAZADO').length || 0

  const rolCount = {}
  for (const u of usuarios || []) {
    const nombre = u.Rol?.nombre || 'Sin rol'
    rolCount[nombre] = (rolCount[nombre] || 0) + 1
  }
  const usuariosPorRol = Object.entries(rolCount).map(([nombre, cantidad]) => ({ nombre, cantidad }))

  return res.json({
    totalUsuarios,
    usuariosActivos,
    totalCargos,
    cargosActivos,
    viajesEnCurso,
    viajesEnRevision,
    viajesAprobados,
    viajesRechazados,
    usuariosPorRol,
  })
})

module.exports = router;