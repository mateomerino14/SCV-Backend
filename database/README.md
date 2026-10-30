# Base de datos - SCV Backend

Scripts SQL para crear la base de datos completa en Supabase (PostgreSQL) desde cero.

## Archivos

```
database/
├── 01_esquema.sql                  Las 30 tablas, relaciones, restricciones e índices
├── 02_funciones.sql                Correlativos (recibos por mes, viajes por año, rendiciones por mes) y sus triggers
├── 03_datos_iniciales.sql          Roles, cargos, impuesto IVA, plan de cuentas y recordatorios por defecto
├── 04_seguridad_rls.sql            Seguridad por fila (RLS) en todas las tablas
├── 05_demo_usuarios_ficticios.sql  Demo de MAXAM FANEXA con personas ficticias y tres vehículos
├── reconstruir_base_completa.sql   Todo junto para pegar de una vez en Supabase (generado, no se edita)
├── mantenimiento/
│   ├── borrar_todo.sql             Elimina tablas, funciones y triggers para crear la base de nuevo
│   └── limpiar_datos.sql           Borra usuarios y movimientos; conserva los catálogos
└── pruebas/
    └── organizacion_prueba.sql     Organización de prueba que usan las pruebas automáticas
```

## Orden de ejecución

1. `01_esquema.sql` - crea las 30 tablas, relaciones e índices.
2. `02_funciones.sql` - crea la función `incrementar_correlativo_recibo(periodo)`, usada por el backend para numerar recibos (el correlativo vuelve a 1 cada mes); el trigger `viaje_numero_anual`, que al crear un viaje le da el siguiente número de su año para el código `VIA-numero/año` (`Viaje.numero_viaje` y `anio_viaje`), y el trigger `viaje_numero_rendicion`, que al quedar un viaje en `APROBADO_FINAL` le asigna el siguiente número de rendición del mes de su último comprobante (`Viaje.numero_rendicion` y `periodo_rendicion`). Para empezar desde un número, por ejemplo si contabilidad ya va por la 40: `insert into "Correlativo_Rendicion" (periodo, numero) values ('2026-10', 40) on conflict (periodo) do update set numero = 40;`
3. `03_datos_iniciales.sql` - roles, cargos, impuesto de IVA, categorías de gasto y la configuración de recordatorios por defecto.
4. `04_seguridad_rls.sql` - activa la seguridad por fila (RLS) en todas las tablas.
5. `05_demo_usuarios_ficticios.sql` - opcional: la demo con personas ficticias (ver más abajo).

Los archivos `01` a `04` reflejan siempre el estado final y completo del esquema: alcanza con correrlos en orden para levantar una base nueva, sin aplicar ningún cambio adicional después.

## Cómo correrlo en Supabase

1. Entra a tu proyecto en supabase.com y abre **SQL Editor**.
2. Para crear la base de cero con la demo, pega `reconstruir_base_completa.sql` y ejecútalo. **Borra todo lo que haya.**
3. Para una base vacía sin demo, pega `01` a `04` en orden.

`reconstruir_base_completa.sql` se genera con `npm run db:reconstruccion` a partir de `mantenimiento/borrar_todo.sql` y `01` a `05`; una prueba automática falla si alguien cambia un script y no lo vuelve a generar.

## Si ya tenés una base de datos con datos reales

**No corras `01_esquema.sql` ni `reconstruir_base_completa.sql`**: compara tu esquema contra `01_esquema.sql` y aplica a mano (`alter table`, etc.) lo que falte. No se guardan scripts de migración por separado, para no acumular archivos con el tiempo.

## Demo con usuarios ficticios

`05_demo_usuarios_ficticios.sql` carga una empleada, el Gerente General (aprobador y jefe directo de todos), la tesorera, un revisor, una administradora y un compañero para probar el reemplazo, con sus secciones de Oracle, la dependencia 900 y tres vehículos. Solo tres cuentas usan correos reales para recibir los avisos: empleado `mateomerino988@gmail.com`, aprobador `mateomerino14@gmail.com` y tesorera `202301308@est.umss.edu`; las demás usan `@example.com`. Contraseña de todos: `Viaticos2026`.

## Mantenimiento y pruebas

| Script | Uso |
|---|---|
| `mantenimiento/borrar_todo.sql` | Elimina las 30 tablas, las funciones y los triggers para volver a crear la base con `01` a `05`. No se puede deshacer |
| `mantenimiento/limpiar_datos.sql` | Borra usuarios, viajes, gastos, facturas, firmas, documentos emitidos, solicitudes y auditoría. Conserva los catálogos (roles, cargos, secciones, categorías, impuestos y vehículos) y repone la configuración de recordatorios por defecto |
| `pruebas/organizacion_prueba.sql` | Organización de prueba completa con jerarquía de jefe directo y tres vehículos. Contraseña de todos: `Prueba1234`. La usan las pruebas automáticas de la API y de extremo a extremo |

Solo para entornos de prueba, nunca en una base con datos reales.

## Tablas del sistema

