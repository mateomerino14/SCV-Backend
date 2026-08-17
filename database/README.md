# Base de datos - SCV Backend

Scripts SQL para crear la base de datos completa en Supabase (PostgreSQL) desde cero.

## Orden de ejecucion

1. `01_schema.sql` - crea todas las tablas, relaciones e indices
2. `02_functions.sql` - crea la funcion `incrementar_correlativo_recibo()`, usada por el backend para numerar recibos
3. `03_seed.sql` (opcional) - datos iniciales: roles, cargos e impuesto de IVA
4. `04_rls_hardening.sql` - activa seguridad por fila (RLS) en todas las tablas

## Como correrlo en Supabase

Opcion A - SQL Editor del dashboard:
1. Entra a tu proyecto en supabase.com
2. Ve a SQL Editor
3. Pega el contenido de cada archivo en orden y ejecuta

## Tablas del sistema

| Tabla                         | Descripcion                                                          |
|-------------------------------|----------------------------------------------------------------------|
| Rol                           | Roles del sistema                                                    |
| Cargo                         | Cargos/puestos de trabajo, algunos son unicos por persona            |
| Usuario                       | Usuarios del sistema                                                 |
| Codigo_Verificacion           | Codigos temporales de verificacion por correo (login en dos pasos)   |
| Viaje                         | Viajes registrados, con su flujo de estados                          |
| Solicitud_Autorizacion_Plazo  | Solicitudes de extension de plazo para seguir registrando gastos     |
| Categoria_Gasto               | Categorias de gasto sin factura (C/S)                                |
| Proveedor                     | Proveedores/emisores de facturas                                     |
| Gasto                         | Gastos individuales de un viaje                                      |
| Gasto_Subitem                 | Desglose de un gasto nacional sin factura en varios conceptos        |
| Gasto_Tramo_Moneda            | Tramos de conversion de moneda para gastos internacionales           |
| Imagen                        | Imagenes/comprobantes asociados a un gasto (una por gasto)           |
| Factura                       | Facturas asociadas a un gasto (una por gasto)                        |
| Detalle_Factura               | Lineas de detalle (productos) de una factura                         |
| Impuesto                      | Catalogo de impuestos (IVA, etc)                                     |
| Factura_Impuestos             | Relacion muchos a muchos entre facturas e impuestos                  |
| Comentario                    | Comentarios/observaciones sobre un viaje o gasto especifico          |
| Auditoria                     | Registro de auditoria (ingreso, salida, cambio de clave)             |
| Correlativo_Recibo            | Tabla contador para numerar recibos y documentos PDF generados       |

## Flujo de estados de Viaje

1. BORRADOR
2. EN_REVISION_VIAJE
3. APROBADO_VIAJE
4. EN_REVISION_TESORERO
5. EN_CURSO
6. EN_REVISION
7. APROBADO_SUPERVISOR
8. APROBADO_FINAL

En cualquier etapa de revision (2, 3, 4, 6 o 7), el viaje tambien puede pasar a **RECHAZADO** en vez de continuar al siguiente paso.

## Variables de entorno necesarias

Ver `.env.example` en la raiz del proyecto para `SUPABASE_URL` y `SUPABASE_KEY`.