const supabase = require('../../config/supabase');
const emailService = require('./emailService');
const userDirectoryService = require('../user/userDirectoryService');

// Obtiene los usuarios activos con un rol determinado y correo corporativo
const getActiveUsersByRole = async (roleName) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', roleName);
  if (error) {
    return [];
  }
  return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '');
};

// Cuenta cuantos viajes esperan cada tipo de revision
const getPendingCounts = async () => {
  const [tripReviews, expenseReviews, approverReviews, alcoholReviews, reviewerReviews, treasurerReviews, deadlineRequests, substitutionRequests] = await Promise.all([
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_VIAJE').is('id_supervisor_asignado', null),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION').is('id_supervisor_asignado', null),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'APROBADO_VIAJE'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_APROBADOR'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'APROBADO_SUPERVISOR'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_TESORERO'),
    // Solo las solicitudes de viajes donde todavia aplican (no las de viajes ya enviados a revision)
    supabase.from('Solicitud_Autorizacion_Plazo').select('id_solicitud, Viaje!inner(estado)', {count: 'exact', head: true}).eq('estado', 'PENDIENTE').in('Viaje.estado', ['EN_CURSO']),
    supabase.from('Solicitud_Reemplazo').select('id_solicitud, Viaje!inner(estado)', {count: 'exact', head: true}).eq('estado', 'PENDIENTE').in('Viaje.estado', ['EN_CURSO', 'RECHAZADO']),
  ]);
  return {
    pendingTripReviews: tripReviews.count || 0,
    pendingExpenseReviews: expenseReviews.count || 0,
    pendingApproverReviews: approverReviews.count || 0,
    pendingAlcoholReviews: alcoholReviews.count || 0,
    pendingReviewerReviews: reviewerReviews.count || 0,
    pendingTreasurerReviews: treasurerReviews.count || 0,
    pendingDeadlineRequests: deadlineRequests.count || 0,
    pendingSubstitutionRequests: substitutionRequests.count || 0,
  };
};

// Pendientes de un supervisor: asignados a el y sin asignar dentro de su alcance
const getSupervisorPendingCounts = async (supervisorId) => {
  const reviewService = require('../approval/reviewService');
  const [assignedTrips, assignedExpenses, unassignedTrips, unassignedExpenses] = await Promise.all([
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_VIAJE').eq('id_supervisor_asignado', supervisorId),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION').eq('id_supervisor_asignado', supervisorId),
    reviewService.getPendingTripReviews(supervisorId, {}),
    reviewService.getPendingExpenseReviews(supervisorId, {}),
  ]);
  return {
    tripReviews: (assignedTrips.count || 0) + (unassignedTrips.trips || []).length,
    expenseReviews: (assignedExpenses.count || 0) + (unassignedExpenses.trips || []).length,
  };
};

// "1 viaje esperando" / "3 viajes esperando"
const countLine = (count, singular, plural, rest) => `${count} ${count === 1 ? singular : plural} ${rest}`;

// Arma y envia el resumen a un grupo; con dryRun solo lo agrega al reporte
const sendDigestToGroup = async (users, title, bodyLines, report, dryRun) => {
  if (users.length === 0 || bodyLines.length === 0) {
    return;
  }
  const items = bodyLines
    .map((line) => `<li style="margin: 0 0 8px 0; color: #2e2827; font-size: 14px;">${line}</li>`)
    .join('');
  const body = `
    ${emailService.emailParagraph('Hola, este es tu resumen de pendientes:')}
    <div style="background-color: #F3F6FF; border-left: 4px solid #870002; border-radius: 8px; padding: 14px 18px 6px 18px; margin: 4px 0 16px 0;">
      <ul style="margin: 0; padding-left: 18px;">${items}</ul>
    </div>
    ${emailService.emailParagraph('Ingresa al sistema para revisarlos.')}
    ${emailService.emailButton()}
  `;
  const html = emailService.buildEmailLayout(title, body);
  const entries = users.map((user) => ({
    nombre: `${user.nombre} ${user.apellido_paterno}`,
    correo: user.email_corporativo,
    asunto: title,
    lineas: bodyLines,
    enviado: false,
  }));
  report.push(...entries);
  if (dryRun) {
    return;
  }
  // Si falla el envio a una persona, igual se envia a las demas
  const results = await Promise.allSettled(users.map((user) => emailService.sendEmail(
    [{email: user.email_corporativo, name: `${user.nombre} ${user.apellido_paterno}`}],
    title,
    html
  )));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      entries[index].error = result.reason?.message || 'No se pudo enviar';
      console.warn(`No se pudo enviar el resumen a ${users[index].email_corporativo}:`, result.reason?.message);
    }
    else {
      entries[index].enviado = true;
    }
  });
};

