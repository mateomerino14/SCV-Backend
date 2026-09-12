const supabase = require('../../config/supabase')

// Obtiene el set de dependencias que tienen al menos un usuario activo con el rol dado
const getDependenciesWithRole = async (roleName) => {
  const {data} = await supabase
    .from('Usuario')
    .select('numero_dependencia, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', roleName)
  const dependencies = new Set();
  (data || []).forEach((user) => {
    if (user.numero_dependencia) {
      dependencies.add(user.numero_dependencia)
    }
  })
  return dependencies
}

// Obtiene la dependencia de un usuario
const getUserDependency = async (userId) => {
  const {data} = await supabase.from('Usuario').select('numero_dependencia').eq('id_usuario', userId).single()
  return data?.numero_dependencia || null
}

// Filtra una lista de viajes para que solo se muestren a revisores de la misma dependencia
// que el empleado. Si ningun revisor de esa dependencia existe, el viaje se muestra a todos.
const filterTripsByDependency = (trips, requesterDependency, dependenciesWithRole) => {
  return trips.filter((trip) => {
    const employeeDependency = trip.Usuario?.numero_dependencia
    if (!employeeDependency) {
      return true
    }
    if (employeeDependency === requesterDependency) {
      return true
    }
    return !dependenciesWithRole.has(employeeDependency)
  })
}

module.exports = {getDependenciesWithRole, getUserDependency, filterTripsByDependency}