| Tabla | Descripcion |
|---|---|
| Rol | Roles del sistema |
| Cargo | Cargos/puestos de trabajo, con su monto de viatico diario en ambas monedas |
| Seccion | Secciones/departamentos de la empresa; se usa como respaldo intermedio en la jerarquia de revision cuando falta el jefe directo. `codigo_seccion` (3 digitos, opcional) es su codigo de Oracle para la cuenta del gasto: 76.8.dependencia.cuenta.000000.seccion.000.000 |
| Usuario | Usuarios del sistema; `codigo_dependencia` (3 digitos, opcional) es la dependencia de Oracle que llevan los gastos de quienes lo tienen como jefe directo (y los suyos si no tiene jefe) |
| Codigo_Verificacion | Codigos temporales de verificacion por correo |
| Viaje | Viajes registrados (motivo de hasta 500 caracteres), con su flujo de estados, revisores asignados, monto asignado (Bs y USD, con la parte para combustible en `monto_combustible`), vehículo de la empresa (`id_vehiculo` y la placa de ese momento), gestión del hospedaje (`Empresa` o `Propio`) y número anual (`numero_viaje`, `anio_viaje`) |
| Vehiculo | Flota de la empresa (placa única, descripción, activo); un índice único parcial impide que un vehículo esté en dos viajes activos |
| Solicitud_Autorizacion_Plazo | Solicitudes de extension de plazo para seguir registrando gastos; las puede pedir el titular o su reemplazo (`id_empleado` es quien la pidio) |
| Categoria_Gasto | Categorias de gasto: el plan de cuentas de la empresa (112 cuentas de la planilla de Castro mas OTROS), con su cuenta contable de Oracle y, en `descripcion`, la nota de cuando usarla |
| Proveedor | Proveedores/emisores de facturas |
| Gasto | Gastos individuales de un viaje, con sus retenciones impositivas; en los sin factura, el numero impreso del recibo en papel (`numero_recibo`, opcional); en los internacionales, la moneda de la factura, el monto en esa moneda (`monto_moneda_origen`), su tipo de cambio a USD (`tipo_cambio`) y el de USD a Bs (`tipo_cambio_bs`), con `monto_total` en USD, y la moneda en que se rinde (`moneda_rendicion`: USD o BOB) |
| Gasto_Subitem | Desglose de un gasto en varios conceptos |
| Gasto_Tramo_Moneda | Conversion a USD de un gasto internacional en otra moneda (monto original, tipo de cambio y equivalente); los gastos antiguos pueden tener varios tramos |
| Imagen | Imagenes/comprobantes asociados a un gasto (una por gasto) |
| Imagen_Respaldo | Respaldos extra de un gasto sin factura, hasta 2 (por ejemplo, el comprobante del cambio de moneda); se borran con el gasto |
| Factura | Facturas o recibos asociados a un gasto (una por gasto); el numero puede ser un codigo con simbolos; `cuf` guarda el codigo de autorizacion que pide Oracle |
| Detalle_Factura | Lineas de detalle (productos) de una factura; la cantidad admite hasta 3 decimales (litros, kilos o unidades) |
| Impuesto | Catalogo de impuestos (IVA, etc) |
| Factura_Impuestos | Relacion muchos a muchos entre facturas e impuestos |
| Comentario | Observaciones sobre un viaje o gasto especifico, y justificaciones (una por dia excedido) |
| Auditoria | Registro de auditoria (ingreso, salida, cambio de clave) |
| Correlativo_Recibo | Ultimo numero de recibo de cada mes (AAAA-MM); el recibo se muestra como `000012/10-2026` |
| Firma | Firma dibujada en el momento de aprobar o enviar (MEMORANDUM, PREPARADO, JEFE, GERENTE): trazo PNG, usuario, fecha, IP o aprobación automática |
| Documento_Emitido | Código y datos clave de cada PDF emitido, para verificarlo con su QR |
| Correlativo_Viaje | Ultimo numero de viaje de cada año, para el codigo `VIA-numero/año` que vuelve a 1 cada año |
| Correlativo_Rendicion | Ultimo numero de rendicion de cada mes (AAAA-MM) para la descripcion de Oracle (10-40); lo usa el trigger `viaje_numero_rendicion`; el incremento es atomico (`insert ... on conflict do update`) y un indice unico sobre `Viaje(periodo_rendicion, numero_rendicion)` impide repetir numeros aunque se aprueben varias a la vez |
| Recibo | Numero del sistema (con su mes en `periodo`, unico por mes) de cada gasto sin factura, asignado al registrarlo, y de cada recibo agrupado; `enviado` indica si ya se mando al empleado |
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
7. EN_REVISION_APROBADOR (solo si la rendición tiene gastos no deducibles: alcohol o propinas; en caso contrario se salta este paso)
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

Debe devolver 30.

Comprobar que las columnas temporales quedaron bien tipadas:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and data_type like 'timestamp%'
order by table_name, column_name;
```

Las quince filas deben indicar `timestamp with time zone`.

## Variables de entorno necesarias

Ver `.env.example` en la raiz del proyecto para `SUPABASE_URL` y `SUPABASE_KEY`.