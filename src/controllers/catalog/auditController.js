const supabase = require('../../config/supabase');

const auditColumns = 'id_auditoria, fecha, tipo, detalle, Usuario(id_usuario, nombre, apellido_paterno, email_corporativo)';
const maxRowsPerRequest = 1000;
const boliviaOffset = '-04:00';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Arma la consulta de auditoria con los filtros recibidos
const buildAuditQuery = (filters, options) => {
  let query = supabase.from('Auditoria').select(auditColumns, options);
  if (filters.tipo) {
    query = query.eq('tipo', filters.tipo);
  }
  if (filters.id_usuario) {
    query = query.eq('id_usuario', filters.id_usuario);
  }
  // Los dias del filtro son dias de Bolivia, no de UTC
  if (datePattern.test(filters.fecha_inicio || '')) {
    query = query.gte('fecha', `${filters.fecha_inicio}T00:00:00${boliviaOffset}`);
  }
  if (datePattern.test(filters.fecha_fin || '')) {
    query = query.lte('fecha', `${filters.fecha_fin}T23:59:59.999${boliviaOffset}`);
  }
  return query.order('fecha', {ascending: false}).order('id_auditoria', {ascending: false});
};

// Lista los registros de auditoria; con pagina y limite devuelve una pagina, sin ellos todos
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

module.exports = {getAllAudits};
