const express= require('express');
const router= express.Router();
const supabase = require('../config/supabase');


router.get('/',async(req,res)=>{
    const {data,error}=await supabase.from('Categoria_Gasto').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',async(req,res)=>{  
    const {data,error}=await supabase.from('Categoria_Gasto').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;