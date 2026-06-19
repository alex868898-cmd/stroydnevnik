import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: ' + userError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { transcript, projects, catalog } = await req.json()

    // Format projects list for prompt
    const projectsPrompt = projects.map((p: any) => `ID: ${p.id}, Назва: "${p.name}", Адреса: "${p.address || ''}"`).join('\n')

    // Format catalog list for prompt
    const catalogPrompt = catalog.map((c: any) => `Категорія: "${c.work_type}", Одиниця: "${c.unit}", Тип: "${c.unit_type}", Базова Ціна: ${c.base_price}`).join('\n')

    const systemPrompt = `
Ти — інтелектуальний асистент будівельника. Твоє завдання — розпарсити диктовку виконаних робіт на об'єктах та повернути структурований JSON.
Диктовка може бути українською, російською мовою або суржиком.

СПИСОК ПРОЄКТІВ КОРИСТУВАЧА:
${projectsPrompt || 'Немає створених проєктів.'}

КАТАЛОГ РОЗЦІНОК:
${catalogPrompt}

ПРАВИЛА ПАРСИНГУ:
1. **Прив'язка до об'єктів**: Визнач, до якого проєкту відносяться роботи. Співставляй згадані адреси або назви об'єктів з наявними проєктами.
   - Якщо в диктовці згадується кілька об'єктів (наприклад, "На Шевченка зробив 5 кв.м штукатурки, а на Зеленій поклав 10 кв.м плитки"), розбий результат на кілька сегментів (segments).
   - Якщо проєкт розпізнано, але він відсутній у списку, запиши назву/адресу в 'projectHint', а 'projectId' залиш null.
   - Якщо об'єкт взагалі не згадується, встанови 'projectId' як null та 'projectHint' як null (користувач вибере проєкт вручну).

2. **Обробка послуг**:
   - Для послуг (наприклад, "доставка матеріалів", "винесення сміття", "занос сумішей", "зустріч з замовником") встанови:
     - unit = "послуга"
     - volume = кількість разів (зазвичай 1, якщо не сказано "дві доставки" -> 2)
     - base_price = ціна з каталогу або null
     - Не запитуй площу для послуг.

3. **Співставлення з каталогом**:
   - Знайди відповідний тип роботи в КАТАЛОЗІ РОЗЦІНОК.
   - Якщо робота точно відповідає каталогу, підтягни ціну (pricePerUnit = base_price, priceFromCatalog = true).
   - Якщо користувач вказав іншу ціну в диктовці (наприклад, "по 250 гривень"), використовуй ціну з диктовки і встанови priceFromCatalog = false.
   - Обчисли total = volume * pricePerUnit. Якщо volume або pricePerUnit невідомі, total = null.

4. **Уточнення типів (Clarifications)**:
   - Якщо користувач каже загальне слово (наприклад, "шпаклівка стін", "стяжка"), але в каталозі є кілька підвидів ("Шпаклівка стін стартова", "Шпаклівка стін фінішна"), додай цей пункт до списку clarifications.
   - Уточнення має містити:
     - segmentIndex: індекс сегмента, де знаходиться ця позиція.
     - itemIndex: індекс роботи у масиві items цього сегмента.
     - workTypePlaceholder: оригінальне слово з диктовки.
     - options: масив можливих значень 'work_type' з каталогу (до 3 варіантів).

ФОРМАТ ВИХІДНОГО JSON (повертай ТІЛЬКИ чистий JSON, без markdown-розмітки \`\`\`json):
{
  "segments": [
    {
      "projectId": "UUID_проєкту_або_null",
      "projectHint": "назва_об'єкту_з_диктовки_якщо_не_знайдено_UUID_або_null",
      "items": [
        {
          "action": "оригінальний текст роботи (напр. Шпаклівка стін)",
          "workType": "назва з каталогу або найкраще наближення",
          "volume": 25.5, // число або null, якщо не названо об'єм
          "unit": "м²", // м², п.м або послуга
          "pricePerUnit": 180, // число або null
          "total": 4590, // volume * pricePerUnit або null
          "priceFromCatalog": true // true, якщо ціна з каталогу, false - якщо користувач назвав ціну або її немає
        }
      ]
    }
  ],
  "clarifications": [
    {
      "segmentIndex": 0,
      "itemIndex": 0,
      "workTypePlaceholder": "шпаклівка",
      "options": ["Шпаклівка стін стартова", "Шпаклівка стін фінішна"]
    }
  ]
}
`

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured on server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return new Response(JSON.stringify({ error: `OpenAI API error: ${errText}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await response.json()
    const content = json.choices[0].message.content

    return new Response(content, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
