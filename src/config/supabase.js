const supabaseModule = require('@supabase/supabase-js')
require('dotenv').config()
const supabaseClient = supabaseModule.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

module.exports = supabaseClient;