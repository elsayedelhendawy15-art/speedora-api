export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, message: 'Speedora API is alive!' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (path === '/api/save' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { userId, state } = body;
        if (!userId || !state) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        await env.DB.prepare(
          `INSERT INTO user_states (user_id, state_json, updated_at) VALUES (?, ?, ?) 
           ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
        ).bind(userId, JSON.stringify(state), new Date().toISOString()).run();

        return new Response(JSON.stringify({ ok: true, message: 'State saved' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    if (path === '/api/load' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      try {
        const result = await env.DB.prepare(`SELECT state_json FROM user_states WHERE user_id = ?`).bind(userId).first();
        if (!result) return new Response(JSON.stringify({ ok: false, message: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        return new Response(JSON.stringify({ ok: true, state: JSON.parse(result.state_json) }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // 🆕 تطبيق كود الإحالة
    if (path === '/api/referral/apply' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { newUserId, referralCode } = body;
        if (!newUserId || !referralCode) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // البحث عن صاحب الكود
        const referrer = await env.DB.prepare(
          `SELECT user_id, state_json FROM user_states WHERE json_extract(state_json, '$.referralCode') = ?`
        ).bind(referralCode).first();

        if (!referrer) return new Response(JSON.stringify({ ok: false, message: 'كود الإحالة غير صحيح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        if (referrer.user_id === newUserId) return new Response(JSON.stringify({ ok: false, message: 'لا يمكنك استخدام كودك الخاص' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        // إضافة 500 نقطة للمُحيل
        const refState = JSON.parse(referrer.state_json);
        refState.balance = (refState.balance || 0) + 500;
        refState.earned = (refState.earned || 0) + 500;
        refState.activity = refState.activity || [];
        refState.activity.unshift({ type: 'bonus', title: 'مكافأة إحالة صديق', points: 500, date: new Date().toISOString() });

        await env.DB.prepare(`UPDATE user_states SET state_json = ?, updated_at = ? WHERE user_id = ?`)
          .bind(JSON.stringify(refState), new Date().toISOString(), referrer.user_id).run();

        return new Response(JSON.stringify({ ok: true, message: 'Referral applied' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  },
};
