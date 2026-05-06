const express=require('express');
const router=express.Router();
const supabase = require('../config/supabase');

router.get('/',async(req,res)=>{
    const {data,error}=await supabase.from('Rol').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',async(req,res)=>{
    const {data,error}=await supabase.from('Rol').update(req.body).eq('id_rol',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',async(req,res)=>{
    const {data,error}=await supabase.from('Rol').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.delete('/:id',async(req,res)=>{
    const {data,error}=await supabase.from('Rol').delete().eq('id_rol',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }   
    return res.json(data);
});

module.exports=router;