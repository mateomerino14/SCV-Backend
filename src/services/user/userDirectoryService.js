const supabase = require('../../config/supabase')
const textNormalizer = require('../../utils/textNormalizer')

const treasurerPositionName = 'asistente de caja y tesorería'

// Obtiene los usuarios activos cuyo cargo tambien esta activo
const getActiveUsersWithActivePosition = async () => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, email_corporativo, nombre, apellido_paterno, Cargo!inner(nombre, activo)')
    .eq('activo', true)
    .eq('Cargo.activo', true)
  if (error) {
    return []
  }
  else {
    return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '')
  }
};

// Filtra una lista de usuarios por el nombre de su cargo
const getUsersByPositionName = (users, positionName) => {
  const normalizedTarget = textNormalizer.normalizeText(positionName)
  return users.filter((user) => textNormalizer.normalizeText(user.Cargo?.nombre || '') === normalizedTarget)
};

module.exports = {treasurerPositionName, getActiveUsersWithActivePosition, getUsersByPositionName};