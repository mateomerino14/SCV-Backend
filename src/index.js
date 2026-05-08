const express=require('express');
const cors=require('cors');
const app=express();
app.use(cors());
app.use(express.json());
app.get('/',(req,res)=>{
    res.send('Hello World!');
});
const PORT=process.env.PORT || 5000;

const testRoute=require('./routes/test');
app.use('/test',testRoute);
const rolRoute=require('./routes/rol');
app.use('/rol',rolRoute);
const cargoRoute=require('./routes/cargo');
app.use('/cargo',cargoRoute);

const auditoriaRoute=require('./routes/auditoria');
app.use('/auditoria',auditoriaRoute);

const comentarioRoute=require('./routes/comentario');
app.use('/comentario',comentarioRoute);

const categoriaGastoRoute=require('./routes/categoriaGasto');
app.use('/categoriaGasto',categoriaGastoRoute);

const detalleFacturaRoute=require('./routes/detalle_factura');
app.use('/detalleFactura',detalleFacturaRoute);

const facturaRoute=require('./routes/factura');
app.use('/factura',facturaRoute);

const gastoRoute=require('./routes/gasto');
app.use('/gasto',gastoRoute);

const imagenRoute=require('./routes/imagen');
app.use('/imagen',imagenRoute);

const impuestoRoute=require('./routes/impuesto');
app.use("/impuesto",impuestoRoute);

const proveedorRoute=require('./routes/proveedor');
app.use("/proveedor",proveedorRoute);

const usuarioRoute=require('./routes/usuario');
app.use("/usuario",usuarioRoute);

const viajeRoute=require('./routes/viaje');
app.use("/viaje",viajeRoute);

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
}); 