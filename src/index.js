const app = require('./app');
const reminderScheduleService = require('./services/shared/reminderScheduleService');
const pdfService = require('./services/shared/pdfService');
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Programa el resumen de pendientes con los dias y horas que configura el administrador
reminderScheduleService.startScheduler();

// En Render se comprueba al arrancar que Chrome genera PDF, sin enviar nada ni tocar datos
if (process.env.RENDER) {
  pdfService.checkPdfGeneration();
}