// Envia el resumen de pendientes a cada revisor y devuelve a quien se envio
const sendDailyDigest = async ({dryRun = false} = {}) => {
  const report = [];
  try {
    const counts = await getPendingCounts();

    // Cada supervisor recibe sus pendientes asignados y los sin asignar de su alcance
    const supervisors = await getActiveUsersByRole('SUPERVISOR');
    for (const supervisor of supervisors) {
      const supervisorCounts = await getSupervisorPendingCounts(supervisor.id_usuario);
      const supervisorLines = [];
      if (supervisorCounts.tripReviews > 0) {
        supervisorLines.push(countLine(supervisorCounts.tripReviews, 'viaje espera', 'viajes esperan', 'tu revisión previa.'));
      }
      if (supervisorCounts.expenseReviews > 0) {
        supervisorLines.push(countLine(supervisorCounts.expenseReviews, 'rendición de gastos espera', 'rendiciones de gastos esperan', 'tu revisión.'));
      }
      await sendDigestToGroup([supervisor], 'Resumen de Pendientes — Supervisión', supervisorLines, report, dryRun);
    }

    const approvers = await getActiveUsersByRole('APROBADOR');
    const approverLines = [];
    if (counts.pendingApproverReviews > 0) {
      approverLines.push(countLine(counts.pendingApproverReviews, 'viaje espera', 'viajes esperan', 'tu aprobación antes de pasar a tesorería.'));
    }
    if (counts.pendingAlcoholReviews > 0) {
      approverLines.push(countLine(counts.pendingAlcoholReviews, 'rendición con alcohol espera', 'rendiciones con alcohol esperan', 'tu revisión adicional.'));
    }
    await sendDigestToGroup(approvers, 'Resumen de Pendientes — Aprobación', approverLines, report, dryRun);

    const reviewers = await getActiveUsersByRole('REVISOR');
    const reviewerLines = [];
    if (counts.pendingReviewerReviews > 0) {
      reviewerLines.push(countLine(counts.pendingReviewerReviews, 'rendición espera', 'rendiciones esperan', 'tu revisión final.'));
    }
    if (counts.pendingDeadlineRequests > 0) {
      reviewerLines.push(countLine(counts.pendingDeadlineRequests, 'solicitud de ampliación de plazo espera', 'solicitudes de ampliación de plazo esperan', 'tu respuesta.'));
    }
    if (counts.pendingSubstitutionRequests > 0) {
      reviewerLines.push(countLine(counts.pendingSubstitutionRequests, 'solicitud de reemplazo espera', 'solicitudes de reemplazo esperan', 'tu respuesta.'));
    }
    await sendDigestToGroup(reviewers, 'Resumen de Pendientes — Revisión Final', reviewerLines, report, dryRun);

    const activeUsers = await userDirectoryService.getActiveUsersWithActivePosition();
    const treasurers = userDirectoryService.getUsersByPositionName(activeUsers, userDirectoryService.treasurerPositionName);
    const treasurerLines = [];
    if (counts.pendingTreasurerReviews > 0) {
      treasurerLines.push(countLine(counts.pendingTreasurerReviews, 'viaje espera', 'viajes esperan', 'la asignación de fondos.'));
    }
    await sendDigestToGroup(treasurers, 'Resumen de Pendientes — Tesorería', treasurerLines, report, dryRun);
  }
  catch (error) {
    console.warn('Error enviando el resumen diario de pendientes:', error.message);
    return {mensajes: report, error: 'No se pudo armar el resumen de pendientes'};
  }
  return {mensajes: report};
};

module.exports = {getPendingCounts, getSupervisorPendingCounts, sendDailyDigest};
