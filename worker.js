export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers للسماح للموقع بالاتصال
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // التعامل مع طلبات OPTIONS (Preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. اختبار الصحة
    if (path === '/api/health') {
      return new Response(JSON.stringify({
        ok: true,
        message: 'Speedora API is alive!',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 2. (سنضيف لاحقاً) حفظ حالة المستخدم
    if (path === '/api/save' && request.method === 'POST') {
      // هذا الجزء سيتم تفعيله بعد ربط قاعدة البيانات D1
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'D1 not connected yet. This endpoint will be ready soon.' 
      }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 3. (سنضيف لاحقاً) تحميل حالة المستخدم
    if (path === '/api/load') {
      // هذا الجزء سيتم تفعيله بعد ربط قاعدة البيانات D1
      return new Response(JSON.stringify({ 
        ok: false, 
        message: 'D1 not connected yet.' 
      }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // أي مسار آخر
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  },
};
