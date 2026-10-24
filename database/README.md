# Base de datos - SCV Backend

Scripts SQL para crear la base de datos completa en Supabase (PostgreSQL) desde cero.

## Orden de ejecucion

1. `01_schema.sql` - crea las 24 tablas, relaciones e indices
2. `02_functions.sql` - crea la funcion `incrementar_correlativo_recibo()`, usada por el backend para numerar recibos
3. `03_seed.sql` - datos iniciales: roles, cargos, impuesto de IVA, categorias de gasto y la configuracion de recordatorios por defecto
4. `04_rls_hardening.sql` - activa seguridad por fila (RLS) en todas las tablas

Estos cuatro archivos reflejan siempre el estado final y completo del esquema: alcanza con correrlos en orden para levantar una base nueva desde cero, sin necesidad de aplicar ningun cambio adicional despues.

## Como correrlo en Supabase

1. Entra a tu proyecto en supabase.com
2. Ve a SQL Editor
3. Pega el contenido de cada archivo en orden y ejecuta

## Si ya tenes una base de datos existente

Para el piloto la base se recrea desde cero: corre `testing_00_borrar_todo.sql` y luego `01` a `04`. Para una base con datos reales, **no vuelvas a correr `01_schema.sql`**: compara tu esquema contra este archivo y aplica manualmente (`alter table`, etc.) lo que falte. No se conservan scripts de migracion por separado, para no acumular archivos con el tiempo.

## Scripts de prueba

| Script | Uso |
|---|---|
| `testing_00_borrar_todo.sql` | Borra las 24 tablas (estructura y datos) para volver a crear la base desde cero con `01` a `04`. No se puede deshacer |
| `testing_01_limpieza_completa.sql` | Borra usuarios, viajes, gastos, facturas y solicitudes. No toca los catalogos (Rol, Cargo, Seccion, Categoria_Gasto, Impuesto) y repone la configuracion de recordatorios por defecto |
| `testing_02_organizacion_prueba.sql` | Carga una organizacion de prueba completa con jerarquia de jefe directo, lista para probar el flujo de revision. Contrasenia de todos los usuarios: `Prueba1234`. Tambien la usan las pruebas automaticas de la API y de extremo a extremo |

Solo para entornos de prueba, nunca correr en produccion.


## Tablas del sistema

| Tabla | Descripcion |
|---|---|
| Rol | Roles del sistema |
| Cargo | Cargos/puestos de trabajo, con su monto de viatico diario en ambas monedas |
| Seccion | Secciones/departamentos de la empresa; se usa como respaldo intermedio en la jerarquia de revision cuando falta el jefe directo |
| Usuario | Usuarios del sistema |
| Codigo_Verificacion | Codigos temporales de verificacion por correo |
| Viaje | Viajes registrados (motivo de hasta 500 caracteres), con su flujo de estados, revisores asignados y monto asignado (Bs y USD) |
| Solicitud_Autorizacion_Plazo | Solicitudes de extension de plazo para seguir registrando gastos; las puede pedir el titular o su reemplazo (`id_empleado` es quien la pidio) |
| Categoria_Gasto | Categorias de gasto: el plan de cuentas de la empresa (112 cuentas de la planilla de Castro mas OTROS), con su cuenta contable de Oracle y, en `descripcion`, la nota de cuando usarla |
| Proveedor | Proveedores/emisores de facturas |
| Gasto | Gastos individuales de un viaje, con sus retenciones impositivas y, en los sin factura, el numero impreso del recibo en papel (`numero_recibo`, opcional) |
| Gasto_Subitem | Desglose de un gasto en varios conceptos |
| Gasto_Tramo_Moneda | Tramos de conversion de moneda para gastos internacionales, con el tipo de cambio que registra el empleado |
| Imagen | Imagenes/comprobantes asociados a un gasto (una por gasto) |
| Imagen_Respaldo | Respaldos extra de un gasto sin factura, hasta 2 (por ejemplo, el comprobante del cambio de moneda); se borran con el gasto |
| Factura | Facturas o recibos asociados a un gasto (una por gasto); el numero puede ser un codigo con simbolos; `cuf` guarda el codigo de autorizacion que pide Oracle |
| Detalle_Factura | Lineas de detalle (productos) de una factura; la cantidad admite hasta 3 decimales (litros, kilos o unidades) |
| Impuesto | Catalogo de impuestos (IVA, etc) |
| Factura_Impuestos | Relacion muchos a muchos entre facturas e impuestos |
| Comentario | Observaciones sobre un viaje o gasto especifico, y justificaciones (una por dia excedido) |
| Auditoria | Registro de auditoria (ingreso, salida, cambio de clave) |
| Correlativo_Recibo | Tabla contador para numerar recibos y documentos PDF generados |
| Recibo | Numero asignado a cada recibo emitido (individual o agrupado), para reutilizarlo al reenviarlo |
| Revision_Viaje | Quien aprobo o rechazo cada viaje, en que etapa y cuando (historial de revision de cada revisor) |
| Solicitud_Reemplazo | Solicitudes para que un tercero rinda los gastos de un viaje en nombre de otro empleado |
| Configuracion_Recordatorio | Una sola fila con los dias (`0` domingo a `6` sabado) y horas (`HH:MM`, hora Bolivia) del resumen de pendientes, si esta activo y quien lo cambio por ultima vez |

