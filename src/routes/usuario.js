const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');


router.get('/',async(req,res)=>{
    const {data,error}=await supabase.from('Usuario').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Usuario').update(req.body).eq('id_usuario',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.post('/',async(req,res)=>{
    const {data,error}=await supabase.from('Usuario').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.delete('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Usuario').delete().eq('id_usuario',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;