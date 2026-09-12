# Base de datos - SCV Backend

Scripts SQL para crear la base de datos completa en Supabase (PostgreSQL) desde cero.

## Orden de ejecucion

1. `01_schema.sql` - crea las 19 tablas, relaciones e indices
2. `02_functions.sql` - crea la funcion `incrementar_correlativo_recibo()`, usada por el backend para numerar recibos
3. `03_seed.sql` - datos iniciales: roles, cargos, impuesto de IVA y categorias de gasto
4. `04_rls_hardening.sql` - activa seguridad por fila (RLS) en todas las tablas

## Como correrlo en Supabase

1. Entra a tu proyecto en supabase.com
2. Ve a SQL Editor
3. Pega el contenido de cada archivo en orden y ejecuta

## Migraciones incrementales

Los archivos `01` a `04` arman la base desde cero. Los cambios posteriores sobre una base ya existente se agregan como scripts numerados aparte (`05_...`, `06_...`), y tambien se reflejan en `01_schema.sql` para que una instalacion nueva quede igual sin necesidad de correr las migraciones una por una.

| Script | Cambio |
|---|---|
| `05_migrate_placa_vehiculo.sql` | Agrega `placa_vehiculo` a `Viaje`, para la opcion de transporte "Vehiculo de Empresa" |
| `06_migrate_comprobante_categoria.sql` | Agrega `requiere_comprobante` a `Categoria_Gasto` y marca Taxi como no obligatorio |
| `07_migrate_alcohol_gasto.sql` | Agrega `tiene_alcohol` a `Gasto`, para resaltar el gasto puntual en las tablas de revision |
| `08_migrate_carnet_identidad.sql` | Agrega `carnet_identidad` a `Usuario`, para mostrarlo en el recibo |

## Tablas del sistema

| Tabla | Descripcion |
|---|---|
| Rol | Roles del sistema |
| Cargo | Cargos/puestos de trabajo, con su monto de viatico diario en ambas monedas |
| Usuario | Usuarios del sistema |
| Codigo_Verificacion | Codigos temporales de verificacion por correo |
| Viaje | Viajes registrados, con su flujo de estados y revisores asignados |
| Solicitud_Autorizacion_Plazo | Solicitudes de extension de plazo para seguir registrando gastos |
| Categoria_Gasto | Categorias de gasto con su cuenta contable de Oracle |
| Proveedor | Proveedores/emisores de facturas |
| Gasto | Gastos individuales de un viaje, con sus retenciones impositivas |
| Gasto_Subitem | Desglose de un gasto en varios conceptos |
| Gasto_Tramo_Moneda | Tramos de conversion de moneda para gastos internacionales |
| Imagen | Imagenes/comprobantes asociados a un gasto (una por gasto) |
| Factura | Facturas asociadas a un gasto (una por gasto) |
| Detalle_Factura | Lineas de detalle (productos) de una factura |
| Impuesto | Catalogo de impuestos (IVA, etc) |
| Factura_Impuestos | Relacion muchos a muchos entre facturas e impuestos |
| Comentario | Observaciones sobre un viaje o gasto especifico, y justificaciones |
| Auditoria | Registro de auditoria (ingreso, salida, cambio de clave) |
| Correlativo_Recibo | Tabla contador para numerar recibos y documentos PDF generados |

## Flujo de estados de Viaje

**Primer flujo** - autorizacion del viaje:

1. BORRADOR
2. EN_REVISION_VIAJE
3. APROBADO_VIAJE
4. EN_REVISION_TESORERO
5. EN_CURSO

**Segundo flujo** - rendicion de gastos:

6. EN_REVISION
7. APROBADO_SUPERVISOR
8. APROBADO_FINAL

En cualquier etapa de revision (2, 3, 4, 6 o 7), el viaje tambien puede pasar a **RECHAZADO** en vez de continuar al siguiente paso. El rechazo incrementa `ciclo_revision`, y la bandera `fue_iniciado` distingue si ocurrio en el primer o el segundo flujo.

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

**Categorias de gasto.** El nombre incorpora la cuenta contable de Oracle seguida de la denominacion, por ejemplo `626030 HOTELES (VIAJE)`. La exportacion de la planilla extrae ese codigo del nombre, por lo que el formato debe conservarse al agregar nuevas categorias.

**Retenciones persistidas.** Las columnas `base_imponible`, `retencion_rc_iva`, `retencion_iue`, `retencion_it` e `importe_costo` guardan el calculo hecho al registrar el gasto, en lugar de recalcularse en cada consulta. Asi los reportes historicos no varian si cambian las alicuotas.

**RLS.** El backend se conecta con la service_role key, que ignora las politicas de seguridad por fila. Activarlas impide que alguien lea o escriba la base directamente con la anon key.

## Verificacion posterior

Contar las tablas creadas:

```sql
select count(*) from information_schema.tables where table_schema = 'public';
```

Debe devolver 19.

Comprobar que las columnas temporales quedaron bien tipadas:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and data_type like 'timestamp%'
order by table_name, column_name;
```

Las siete filas deben indicar `timestamp with time zone`.

## Variables de entorno necesarias

Ver `.env.example` en la raiz del proyecto para `SUPABASE_URL` y `SUPABASE_KEY`.