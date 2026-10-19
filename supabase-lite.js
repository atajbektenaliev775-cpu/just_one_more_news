// Мини-клиент Supabase без CDN: auth, запросы к таблицам и загрузка файлов
(function () {
  function createClient(url, key) {
    const KEY = 'jomn-session', subs = [];
    let session = null;
    try { session = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    const hp = new URLSearchParams(location.hash.slice(1));
    if (hp.get('access_token')) {
      session = { access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + (+hp.get('expires_in') || 3600) };
      try { localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) {}
    }

    const err = (m) => ({ data: null, error: { message: m } });
    const parse = async (r) => {
      const t = await r.text(); let d = null;
      try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
      if (!r.ok) return err((d && (d.message || d.msg || d.error_description || d.error)) || 'HTTP ' + r.status);
      return { data: d, error: null };
    };
    const save = (s) => {
      session = s;
      try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {}
      subs.forEach((f) => f());
    };
    const headers = (extra) => ({ apikey: key, Authorization: 'Bearer ' + (session ? session.access_token : key), ...extra });
    const authPost = (path, body) => fetch(url + '/auth/v1/' + path, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    async function fresh() {
      if (session && !session.user) {
        try {
          const r = await parse(await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + session.access_token } }));
          if (r.error) { session = null; localStorage.removeItem(KEY); } else { session.user = r.data; localStorage.setItem(KEY, JSON.stringify(session)); }
        } catch (e) {}
      }
      if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        try {
          const res = await parse(await authPost('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
          res.error ? save(null) : save(res.data);
        } catch (e) {}
      }
    }

    const auth = {
      async getSession() { await fresh(); return { data: { session }, error: null }; },
      onAuthStateChange(cb) { subs.push(cb); return { data: { subscription: {} } }; },
      async signInWithPassword({ email, password }) {
        try {
          const r = await parse(await authPost('token?grant_type=password', { email, password }));
          if (r.error) return r;
          save(r.data); return { data: { session: r.data, user: r.data.user }, error: null };
        } catch (e) { return err(e.message); }
      },
      async signUp({ email, password, options }) {
        try {
          const r = await parse(await authPost('signup', { email, password, data: (options && options.data) || {} }));
          if (r.error) return r;
          if (r.data.access_token) { save(r.data); return { data: { session: r.data, user: r.data.user }, error: null }; }
          return { data: { session: null, user: r.data }, error: null };
        } catch (e) { return err(e.message); }
      },
      async signInWithOAuth({ provider, options }) {
        location.href = url + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) + '&redirect_to=' + encodeURIComponent((options && options.redirectTo) || location.href);
        return { data: {}, error: null };
      },
      async signOut() { save(null); return { error: null }; },
      async updateUser({ password }) {
        await fresh();
        try { return await parse(await fetch(url + '/auth/v1/user', { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ password }) })); }
        catch (e) { return err(e.message); }
      },
      async resetPasswordForEmail(email) {
        try { return await parse(await authPost('recover', { email })); } catch (e) { return err(e.message); }
      },
    };

    function from(table) {
      const q = { m: 'GET', p: new URLSearchParams(), body: null, one: false };
      const api = {
        select(c) { q.p.set('select', c || '*'); return api; },
        eq(c, v) { q.p.append(c, 'eq.' + v); return api; },
        order(c, o) { q.p.set('order', c + (o && o.ascending === false ? '.desc' : '.asc')); return api; },
        insert(row) { q.m = 'POST'; q.body = row; return api; },
        update(row) { q.m = 'PATCH'; q.body = row; return api; },
        delete() { q.m = 'DELETE'; return api; },
        single() { q.one = true; return api; },
        then(ok, bad) { return run().then(ok, bad); },
      };
      async function run() {
        try {
          await fresh();
          const h = headers({ 'Content-Type': 'application/json' });
          if (q.one) h.Accept = 'application/vnd.pgrst.object+json';
          if (q.m !== 'GET') h.Prefer = 'return=minimal';
          const qs = q.p.toString();
          return await parse(await fetch(url + '/rest/v1/' + table + (qs ? '?' + qs : ''),
            { method: q.m, headers: h, body: q.body ? JSON.stringify(q.body) : undefined }));
        } catch (e) { return err(e.message); }
      }
      return api;
    }

    const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
    const storage = {
      from(bucket) {
        return {
          async upload(path, file) {
            try {
              await fresh();
              const h = headers({ 'Content-Type': file.type || 'application/octet-stream' });
              return await parse(await fetch(url + '/storage/v1/object/' + bucket + '/' + enc(path), { method: 'POST', headers: h, body: file }));
            } catch (e) { return err(e.message); }
          },
          getPublicUrl(path) { return { data: { publicUrl: url + '/storage/v1/object/public/' + bucket + '/' + enc(path) } }; },
        };
      },
    };

    return { auth, from, storage };
  }
  window.supabase = { createClient };
})();