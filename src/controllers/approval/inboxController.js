const inboxService = require('../../services/approval/inboxService');

// Devuelve una pagina de la bandeja pedida con el total de la pestana y los totales de todas las pestanas
const getInbox = (inboxName) => async (req, res) => {
  const result = await inboxService.getInboxPage(inboxName, req.user.id_usuario, req.query);
  if (result.error) {
    return res.status(result.status).json({error: result.error});
  }
  return res.json(result.page);
};

module.exports = {getInbox};
