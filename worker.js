export default {
  // Handler untuk menerima email masuk dari Email Routing
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    const recipient = message.to;
    const sender = message.from;
    const subject = message.headers.get("subject") || "(No Subject)";
    
    // Simpan raw email ke R2 Bucket
    const rawEmail = await new Response(message.raw).text();
    await env.BUCKET.put(`emails/${id}.eml`, rawEmail);
    
    // Simpan metadata ke D1 Database
    await env.DB.prepare(
      "INSERT INTO emails (id, recipient, sender, subject, received_at, r2_key) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, recipient, sender, subject, Date.now(), `emails/${id}.eml`).run();
  },

  // Handler untuk HTTP Request (Website & API)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Endpoint API untuk mengambil daftar email
    if (url.pathname.startsWith("/api/inbox")) {
      const recipient = url.searchParams.get("to");
      if (!recipient) return new Response(JSON.stringify({ error: "Missing 'to' parameter" }), { status: 400 });

      const { results } = await env.DB.prepare(
        "SELECT * FROM emails WHERE recipient = ? ORDER BY received_at DESC LIMIT 50"
      ).bind(recipient).all();
      
      return new Response(JSON.stringify(results), {
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
      });
    }

    // Halaman Depan Sederhana
    return new Response(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <title>Temp Mail Pribadi</title>
          <style>
              body { font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center; }
              input { padding: 10px; width: 70%; margin-top: 10px; border: 1px solid #ccc; border-radius: 4px; }
              button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px; }
              #inbox { margin-top: 20px; text-align: left; }
              .email-item { border-bottom: 1px solid #ddd; padding: 10px 0; }
          </style>
      </head>
      <body>
          <h1> Temp Mail Pribadi</h1>
          <p>Masukkan nama alias Anda:</p>
          <input type="text" id="alias" placeholder="contoh: user123">
          <button onclick="loadInbox()">Cek Inbox</button>
          
          <div id="inbox"></div>

          <script>
              async function loadInbox() {
                  const alias = document.getElementById('alias').value;
                  if(!alias) return alert('Masukkan nama alias dulu!');
                  
                  const domain = window.location.hostname; 
                  const fullEmail = alias + '@' + domain;
                  
                  const res = await fetch('/api/inbox?to=' + encodeURIComponent(fullEmail));
                  const emails = await res.json();
                  
                  let html = '<h3>Inbox untuk: ' + fullEmail + '</h3>';
                  if(emails.length === 0) html += '<p>Belum ada email masuk.</p>';
                  
                  emails.forEach(e => {
                      html += '<div class="email-item"><b>Dari:</b> ' + e.sender + '<br><b>Subjek:</b> ' + e.subject + '</div>';
                  });
                  document.getElementById('inbox').innerHTML = html;
              }
          </script>
      </body>
      </html>
    `, {
      headers: { "content-type": "text/html" }
    });
  }
};
