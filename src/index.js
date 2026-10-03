const app = require('./app');
const reminderScheduleService = require('./services/shared/reminderScheduleService');
const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Programa el resumen de pendientes con los dias y horas que configura el administrador
reminderScheduleService.startScheduler();
