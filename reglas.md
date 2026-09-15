# Estándares de desarrollo

Sistema de Control de Viáticos — convenciones de commits y codificación.

---

## ESTÁNDARES DE COMMITS

Se utiliza la convención Conventional Commits para mantener un historial claro y organizado.

### Tipos de commit

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de errores |
| `style` | Cambios visuales o de estilos sin afectar la lógica |
| `refactor` | Reestructuración de código sin modificar el comportamiento |
| `docs` | Documentación |
| `test` | Creación o actualización de pruebas |
| `chore` | Configuración, dependencias y scripts de base de datos |

### Formato

```
<tipo>: <Descripción>
```

### Ejemplos válidos

```
feat: Implementa navegación y menús dinámicos
feat: Crea página de gestión de cargos
feat: Añade exportación de planilla de rendición a Excel
feat: Implementa solicitud de extensión de plazo
fix: Corrige desplazamiento horario en marcas temporales
fix: Corrige validación de sesión expirada
fix: Corrige navegación de retorno en detalle de gasto
style: Unifica colores y estilos globales
style: Mejora consistencia visual de los formularios
refactor: Reorganiza servicios de gestión de viajes
refactor: Separa el error del modal del error de página
chore: Actualiza esquema de base de datos a timestamptz
```

### Reglas

- Los mensajes deben comenzar con mayúscula después del prefijo.
- Describir la funcionalidad implementada, no los archivos modificados.
- Un commit debe representar una única funcionalidad, corrección o mejora.
- Mantener mensajes cortos, claros y descriptivos.
- Evitar mensajes genéricos: `cambios`, `correcciones`, `actualización`, `prueba`.

---

## ESTÁNDARES DE CODIFICACIÓN

### Idioma

- El código fuente se desarrolla en inglés: variables, funciones, componentes, hooks, servicios, constantes y rutas.
- Los textos visibles para el usuario permanecen en español.
- Los nombres de tablas y columnas de la base de datos permanecen en español, por corresponder al modelo de dominio original.

```javascript
// Correcto
const userData = {}
const travelHistory = []
const createExpense = () => {}

// Incorrecto
const datosUsuario = {}
const historialViajes = []
const crearGasto = () => {}
```

### Comentarios

- **Frontend**: no se incluyen comentarios explicativos por función. El nombre de la función y su contenido deben ser suficientes.
- **Backend**: cada función lleva un comentario de una línea que describe su propósito.

```javascript
// Obtiene la fecha calendario actual en Bolivia
const getBoliviaToday = () => {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() + boliviaOffsetHours * 60 * 60 * 1000)
  return boliviaTime.toISOString().split('T')[0]
};
```

- Eliminar código comentado antes de realizar commits.

### Sintaxis

**Punto y coma** al final de cada sentencia.

**No usar operadores ternarios en la lógica de control**; se prefieren bloques `if`/`else` explícitos. El ternario se admite únicamente dentro de expresiones de estilo o valores simples en el JSX.

```javascript
// Correcto
if (result.error) {
  return res.status(result.status).json({error: result.error})
}
else {
  return res.json({message: result.message})
}

// Incorrecto
return result.error
  ? res.status(result.status).json({error: result.error})
  : res.json({message: result.message})
```

**`else` y `catch` en línea nueva**, posterior al cierre de la llave.

```javascript
try {
  const data = await getData()
  return data
}
catch (error) {
  return {error: error.message}
}
```

**Literales de objeto sin espacios internos.**

```javascript
// Correcto
const payload = {data: value, status: 200}

// Incorrecto
const payload = { data: value, status: 200 }
```

**Usar `const` por defecto**; `let` únicamente cuando el valor deba reasignarse.

**Evitar valores mágicos**; declararlos como constantes con nombre.

```javascript
const toleranceDays = 4
const boliviaOffsetHours = -4
```

---

## FRONTEND

### Estructura

```
src/
├── components/ui/    Componentes genéricos transversales
├── features/         Dominios funcionales
│   └── <dominio>/
│       ├── atoms/
│       ├── molecules/
│       ├── organisms/
│       ├── hooks/        Lógica presentacional
│       └── constants/    Catálogos de configuración visual
├── hooks/            Hooks de negocio por dominio
├── pages/            Páginas asociadas a rutas
├── services/         Capa de acceso a la API
├── layouts/          Estructura común y menús por rol
├── utils/            Funciones auxiliares puras
└── constants/        Paleta de colores y rutas
```

### Separación de responsabilidades

| Capa | Puede | No puede |
|---|---|---|
| Servicio | Llamar a la API, normalizar la respuesta | Mantener estado |
| Hook | Mantener estado, validar, llamar servicios | Renderizar JSX |
| Página | Invocar hooks, componer organismos | Llamar servicios directamente |
| Componente | Presentar datos recibidos por props | Conocer hooks de negocio |

Ningún componente de presentación importa un servicio.

### Atomic Design

| Nivel | Definición |
|---|---|
| Átomo | Elemento indivisible, sin lógica de negocio |
| Molécula | Composición de átomos que resuelve una unidad funcional |
| Organismo | Bloque autónomo y complejo de la interfaz |

Si un componente crece hasta necesitar más de un estado propio o más de una llamada a un hook de negocio, probablemente deba dividirse.

### Estilos

Cada componente declara un objeto `styles` al inicio del archivo, que agrupa las clases de Tailwind. Esto separa el maquetado del marcado, evita repetir cadenas extensas dentro del JSX y concentra los ajustes visuales en un solo lugar.

