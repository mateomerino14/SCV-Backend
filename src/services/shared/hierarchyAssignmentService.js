const supabase = require('../../config/supabase');

// Reemplazos aprobados del viaje, que no pueden revisar esa rendicion
const getTripSubstituteIds = async (tripId) => {
  if (!tripId) {
    return [];
  }
  const {data} = await supabase
    .from('Solicitud_Reemplazo')
    .select('id_sustituto')
    .eq('id_viaje', tripId)
    .eq('estado', 'APROBADA');
  return (data || []).map((row) => row.id_sustituto);
};

// Resuelve quien revisa a una persona: su jefe directo, su seccion o todos con ese rol
const resolveReviewerScope = async (personId, roleName, excludeIds = []) => {
  const {data: person} = await supabase
    .from('Usuario')
    .select('id_jefe_directo, id_seccion')
    .eq('id_usuario', personId)
    .single();
  if (person?.id_jefe_directo) {
    const {data: boss} = await supabase
      .from('Usuario')
      .select('id_usuario, activo, Rol(nombre)')
      .eq('id_usuario', person.id_jefe_directo)
      .single();
    if (boss?.activo && boss.Rol?.nombre === roleName && !excludeIds.includes(boss.id_usuario)) {
      return {level: 'directo', userIds: [boss.id_usuario]};
    }
  }
  if (person?.id_seccion) {
    const {data: sameSection} = await supabase
      .from('Usuario')
      .select('id_usuario, Rol!inner(nombre)')
      .eq('activo', true)
      .eq('id_seccion', person.id_seccion)
      .eq('Rol.nombre', roleName)
      .neq('id_usuario', personId);
    const allowed = (sameSection || []).filter((user) => !excludeIds.includes(user.id_usuario));
    if (allowed.length > 0) {
      return {level: 'seccion', userIds: allowed.map((user) => user.id_usuario)};
    }
  }
  return {level: 'todos', userIds: null, excludeIds};
};

// Roles de una sola persona, a los que no se aplica la jerarquia
const uniqueRoles = ['REVISOR', 'APROBADOR'];

// Devuelve el id del unico usuario activo con un rol unico, o null si no hay
const getUniqueRoleHolder = async (roleName) => {
  const {data} = await supabase
    .from('Usuario')
    .select('id_usuario, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', roleName)
    .limit(1);
  return data?.[0]?.id_usuario || null;
};

// Asigna al usuario los viajes de su etapa sin asignar o de otra persona (roles unicos)
const claimStageTrips = async (userId, assignedField, states) => {
  await supabase
    .from('Viaje')
    .update({[assignedField]: userId})
    .in('estado', states)
    .neq('id_usuario', userId)
    .or(`${assignedField}.is.null,${assignedField}.neq.${userId}`);
};

// Asigna el siguiente revisor si la jerarquia resuelve a una persona; si no, queda sin asignar
const assignNextReviewer = async (tripId, personId, roleName, assignedField) => {
  if (uniqueRoles.includes(roleName)) {
    const {data: trip} = await supabase.from('Viaje').select('id_usuario').eq('id_viaje', tripId).single();
    let holderId = await getUniqueRoleHolder(roleName);
    // Nadie revisa su propio viaje
    if (holderId && trip?.id_usuario === holderId) {
      holderId = null;
    }
    await supabase.from('Viaje').update({[assignedField]: holderId}).eq('id_viaje', tripId);
    return {level: 'unico', userIds: holderId ? [holderId] : []};
  }
  const substituteIds = await getTripSubstituteIds(tripId);
  const scope = await resolveReviewerScope(personId, roleName, substituteIds);
  if (scope.level === 'directo') {
    await supabase.from('Viaje').update({[assignedField]: scope.userIds[0]}).eq('id_viaje', tripId);
  }
  else {
    await supabase.from('Viaje').update({[assignedField]: null}).eq('id_viaje', tripId);
  }
  return scope;
};

// Filtra los viajes que le corresponden al solicitante segun la jerarquia
const filterTripsByHierarchy = async (trips, requesterId, roleName, ownerIdExtractor) => {
  const results = [];
  for (const trip of trips) {
    const ownerId = ownerIdExtractor(trip);
    const substituteIds = await getTripSubstituteIds(trip.id_viaje);
    if (substituteIds.includes(requesterId)) {
      continue;
    }
    const scope = await resolveReviewerScope(ownerId, roleName, substituteIds);
    if (scope.level === 'directo') {
      if (scope.userIds.includes(requesterId)) {
        results.push(trip);
      }
    }
    else if (scope.level === 'seccion') {
      if (scope.userIds.includes(requesterId)) {
        results.push(trip);
      }
    }
    else {
      results.push(trip);
    }
  }
  return results;
};

// Filtra una lista de viajes ya obtenida por la seccion del empleado dueno de cada viaje
const filterBySection = (trips, seccionId) => {
  if (!seccionId) {
    return trips;
  }
  return trips.filter((trip) => String(trip.Usuario?.id_seccion) === String(seccionId));
};

module.exports = {getTripSubstituteIds, resolveReviewerScope, assignNextReviewer, filterTripsByHierarchy, filterBySection, claimStageTrips, getUniqueRoleHolder, uniqueRoles};
