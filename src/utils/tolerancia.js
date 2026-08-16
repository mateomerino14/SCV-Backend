const supabase = require('../config/supabase')

const DIAS_TOLERANCIA = 4

const formatFecha = (s) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const sumarDias = (fechaISO, dias) => {
  const f = new Date(fechaISO)
  f.setDate(f.getDate() + dias)
  return f
}

async function validarPlazoViaje(id_viaje, fecha_evento) {
  const { data: viaje } = await supabase
    .from('Viaje')
    .select('fecha_inicio, fecha_fin')
    .eq('id_viaje', id_viaje)
    .single()

  if (!viaje) return { valido: false, error: 'Viaje no encontrado' }

  const hoy = new Date().toISOString().split('T')[0]
  const fechaFinTolerancia = sumarDias(viaje.fecha_fin, DIAS_TOLERANCIA)
  const fechaFinToleranciaStr = fechaFinTolerancia.toISOString().split('T')[0]

  if (hoy > fechaFinToleranciaStr) {
    const { data: solicitudAprobada } = await supabase
      .from('Solicitud_Autorizacion_Plazo')
      .select('id_solicitud, fecha_respuesta')
      .eq('id_viaje', id_viaje)
      .eq('estado', 'APROBADA')
      .order('fecha_respuesta', { ascending: false })
      .limit(1)
      .maybeSingle()

    let dentroDeExtension = false
    if (solicitudAprobada?.fecha_respuesta) {
      const limiteExtendido = sumarDias(solicitudAprobada.fecha_respuesta.split('T')[0], DIAS_TOLERANCIA)
      const limiteExtendidoStr = limiteExtendido.toISOString().split('T')[0]
      dentroDeExtension = hoy <= limiteExtendidoStr
    }

    if (!dentroDeExtension) {
      return {
        valido: false,
        requiereAutorizacion: true,
        error: `Han pasado más de ${DIAS_TOLERANCIA} días desde el fin del viaje (${formatFecha(viaje.fecha_fin)}). Debes solicitar autorización al revisor para continuar registrando gastos.`,
      }
    }
  }

  if (fecha_evento < viaje.fecha_inicio || fecha_evento > viaje.fecha_fin) {
    return {
      valido: false,
      error: `La fecha debe estar dentro del período del viaje (${formatFecha(viaje.fecha_inicio)} - ${formatFecha(viaje.fecha_fin)})`,
    }
  }

  return { valido: true }
}

module.exports = { validarPlazoViaje, DIAS_TOLERANCIA }