```javascript
const styles = {
  card: 'rounded-2xl p-5 mb-4 shadow-md',
  title: 'text-xs font-bold font-inter uppercase mb-3',
  row: 'flex justify-between items-center py-1.5',
};

// Uso
<div className={styles.card}>
  <p className={styles.title}>Resumen</p>
</div>
```

### Colores

Ningún componente define colores literales. Todos se referencian desde `constants/index.js`.

```javascript
// Correcto
style={{color: COLORS.primary}}

// Incorrecto
style={{color: '#870002'}}
```

Los colores semánticos de estado (aprobado, rechazado, observado) se declaran en los catálogos de configuración del dominio correspondiente, no en el componente.

### Rutas

Las rutas con parámetros se construyen mediante las funciones de `constants/routes.js`, nunca con literales.

```javascript
// Correcto
navigate(supervisorExpenseDetailPath(expenseId))

// Incorrecto
navigate(`/dashboard/supervisor/gasto/${expenseId}`)
```

### Manejo de errores

Los hooks que involucran modales exponen dos canales independientes:

- `error` — se muestra en la página.
- `modalError` — se muestra dentro del modal.

Los mensajes de validación de un formulario en modal (contenido inapropiado, campos vacíos) usan `modalError`, para que no aparezcan duplicados en la página de fondo.

### Valores numéricos

Proteger las conversiones antes de formatear, dado que un campo puede llegar indefinido desde la API.

```javascript
// Correcto
const safeAmount = parseFloat(amount) || 0;
return safeAmount.toFixed(2);

// Incorrecto
return amount.toFixed(2);
```

---

## BACKEND

### Estructura

```
src/
├── config/           Cliente de conexión
├── routes/           Declaración de rutas por dominio
├── controllers/      Misma división que routes
├── services/         Reglas de negocio por dominio
│   └── shared/       Servicios transversales
├── middlewares/      Autenticación, autorización y límites
├── utils/            Funciones auxiliares puras
└── database/         Scripts SQL del esquema
```

Los tres directorios `routes`, `controllers` y `services` replican la misma división por dominio, de modo que cada funcionalidad se sigue verticalmente con una única nomenclatura.

### Contrato entre capas

Un controlador siempre recibe `(req, res)`. Un servicio recibe parámetros explícitos y devuelve un objeto plano.

```javascript
// Controlador
const getExpenseDetail = async (req, res) => {
  const {expenseId} = req.params
  const result = await expenseService.getExpenseDetail(expenseId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json(result.expense)
  }
};

// Servicio
const getExpenseDetail = async (expenseId) => {
  const {data, error} = await supabase.from('Gasto').select('*').eq('id_gasto', expenseId).single()
  if (error) {
    return {error: error.message, status: 500}
  }
  if (!data) {
    return {error: 'Gasto no encontrado', status: 404}
  }
  return {expense: data}
};
```

Los servicios **no lanzan excepciones** para errores de negocio previstos: los devuelven como `{error, status}`.

### Operaciones auxiliares

Las tareas que no deben interrumpir el flujo principal —notificaciones por correo, recálculo de indicadores— se ejecutan dentro de un bloque de captura que registra la incidencia sin propagarla.

```javascript
try {
  await emailService.sendEmail(to, subject, html)
}
catch (error) {
  console.warn('Error notificando al empleado:', error.message)
}
```

### Autorización

La restricción de acceso se declara en la ruta, no dentro del controlador.

```javascript
router.post('/expense-review/:tripId/take',
  authMiddleware,
  roleMiddleware(['SUPERVISOR']),
  reviewController.takeExpenseReview)
```

### Fechas y zonas horarias

Bolivia está en UTC−4. Usar `toISOString()` sobre una fecha local desplaza el día cuando la operación ocurre de noche.

- Para obtener el día calendario actual, componer la cadena a partir de los métodos locales o aplicar el desplazamiento explícito.
- Para leer una marca temporal de la base, convertirla a la zona local antes de compararla con una fecha calendario.
- Todas las columnas temporales se declaran como `timestamptz`.

```javascript
// Correcto
const getBoliviaToday = () => {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() + boliviaOffsetHours * 60 * 60 * 1000)
  return boliviaTime.toISOString().split('T')[0]
};

// Incorrecto
const today = new Date().toISOString().split('T')[0]
```

### Validación

Las validaciones se aplican en el backend siempre, y se replican en el frontend cuando anticipar el error mejora la experiencia.

El backend es la única fuente de verdad: una validación presente solo en el cliente no protege la integridad de los datos.

---

## BASE DE DATOS

- Los nombres de tablas y columnas permanecen en español.
- Toda columna de fecha y hora usa `timestamptz`.
- Los valores calculados que deban permanecer estables ante cambios de configuración —como las retenciones impositivas— se persisten en el momento del registro en lugar de recalcularse.
- Los índices se declaran sobre las columnas usadas como criterio de filtrado o unión.
- Los cambios sobre bases existentes se aplican manualmente contra Supabase, y siempre se reflejan de inmediato en `01_schema.sql` (u otro archivo base que corresponda) para que una instalacion nueva quede igual sin necesidad de correr nada aparte. No se conservan scripts de migracion numerados por separado, para no acumular archivos con el tiempo.

---

## BUENAS PRÁCTICAS GENERALES

- Cada archivo tiene una única responsabilidad principal.
- Evitar lógica compleja dentro de los componentes visuales.
- Centralizar la lógica reutilizable en hooks y servicios.
- Mantener nombres descriptivos y consistentes.
- Evitar código duplicado.
- No incluir credenciales en el repositorio; usar variables de entorno.