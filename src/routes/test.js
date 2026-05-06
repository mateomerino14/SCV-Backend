const express=require('express');
const router=express.Router();
const supabase = require('../config/supabase');
router.get('/',async(req,res)=>{
    const {data,error}=await supabase.from('Rol').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    res.json(data);
});


module.exports=router;