const supabase = require('../../config/supabase')

// Resuelve quien debe ver el paso de revision de una persona dada, segun la jerarquia:
// 1. su jefe directo, si esta activo y tiene el rol correcto
// 2. si no, cualquier usuario activo con ese rol que comparta su misma seccion
// 3. si tampoco, todos los usuarios activos con ese rol
const resolveReviewerScope = async (personId, roleName) => {
  const {data: person} = await supabase
    .from('Usuario')
    .select('id_jefe_directo, id_seccion')
    .eq('id_usuario', personId)
    .single()
  if (person?.id_jefe_directo) {
    const {data: boss} = await supabase
      .from('Usuario')
      .select('id_usuario, activo, Rol(nombre)')
      .eq('id_usuario', person.id_jefe_directo)
      .single()
    if (boss?.activo && boss.Rol?.nombre === roleName) {
      return {level: 'directo', userIds: [boss.id_usuario]}
    }
  }
  if (person?.id_seccion) {
    const {data: sameSection} = await supabase
      .from('Usuario')
      .select('id_usuario, Rol!inner(nombre)')
      .eq('activo', true)
      .eq('id_seccion', person.id_seccion)
      .eq('Rol.nombre', roleName)
      .neq('id_usuario', personId)
    if (sameSection && sameSection.length > 0) {
      return {level: 'seccion', userIds: sameSection.map((user) => user.id_usuario)}
    }
  }
  return {level: 'todos', userIds: null}
}

// Roles que solo puede tener una persona activa (userService.validateUniqueRole).
// A ellos no se les aplica la jerarquia: todo lo de su etapa les llega directamente.
const uniqueRoles = ['REVISOR', 'APROBADOR']

// Devuelve el id del unico usuario activo con un rol unico, o null si no hay
const getUniqueRoleHolder = async (roleName) => {
  const {data} = await supabase
    .from('Usuario')
    .select('id_usuario, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', roleName)
    .limit(1)
  return data?.[0]?.id_usuario || null
}

// Asigna al usuario actual los viajes de su etapa que quedaron sin asignar o asignados
// a otra persona (por ejemplo un revisor anterior que el administrador reemplazo).
// Solo se usa con roles unicos, donde todo lo de la etapa le corresponde a una persona.
const claimStageTrips = async (userId, assignedField, states) => {
  await supabase
    .from('Viaje')
    .update({[assignedField]: userId})
    .in('estado', states)
    .neq('id_usuario', userId)
    .or(`${assignedField}.is.null,${assignedField}.neq.${userId}`)
}

// Asigna automaticamente el siguiente revisor de un viaje cuando la jerarquia resuelve
// a una persona especifica; si resuelve a una seccion o a todos, deja el viaje sin
// asignar para que se tome del listado de pendientes
const assignNextReviewer = async (tripId, personId, roleName, assignedField) => {
  if (uniqueRoles.includes(roleName)) {
    const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single()
    let holderId = await getUniqueRoleHolder(roleName)
    // Nadie revisa su propio viaje
    if (holderId && trip?.id_usuario === holderId) {
      holderId = null
    }
    await supabase.from('Viaje').update({[assignedField]: holderId}).eq('id_viaje', tripId)
    return {level: 'unico', userIds: holderId ? [holderId] : []}
  }
  const scope = await resolveReviewerScope(personId, roleName)
  if (scope.level === 'directo') {
    await supabase.from('Viaje').update({[assignedField]: scope.userIds[0]}).eq('id_viaje', tripId)
  }
  else {
    await supabase.from('Viaje').update({[assignedField]: null}).eq('id_viaje', tripId)
  }
  return scope
}

// Filtra una lista de viajes ya obtenida para que solo aparezcan los que le
// corresponden al solicitante: asignados directamente a el, o sin asignar y dentro
// de su alcance de seccion o de "todos" segun la jerarquia del dueno de cada viaje
const filterTripsByHierarchy = async (trips, requesterId, roleName, ownerIdExtractor) => {
  const results = []
  for (const trip of trips) {
    const ownerId = ownerIdExtractor(trip)
    const scope = await resolveReviewerScope(ownerId, roleName)
    if (scope.level === 'directo') {
      if (scope.userIds.includes(requesterId)) {
        results.push(trip)
      }
    }
    else if (scope.level === 'seccion') {
      if (scope.userIds.includes(requesterId)) {
        results.push(trip)
      }
    }
    else {
      results.push(trip)
    }
  }
  return results
}

// Filtra una lista de viajes ya obtenida por la seccion del empleado dueno de cada viaje
const filterBySection = (trips, seccionId) => {
  if (!seccionId) {
    return trips
  }
  return trips.filter((trip) => String(trip.Usuario?.id_seccion) === String(seccionId))
}

module.exports = {resolveReviewerScope, assignNextReviewer, filterTripsByHierarchy, filterBySection, claimStageTrips, getUniqueRoleHolder, uniqueRoles}
