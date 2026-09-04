import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') || ''
    const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    const { imageBase64, mimeType } = await req.json()
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Розпізнай касовий чек. Поверни лише JSON: {"total": число підсумку до сплати, "vendor": назва продавця або null, "date": "YYYY-MM-DD" або null}. Не сумуй рядки, якщо у чеку вже є підсумок.' },
        { role: 'user', content: [{ type: 'text', text: 'Визнач підсумкову суму цього чека.' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }
      ] })
    })
    if (!response.ok) throw new Error(await response.text())
    const json = await response.json()
    return new Response(json.choices[0].message.content, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
