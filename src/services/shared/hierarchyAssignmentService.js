const supabase = require('../../config/supabase')

// Resuelve quien debe ver el paso de revision de una persona dada, segun la jerarquia:
// 1. su jefe directo, si esta activo y tiene el rol correcto
// 2. si no, cualquier usuario activo con ese rol que comparta su misma seccion
// 3. si tampoco, todos los usuarios activos con ese rol
const resolveReviewerScope = async (personId, roleName) => {
  const {data: person} = await supabase
    .from('Usuario')
    .select('id_jefe_directo, numero_seccion')
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
  if (person?.numero_seccion) {
    const {data: sameSection} = await supabase
      .from('Usuario')
      .select('id_usuario, Rol!inner(nombre)')
      .eq('activo', true)
      .eq('numero_seccion', person.numero_seccion)
      .eq('Rol.nombre', roleName)
    if (sameSection && sameSection.length > 0) {
      return {level: 'seccion', userIds: sameSection.map((user) => user.id_usuario)}
    }
  }
  return {level: 'todos', userIds: null}
}

// Asigna automaticamente el siguiente revisor de un viaje cuando la jerarquia resuelve
// a una persona especifica; si resuelve a una seccion o a todos, deja el viaje sin
// asignar para que se tome del listado de pendientes
const assignNextReviewer = async (tripId, personId, roleName, assignedField) => {
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

module.exports = {resolveReviewerScope, assignNextReviewer, filterTripsByHierarchy}
