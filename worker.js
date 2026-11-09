export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Health Check
    if (path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, message: 'Speedora API is alive!' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 2. حفظ حالة المستخدم
    if (path === '/api/save' && request.method === 'POST') {
      try {
        const body = await request.json();
        const userId = body.userId;
        const state = body.state;

        if (!userId || !state) {
          return new Response(JSON.stringify({ error: 'Missing userId or state' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // حفظ أو تحديث في D1
        await env.DB.prepare(
          `INSERT INTO user_states (user_id, state_json, updated_at) 
           VALUES (?, ?, ?) 
           ON CONFLICT(user_id) DO UPDATE SET 
           state_json = excluded.state_json, 
           updated_at = excluded.updated_at`
        ).bind(userId, JSON.stringify(state), new Date().toISOString()).run();

        return new Response(JSON.stringify({ ok: true, message: 'State saved successfully' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 3. تحميل حالة المستخدم
    if (path === '/api/load' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      try {
        const result = await env.DB.prepare(
          `SELECT state_json FROM user_states WHERE user_id = ?`
        ).bind(userId).first();

        if (!result) {
          return new Response(JSON.stringify({ ok: false, message: 'User not found' }), {
            status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // نرجع البيانات كـ JSON object
        return new Response(JSON.stringify({ 
          ok: true, 
          state: JSON.parse(result.state_json) 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Not Found
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  },
};
