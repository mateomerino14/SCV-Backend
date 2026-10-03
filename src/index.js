const app = require('./app');
const reminderScheduleService = require('./services/shared/reminderScheduleService');
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Programa el resumen de pendientes con los dias y horas que configura el administrador
// (por defecto, de lunes a viernes a las 08:00, 12:00 y 16:00, hora Bolivia)
reminderScheduleService.startScheduler();
