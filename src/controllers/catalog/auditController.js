const supabase = require('../../config/supabase');

const auditColumns = 'id_auditoria, fecha, tipo, Usuario(id_usuario, nombre, apellido_paterno, email_corporativo)';
const maxRowsPerRequest = 1000;

const buildAuditQuery = (filters, options) => {
  let query = supabase.from('Auditoria').select(auditColumns, options);
  if (filters.tipo) {
    query = query.eq('tipo', filters.tipo);
  }
  if (filters.id_usuario) {
    query = query.eq('id_usuario', filters.id_usuario);
  }
  if (filters.fecha_inicio) {
    query = query.gte('fecha', filters.fecha_inicio);
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha', `${filters.fecha_fin}T23:59:59`);
  }
  return query.order('fecha', {ascending: false}).order('id_auditoria', {ascending: false});
};

// Lista los registros de auditoria con filtros opcionales.
// Con pagina y limite devuelve una pagina {registros, total}; sin ellos devuelve todos
// los registros filtrados (para exportar a Excel), leyendo de a 1000 filas.
const getAllAudits = async (req, res) => {
  const page = parseInt(req.query.pagina);
  const limit = parseInt(req.query.limite);
  if (page > 0 && limit > 0) {
    const from = (page - 1) * limit;
    const {data, error, count} = await buildAuditQuery(req.query, {count: 'exact'}).range(from, from + limit - 1);
    if (error) {
      return res.status(500).json({error: error.message});
    }
    return res.json({registros: data || [], total: count || 0});
  }
  const rows = [];
  for (let from = 0; ; from += maxRowsPerRequest) {
    const {data, error} = await buildAuditQuery(req.query).range(from, from + maxRowsPerRequest - 1);
    if (error) {
      return res.status(500).json({error: error.message});
    }
    rows.push(...(data || []));
    if (!data || data.length < maxRowsPerRequest) {
      break;
    }
  }
  return res.json(rows);
};

// Crea un nuevo registro de auditoria
const createAudit = async (req, res) => {
  const {data, error} = await supabase.from('Auditoria').insert(req.body).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

// Elimina un registro de auditoria
const deleteAudit = async (req, res) => {
  const {data, error} = await supabase.from('Auditoria').delete().eq('id_auditoria', req.params.id).select();
  if (error) {
    return res.status(500).json({error: error.message});
  }
  else {
    return res.json(data);
  }
};

module.exports = {getAllAudits, createAudit, deleteAudit};