## Estados de las solicitudes

`Solicitud_Autorizacion_Plazo` y `Solicitud_Reemplazo` usan `PENDIENTE`, `APROBADA` o `RECHAZADA`. Si el viaje se envía a revisión mientras una solicitud sigue pendiente, el sistema la cierra sola: queda `RECHAZADA` **sin** `id_revisor` y con el motivo del cierre en `observacion_revisor`. Así se distingue de un rechazo hecho por el revisor, y la aplicación la muestra como "Cerrada".

## Flujo de estados de Viaje

**Primer flujo** - autorizacion del viaje:

1. BORRADOR
2. EN_REVISION_VIAJE
3. APROBADO_VIAJE
4. EN_REVISION_TESORERO
5. EN_CURSO

**Segundo flujo** - rendicion de gastos:

6. EN_REVISION
7. EN_REVISION_APROBADOR (solo si la rendicion tiene alcohol; en caso contrario se salta este paso)
8. APROBADO_SUPERVISOR
9. APROBADO_FINAL

En cualquier etapa de revision (2, 3, 4, 6, 7 u 8), el viaje tambien puede pasar a **RECHAZADO** en vez de continuar al siguiente paso. El rechazo incrementa `ciclo_revision`, y la bandera `fue_iniciado` distingue si ocurrio en el primer o el segundo flujo.

## Notas del esquema

**Marcas temporales.** Todas las columnas de fecha y hora usan `timestamptz`. El tipo `timestamp` sin zona horaria descartaba el huso al persistir el valor, y el cliente lo interpretaba despues como hora local, desplazando las fechas cuatro horas respecto de Bolivia (UTC-4).

**Ids de rol fijos.** Los identificadores del seed no deben alterarse: el control de acceso del cliente los referencia directamente. Las rutas de supervisor exigen el rol 2 y las de revisor el 4.

| id | Rol |
|---|---|
| 1 | ADMINISTRADOR |
| 2 | SUPERVISOR |
| 3 | EMPLEADO |
| 4 | REVISOR |
| 5 | APROBADOR |

El perfil de **Tesorero** no es un rol: se determina por el cargo del usuario.

**Categorias de gasto.** El nombre incorpora la cuenta contable de Oracle seguida de la denominacion, por ejemplo `626030 HOTELES (VIAJE)`. La exportacion de la planilla extrae ese codigo del nombre, por lo que el formato debe conservarse al agregar nuevas categorias. El nombre admite hasta 100 caracteres; la API devuelve las categorias ordenadas por numero de cuenta.

**Retenciones persistidas.** Las columnas `base_imponible`, `retencion_rc_iva`, `retencion_iue`, `retencion_it` e `importe_costo` guardan el calculo hecho al registrar el gasto, en lugar de recalcularse en cada consulta. Asi los reportes historicos no varian si cambian las alicuotas.

**Contraseña temporal.** `Usuario.debe_cambiar_contrasenia` queda en `true` al crear un usuario, cuando el administrador le pone una contraseña o cuando entra con un código de recuperación; se apaga cuando el usuario elige su propia contraseña. `refresh_token_invalido_desde` marca el momento desde el que las sesiones anteriores dejan de valer (cambio de rol, suspensión o cambio de contraseña).

**Observaciones.** `Comentario.id_gasto` usa `on delete set null`: si el empleado borra un gasto observado, la observación del revisor se conserva.

**Historial de revisión.** `Revision_Viaje` guarda cada aprobación o rechazo (persona, etapa, fecha). `automatica = true` marca las etapas aprobadas solas porque el responsable era el viajero; no cuentan en los historiales.

**RLS.** El backend se conecta con la service_role key, que ignora las politicas de seguridad por fila. Activarlas impide que alguien lea o escriba la base directamente con la anon key.

## Verificacion posterior

Contar las tablas creadas:

```sql
select count(*) from information_schema.tables where table_schema = 'public';
```

Debe devolver 24.

Comprobar que las columnas temporales quedaron bien tipadas:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and data_type like 'timestamp%'
order by table_name, column_name;
```

Las doce filas deben indicar `timestamp with time zone`.

## Variables de entorno necesarias

Ver `.env.example` en la raiz del proyecto para `SUPABASE_URL` y `SUPABASE_KEY`.