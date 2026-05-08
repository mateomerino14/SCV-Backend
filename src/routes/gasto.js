const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/',async(req,res)=>{
    const{data,error}=await supabase.from('Gasto').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',async(req,res)=>{
    const gastoActualizado={
        monto_total:req.body.monto_total,
        descripcion:req.body.descripcion,
        tipo_gasto:req.body.tipo_gasto
    }
    const{data,error}=await supabase.from('Gasto').update(gastoActualizado).eq('id_gasto',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',async(req,res)=>{
    const gastoNuevo={
        monto_total:req.body.monto_total,
        fecha_gasto:new Date().toISOString(),
        descripcion:req.body.descripcion,
        tipo:req.body.tipo,
        id_viaje:req.body.id_viaje,
        id_categoria:req.body.id_categoria,
        id_proveedor:req.body.id_proveedor
    }
    const{data,error}=await supabase.from('Gasto').insert(gastoNuevo).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});

router.delete('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Gasto').delete().eq('id_gasto',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;