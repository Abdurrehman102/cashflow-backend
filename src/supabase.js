const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) throw new Error('SUPABASE_URL is required')
if (!supabaseKey) throw new Error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required')

console.log('Supabase init — key type:',
  process.env.SUPABASE_SERVICE_KEY ? 'SERVICE_ROLE' : 'ANON')

const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = supabase