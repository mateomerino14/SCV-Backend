// Envia un correo de prueba para revisar Brevo (npm run probar-correo -- destinatario@correo.com)
require('dotenv').config();
const emailService = require('../src/services/shared/emailService');

const recipient = process.argv[2];

// Revisa la configuracion, envia el correo y muestra el motivo exacto si Brevo lo rechaza
const run = async () => {
  if (!recipient) {
    console.error('Indica el destinatario: npm run probar-correo -- destinatario@correo.com');
    process.exit(1);
  }
  if (!process.env.BREVO_API_KEY) {
    console.error('Falta BREVO_API_KEY en las variables de entorno.');
    process.exit(1);
  }
  console.log(`Enviando un correo de prueba desde ${emailService.senderEmail} a ${recipient}...`);
  const html = emailService.buildEmailLayout('Correo de prueba', emailService.emailParagraph('Si ves este mensaje, el servidor puede enviar correos.'));
  try {
    await emailService.sendEmail([{email: recipient}], 'Correo de prueba del Sistema de Viáticos', html);
    console.log('Brevo aceptó el correo. Si no llega, revisa la carpeta de spam y el registro de envíos en Brevo (Transactional > Logs).');
  }
  catch (error) {
    console.error(`Brevo rechazó el correo: ${emailService.describeBrevoError(error)}`);
    process.exit(1);
  }
};

run();
