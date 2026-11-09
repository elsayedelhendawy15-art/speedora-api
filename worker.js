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

    // دالة مساعدة لتشفير الباسورد (PBKDF2)
    async function hashPassword(password, salt) {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function verifyPassword(password, salt, expectedHash) {
      const hash = await hashPassword(password, salt);
      return hash === expectedHash;
    }

    function generateSalt() {
      return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 1. Health Check
    if (path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, message: 'Speedora API is alive!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // 2. تسجيل حساب جديد (Sign Up)
    if (path === '/api/auth/signup' && request.method === 'POST') {
      try {
        const { email, password, name } = await request.json();
        if (!email || !password || !name) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        
        const salt = generateSalt();
        const hash = await hashPassword(password, salt);
        const userId = 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        // إنشاء الحالة الافتراضية للمستخدم
        const initialState = {
          balance: 1250, earned: 1250, redeemed: 0, activity: [{ type: 'bonus', title: 'مكافأة الترحيب', points: 1250, date: new Date().toISOString() }],
          streak: 0, lastClaim: null, level: 1, totalGamesPlayed: 0, totalTasksDone: 0,
          lastSpin: null, lastScratch: null, unlockedAchievements: [], bots: {}, lastBotUpdate: null,
          purchasedRewards: [], welcomeShown: true, referralCode: 'SPD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          referredBy: null, referrals: []
        };

        await env.DB.prepare(
          `INSERT INTO user_states (user_id, state_json, updated_at, email, password_hash, user_name) 
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(userId, JSON.stringify(initialState), new Date().toISOString(), email.toLowerCase(), `${salt}:${hash}`, name).run();

        return new Response(JSON.stringify({ ok: true, userId, state: initialState, name }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        if (err.message.includes('UNIQUE')) return new Response(JSON.stringify({ error: 'البريد الإلكتروني مسجل بالفعل' }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // 3. تسجيل الدخول (Login)
    if (path === '/api/auth/login' && request.method === 'POST') {
      try {
        const { email, password } = await request.json();
        if (!email || !password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const user = await env.DB.prepare(`SELECT * FROM user_states WHERE email = ?`).bind(email.toLowerCase()).first();
        if (!user) return new Response(JSON.stringify({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const [salt, hash] = user.password_hash.split(':');
        const isValid = await verifyPassword(password, salt, hash);
        if (!isValid) return new Response(JSON.stringify({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        return new Response(JSON.stringify({ ok: true, userId: user.user_id, state: JSON.parse(user.state_json), name: user.user_name }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // 4. حفظ الحالة (Save) - تعديل عشان يحدث الاسم لو اتغير
    if (path === '/api/save' && request.method === 'POST') {
      try {
        const { userId, state } = await request.json();
        if (!userId || !state) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        await env.DB.prepare(`UPDATE user_states SET state_json = ?, updated_at = ?, user_name = ? WHERE user_id = ?`)
          .bind(JSON.stringify(state), new Date().toISOString(), state.name || 'Player', userId).run();

        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // 5. جلب الحالة (Load)
    if (path === '/api/load' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      try {
        const result = await env.DB.prepare(`SELECT state_json, user_name FROM user_states WHERE user_id = ?`).bind(userId).first();
        if (!result) return new Response(JSON.stringify({ ok: false, message: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        return new Response(JSON.stringify({ ok: true, state: JSON.parse(result.state_json), name: result.user_name }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // 6. الإحالة
    if (path === '/api/referral/apply' && request.method === 'POST') {
      try {
        const { newUserId, newUserName, referralCode } = await request.json();
        if (!newUserId || !referralCode) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const referrer = await env.DB.prepare(`SELECT user_id, state_json FROM user_states WHERE json_extract(state_json, '$.referralCode') = ?`).bind(referralCode).first();
        if (!referrer || referrer.user_id === newUserId) return new Response(JSON.stringify({ ok: false, message: 'كود غير صالح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const refState = JSON.parse(referrer.state_json);
        refState.balance = (refState.balance || 0) + 500;
        refState.earned = (refState.earned || 0) + 500;
        refState.activity = refState.activity || [];
        refState.activity.unshift({ type: 'bonus', title: 'مكافأة إحالة صديق', points: 500, date: new Date().toISOString() });
        refState.referrals = refState.referrals || [];
        refState.referrals.unshift({ name: newUserName || 'مستخدم جديد', date: new Date().toISOString() });

        await env.DB.prepare(`UPDATE user_states SET state_json = ?, updated_at = ? WHERE user_id = ?`).bind(JSON.stringify(refState), new Date().toISOString(), referrer.user_id).run();
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  },
};
