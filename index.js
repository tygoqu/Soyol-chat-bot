const express = require('express');
const { google } = require('googleapis');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;
const PAGE_ID = process.env.PAGE_ID || '422150027892054';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'soyol2024';
const SHEET_ID = '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const SHEET_NAME = 'Sheet1';

// ─── Google Sheets auth ───
function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: '/etc/secrets/credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Load all subscribers from Google Sheets ───
async function loadSubscribers() {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:A`,
    });
    const rows = res.data.values || [];
    return new Set(rows.map(r => r[0]).filter(Boolean));
  } catch (e) {
    console.error('Failed to load subscribers from Sheets:', e.message);
    return new Set();
  }
}

// ─── Add new subscriber to Google Sheets ───
async function addSubscriber(id) {
  try {
    const sheets = getSheets();
    const date = new Date().toISOString().split('T')[0];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:B`,
      valueInputOption: 'RAW',
      requestBody: { values: [[id, date]] },
    });
  } catch (e) {
    console.error('Failed to add subscriber to Sheets:', e.message);
  }
}

// ─── In-memory cache (loaded from Sheets on startup) ───
let subscribers = new Set();
loadSubscribers().then(s => {
  subscribers = s;
  console.log(`Loaded ${subscribers.size} subscribers from Google Sheets`);
});

// ─── Helper: send any message ───
async function sendMessage(recipientId, messageBody) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: messageBody })
  });
  return r.json();
}

async function reply(id, text) {
  return sendMessage(id, { text });
}

// ─── Broadcast to all subscribers ───
async function broadcastToAll(message) {
  const results = [];
  for (const subId of subscribers) {
    try {
      const r = await sendMessage(subId, { text: message });
      results.push({ id: subId, result: r });
    } catch (e) {
      results.push({ id: subId, error: e.message });
    }
  }
  return results;
}

// ════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // ── Handle Facebook Page feed events (new post) ──
    if (body.object === 'page') {
      for (const entry of body.entry || []) {

        // New post on the page → broadcast to subscribers
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'feed' && change.value?.item === 'status' && change.value?.verb === 'add') {
              const postMsg = change.value.message;
              if (postMsg && subscribers.size > 0) {
                const broadcastText = `🌸 Soyol Spa Salon шинэ мэдэгдэл:\n\n${postMsg}`;
                await broadcastToAll(broadcastText);
                console.log(`Auto-broadcast sent to ${subscribers.size} subscribers`);
              }
            }
          }
        }

        // Messenger events
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

          // Auto-subscribe anyone who messages
          if (!subscribers.has(id)) {
            subscribers.add(id);
            await addSubscriber(id);
            console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
          }

          const payload = event.postback?.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') await sendMainMenu(id);
          else if (payload === 'SERVICE') await sendServiceCarousel(id);
          else if (payload === 'LOCATION') await sendLocationMenu(id);
          else if (payload === 'CONTACT') await sendContactMenu(id);
          else if (payload === 'SCHEDULE') await sendSchedule(id);
          else if (payload === 'BEAUTY_SERVICE') await sendBeautyCarousel(id);
          else if (payload === 'HAIR_SERVICE') await sendHairCarousel(id);
          else if (payload === 'EYEBROW_SERVICE') await sendEyebrowCarousel(id);
          else if (payload === 'EYELASH_SERVICE') await sendEyelashCarousel(id);
          else if (payload === 'NAIL_SERVICE') await sendNailCarousel(id);
          else if (payload === 'HAIR_PRODUCT') await sendHairProductCarousel(id);
          else if (payload === 'HAIRTREATMENT_SERVICE') await sendHairTreatmentCarousel(id);
          else if (payload === 'PIERCING_SERVICE') await sendPiercingCarousel(id);
          else if (payload === 'REMOVAL_SERVICE') await sendRemovalCarousel(id);
          else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          }
          else if (event.message?.text) {
            await sendMainMenu(id);
          }
        }
      }
      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Error:', err);
    res.sendStatus(500);
  }
});

// ════════════════════════════════════════════
//  BROADCAST API (called by admin page)
// ════════════════════════════════════════════

app.post('/broadcast', async (req, res) => {
  const { secret, message } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });
  if (subscribers.size === 0) return res.json({ sent: 0, message: 'No subscribers yet' });

  const results = await broadcastToAll(message.trim());
  const sent = results.filter(r => !r.error).length;
  res.json({ sent, total: subscribers.size, results });
});

app.get('/stats', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ subscribers: subscribers.size });
});

// ════════════════════════════════════════════
//  ADMIN PAGE
// ════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa — Broadcast</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Montserrat:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f5f0e8;
    --blush: #e8c4b8;
    --rose: #c17f74;
    --deep: #5c2d2d;
    --gold: #b8935a;
    --text: #3a2a2a;
    --muted: #8a6f6f;
  }

  body {
    background: var(--cream);
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    color: var(--text);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 40% at 20% 20%, rgba(232,196,184,0.4) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 80%, rgba(193,127,116,0.15) 0%, transparent 60%);
    pointer-events: none;
  }

  .card {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(184,147,90,0.2);
    border-radius: 2px;
    padding: 3rem;
    width: 100%;
    max-width: 520px;
    position: relative;
    box-shadow: 0 8px 60px rgba(92,45,45,0.08);
  }

  .card::before {
    content: '';
    position: absolute;
    top: 12px; left: 12px; right: 12px; bottom: 12px;
    border: 1px solid rgba(184,147,90,0.15);
    border-radius: 1px;
    pointer-events: none;
  }

  .logo {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .logo-petal {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
    animation: sway 4s ease-in-out infinite;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }

  .logo h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 1.8rem;
    letter-spacing: 0.15em;
    color: var(--deep);
  }

  .logo p {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
    margin-top: 0.25rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--blush), transparent);
  }

  .divider span {
    color: var(--gold);
    font-size: 0.7rem;
  }

  /* Stats bar */
  .stats {
    background: linear-gradient(135deg, var(--deep), var(--rose));
    color: white;
    border-radius: 1px;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .stats-label {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .stats-count {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    font-weight: 300;
    line-height: 1;
  }

  /* Login */
  #loginSection label,
  #broadcastSection label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }

  input[type="password"], textarea {
    width: 100%;
    background: rgba(255,255,255,0.8);
    border: 1px solid var(--blush);
    border-radius: 1px;
    padding: 0.8rem 1rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    font-size: 0.9rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.3s;
    margin-bottom: 1.25rem;
  }

  input[type="password"]:focus, textarea:focus {
    border-color: var(--rose);
  }

  textarea {
    resize: vertical;
    min-height: 130px;
    line-height: 1.6;
  }

  .char-count {
    text-align: right;
    font-size: 0.65rem;
    color: var(--muted);
    margin-top: -1rem;
    margin-bottom: 1.25rem;
  }

  button {
    width: 100%;
    background: linear-gradient(135deg, var(--deep) 0%, var(--rose) 100%);
    color: white;
    border: none;
    border-radius: 1px;
    padding: 0.9rem;
    font-family: 'Montserrat', sans-serif;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.3s, transform 0.2s;
  }

  button:hover { opacity: 0.9; transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .toast {
    margin-top: 1.25rem;
    padding: 0.85rem 1rem;
    border-radius: 1px;
    font-size: 0.8rem;
    text-align: center;
    display: none;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .toast.success { background: rgba(92,45,45,0.08); color: var(--deep); border: 1px solid var(--blush); }
  .toast.error { background: rgba(193,127,116,0.12); color: var(--rose); border: 1px solid var(--blush); }

  #broadcastSection { display: none; }

  .preview {
    background: rgba(232,196,184,0.15);
    border: 1px dashed var(--blush);
    border-radius: 1px;
    padding: 0.85rem 1rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--muted);
    margin-bottom: 1.25rem;
    min-height: 50px;
    white-space: pre-wrap;
  }

  .preview-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.4rem;
    display: block;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span class="logo-petal">🌸</span>
    <h1>Soyol Spa</h1>
    <p>Broadcast Dashboard</p>
  </div>

  <!-- LOGIN -->
  <div id="loginSection">
    <label>Нууц үг</label>
    <input type="password" id="secretInput" placeholder="••••••••" />
    <button onclick="doLogin()">Нэвтрэх</button>
    <div class="toast" id="loginToast"></div>
  </div>

  <!-- BROADCAST -->
  <div id="broadcastSection">
    <div class="stats">
      <div>
        <div class="stats-label">Нийт subscriber</div>
        <div class="stats-count" id="subCount">—</div>
      </div>
      <div style="font-size:1.5rem">📣</div>
    </div>

    <div class="divider"><span>✦</span></div>

    <label>Мессеж</label>
    <textarea id="msgInput" placeholder="Шинэ үйлчилгээ, урамшуулал, мэдэгдлээ энд бичнэ үү..." oninput="updatePreview(this)"></textarea>
    <div class="char-count"><span id="charCount">0</span> тэмдэгт</div>

    <span class="preview-label">Харагдах байдал</span>
    <div class="preview" id="preview">Мессеж бичнэ үү...</div>

    <button id="sendBtn" onclick="doBroadcast()">Бүх subscriber-т илгээх</button>
    <div class="toast" id="broadcastToast"></div>
  </div>
</div>

<script>
  let secret = '';

  function showToast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
  }

  async function doLogin() {
    secret = document.getElementById('secretInput').value;
    if (!secret) return;
    try {
      const r = await fetch('/stats?secret=' + encodeURIComponent(secret));
      if (r.status === 401) return showToast('loginToast', 'Нууц үг буруу байна.', 'error');
      const data = await r.json();
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('broadcastSection').style.display = 'block';
      document.getElementById('subCount').textContent = data.subscribers;
    } catch (e) {
      showToast('loginToast', 'Алдаа гарлаа. Дахин оролдоно уу.', 'error');
    }
  }

  function updatePreview(el) {
    const text = el.value;
    document.getElementById('charCount').textContent = text.length;
    document.getElementById('preview').textContent = text || 'Мессеж бичнэ үү...';
  }

  async function doBroadcast() {
    const message = document.getElementById('msgInput').value.trim();
    if (!message) return showToast('broadcastToast', 'Мессеж хоосон байна.', 'error');

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
      const r = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, message })
      });
      const data = await r.json();
      if (r.ok) {
        showToast('broadcastToast', \`✓ \${data.sent} хүнд амжилттай илгээлээ!\`, 'success');
        document.getElementById('msgInput').value = '';
        document.getElementById('preview').textContent = 'Мессеж бичнэ үү...';
        document.getElementById('charCount').textContent = '0';
      } else {
        showToast('broadcastToast', data.error || 'Алдаа гарлаа.', 'error');
      }
    } catch (e) {
      showToast('broadcastToast', 'Холболтын алдаа гарлаа.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Бүх subscriber-т илгээх';
  }

  // Allow Enter key in password field
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('secretInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════

app.get('/', (req, res) => res.send('Soyol Spa Bot is running 🌸'));

// ════════════════════════════════════════════
//  BOT FUNCTIONS (unchanged from original)
// ════════════════════════════════════════════

async function sendMainMenu(id) {
  let name = 'та';
  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) name = p.first_name;
  } catch (e) {}
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸 Тун удахгүй хариу өгөх болно оо.`,
            buttons: [
              { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
              { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
              { type: 'postback', title: 'Холбоо барих', payload: 'CONTACT' }
            ]
          }
        }
      }
    })
  });
  console.log('mainMenu:', await r.json());
}

async function sendServiceCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Гоо сайхны үйлчилгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop', subtitle: 'Арьс арчилгаа, гоо сайхны үйлчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }] },
              { title: 'Үсчин', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үс тайралт, будалт, хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }] },
              { title: 'Үсний эмчилгээ', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үсний эмчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }] },
              { title: 'Маникюр, педикюр', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны чимэглэл, гель, гоёлын будалт', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }] },
              { title: 'Сормуус, хөмсөг', image_url: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?q=80&w=1287&auto=format&fit=crop', subtitle: 'Сормуус, Сормуусны хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }] },
              { title: '6D Лазер шивээс', image_url: 'https://www.facebook.com/photo.php?fbid=781825203974356&set=pb.100064406513460.-2207520000&type=3', subtitle: 'Хөмсөгний шивээс', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYEBROW_SERVICE' }] },
              { title: 'Чих цоолох, персинг', image_url: 'https://www.tovessentials.com/cdn/shop/files/TOV-241125-752_v2_c793760b-0a1a-4b37-b909-a451bbfb6016.jpg?crop=center&height=380&v=1740568534&width=380', subtitle: 'Чих цоолох, персинг', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }] },
              { title: 'Мэнгэ, үү, ургацаг авах', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Мэнгэ, үү, ургацгыг мэргэжлийн өндөр түвшинд авна', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }] },
              { title: 'Үс арчилгаа, эмчилгээний бүтээгдэхүүн', image_url: 'https://images.unsplash.com/photo-1626379501846-0df4067b8bb9?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгаа', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }] }
            ]
          }
        }
      }
    })
  });
  console.log('carousel:', await r.json());
}

async function sendBeautyCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Энгийн массаж', image_url: 'https://images.unsplash.com/photo-1731514771613-991a02407132?q=80&w=1287&auto=format&fit=crop', subtitle: 'Энгийн массаж.\nҮнэ: 65,000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Гуаша массаж', image_url: 'https://assets.clevelandclinic.org/transform/LargeFeatureImage/b9bd499d-f631-42c3-87c6-4ba1bd3ef9f3/guasha-2177381155', subtitle: 'Гуаша массаж\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Miracle CO2', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Miracle CO2\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carbon peel', image_url: 'https://elaraclinics.com/wp-content/uploads/2023/12/close-up-of-cosmetologist-s-hand-making-hardware-c-2023-11-27-05-28-55-utc-1024x683.jpg', subtitle: 'Үхэжсэн эд эсийг зөөлнөөр гуужуулна\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Green peel', image_url: 'https://static.wixstatic.com/media/1271a4_97c99e40720c40b28dccfba938a373df~mv2.jpg/v1/fill/w_270,h_411,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/424961441_809218821248442_8848183980442323113_n.jpg', subtitle: 'Green peel\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Батга цэвэрлэгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop', subtitle: 'Арьсны гүн цэвэрлэгээ\nҮнэ: 85.000₮-120.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carboxy', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Карбоксин үйлчилгээ\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
            ]
          }
        }
      }
    })
  });
  console.log('beauty carousel:', await r.json());
}

async function sendHairCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Үс засах', image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop', subtitle: 'Эмэгтэй, эрэгтэй үс тайралт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс угаах', image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс угаалт, хуйх арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс будах', image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop', subtitle: 'Будаг, өнгө сэргээх үйлчилгээ', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс эмчлэх', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсний арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair carousel:', await r.json());
}

async function sendHairTreatmentCarousel(id) { await sendHairCarousel(id); }
async function sendPiercingCarousel(id) { await sendHairCarousel(id); }
async function sendRemovalCarousel(id) { await sendHairCarousel(id); }

async function sendNailCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Гоёлын будалт', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны будалт, дизайн', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Гоёлын хумс', image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop', subtitle: 'Уртасгалт, гель хумс', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Чимэглэл', image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop', subtitle: 'Чулуу, шигтгээ, special design', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Педикюр', image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop', subtitle: 'Хөлийн хумс арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('nail carousel:', await r.json());
}

async function sendEyelashCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Сормуус', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Сормуус суулгах, Сормуус салгах', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyelash carousel:', await r.json());
}

async function sendEyebrowCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: '6D Хөмсөг шивээс', image_url: 'https://scontent.fuln6-3.fna.fbcdn.net/v/t39.30808-6/480326600_1021864419970432_6850776916430674181_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=7b2446&_nc_ohc=04eU9mz4ad4Q7kNvwH44SQX&_nc_oc=AdqZj6Gffrm7v48uTr6ikkbV5iY5DCUwvjtJUn46QMDy4Tfh3XTzxyWnk82OAkaPh-I&_nc_zt=23&_nc_ht=scontent.fuln6-3.fna&_nc_gid=2U42kHJeniYjDC0QrFfBfg&_nc_ss=7a3a8&oh=00_Afwgl0lfgfmdRkaHoT9L_Vcbcfd8vGV43JvsBcK8TfQLcg&oe=69CFDA57', subtitle: 'Хөмсөгний шивээс, хэлбэр засалт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyebrow carousel:', await r.json());
}

async function sendHairProductCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Шампунь', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгааны шампунь', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Ангижруулагч', image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс зөөлрүүлэх, тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Үсний маск', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсэнд тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair product carousel:', await r.json());
}

async function sendLocationMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍', buttons: [{ type: 'web_url', title: 'Google Maps', url: 'https://maps.app.goo.gl/nM6smG6Wb6iDYkzT6' }] } } }
    })
  });
  console.log('location:', await r.json());
}

async function sendContactMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Доорх утасны дугаараар холбогдон дэлгэрэнгүй мэдээлэл аваарай 📞', buttons: [{ type: 'phone_number', title: '70599999', payload: '+97670599999' }, { type: 'phone_number', title: '91191215', payload: '+97691191215' }] } } }
    })
  });
  console.log('contact:', await r.json());
}

async function sendSchedule(id) {
  await reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

async function setGetStarted() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ get_started: { payload: 'GET_STARTED' } })
  });
  console.log('get started:', await r.json());
}

async function setPersistentMenu() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persistent_menu: [{
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
          { type: 'postback', title: 'Цагийн хуваарь', payload: 'SCHEDULE' },
          { type: 'postback', title: 'Ажилтантай холбогдох', payload: 'STAFF' }
        ]
      }]
    })
  });
  console.log('persistent menu:', await r.json());
}

// ── Subscribe to page feed for auto-broadcast ──
async function subscribeToPageFeed() {
  const r = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: ['feed', 'messages', 'messaging_postbacks'] })
  });
  console.log('page subscription:', await r.json());
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  await setGetStarted();
  await setPersistentMenu();
  await subscribeToPageFeed();
});    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: messageBody })
  });
  return r.json();
}

async function reply(id, text) {
  return sendMessage(id, { text });
}

// ─── Broadcast to all subscribers ───
async function broadcastToAll(message) {
  const results = [];
  for (const subId of subscribers) {
    try {
      const r = await sendMessage(subId, { text: message });
      results.push({ id: subId, result: r });
    } catch (e) {
      results.push({ id: subId, error: e.message });
    }
  }
  return results;
}

// ════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // ── Handle Facebook Page feed events (new post) ──
    if (body.object === 'page') {
      for (const entry of body.entry || []) {

        // New post on the page → broadcast to subscribers
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'feed' && change.value?.item === 'status' && change.value?.verb === 'add') {
              const postMsg = change.value.message;
              if (postMsg && subscribers.size > 0) {
                const broadcastText = `🌸 Soyol Spa Salon шинэ мэдэгдэл:\n\n${postMsg}`;
                await broadcastToAll(broadcastText);
                console.log(`Auto-broadcast sent to ${subscribers.size} subscribers`);
              }
            }
          }
        }

        // Messenger events
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

          // Auto-subscribe anyone who messages
          if (!subscribers.has(id)) {
            subscribers.add(id);
            await addSubscriber(id);
            console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
          }

          const payload = event.postback?.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') await sendMainMenu(id);
          else if (payload === 'SERVICE') await sendServiceCarousel(id);
          else if (payload === 'LOCATION') await sendLocationMenu(id);
          else if (payload === 'CONTACT') await sendContactMenu(id);
          else if (payload === 'SCHEDULE') await sendSchedule(id);
          else if (payload === 'BEAUTY_SERVICE') await sendBeautyCarousel(id);
          else if (payload === 'HAIR_SERVICE') await sendHairCarousel(id);
          else if (payload === 'EYEBROW_SERVICE') await sendEyebrowCarousel(id);
          else if (payload === 'EYELASH_SERVICE') await sendEyelashCarousel(id);
          else if (payload === 'NAIL_SERVICE') await sendNailCarousel(id);
          else if (payload === 'HAIR_PRODUCT') await sendHairProductCarousel(id);
          else if (payload === 'HAIRTREATMENT_SERVICE') await sendHairTreatmentCarousel(id);
          else if (payload === 'PIERCING_SERVICE') await sendPiercingCarousel(id);
          else if (payload === 'REMOVAL_SERVICE') await sendRemovalCarousel(id);
          else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          }
          else if (event.message?.text) {
            await sendMainMenu(id);
          }
        }
      }
      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Error:', err);
    res.sendStatus(500);
  }
});

// ════════════════════════════════════════════
//  BROADCAST API (called by admin page)
// ════════════════════════════════════════════

app.post('/broadcast', async (req, res) => {
  const { secret, message } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });
  if (subscribers.size === 0) return res.json({ sent: 0, message: 'No subscribers yet' });

  const results = await broadcastToAll(message.trim());
  const sent = results.filter(r => !r.error).length;
  res.json({ sent, total: subscribers.size, results });
});

app.get('/stats', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ subscribers: subscribers.size });
});

// ════════════════════════════════════════════
//  ADMIN PAGE
// ════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa — Broadcast</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Montserrat:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f5f0e8;
    --blush: #e8c4b8;
    --rose: #c17f74;
    --deep: #5c2d2d;
    --gold: #b8935a;
    --text: #3a2a2a;
    --muted: #8a6f6f;
  }

  body {
    background: var(--cream);
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    color: var(--text);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 40% at 20% 20%, rgba(232,196,184,0.4) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 80%, rgba(193,127,116,0.15) 0%, transparent 60%);
    pointer-events: none;
  }

  .card {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(184,147,90,0.2);
    border-radius: 2px;
    padding: 3rem;
    width: 100%;
    max-width: 520px;
    position: relative;
    box-shadow: 0 8px 60px rgba(92,45,45,0.08);
  }

  .card::before {
    content: '';
    position: absolute;
    top: 12px; left: 12px; right: 12px; bottom: 12px;
    border: 1px solid rgba(184,147,90,0.15);
    border-radius: 1px;
    pointer-events: none;
  }

  .logo {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .logo-petal {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
    animation: sway 4s ease-in-out infinite;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }

  .logo h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 1.8rem;
    letter-spacing: 0.15em;
    color: var(--deep);
  }

  .logo p {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
    margin-top: 0.25rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--blush), transparent);
  }

  .divider span {
    color: var(--gold);
    font-size: 0.7rem;
  }

  /* Stats bar */
  .stats {
    background: linear-gradient(135deg, var(--deep), var(--rose));
    color: white;
    border-radius: 1px;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .stats-label {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .stats-count {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    font-weight: 300;
    line-height: 1;
  }

  /* Login */
  #loginSection label,
  #broadcastSection label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }

  input[type="password"], textarea {
    width: 100%;
    background: rgba(255,255,255,0.8);
    border: 1px solid var(--blush);
    border-radius: 1px;
    padding: 0.8rem 1rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    font-size: 0.9rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.3s;
    margin-bottom: 1.25rem;
  }

  input[type="password"]:focus, textarea:focus {
    border-color: var(--rose);
  }

  textarea {
    resize: vertical;
    min-height: 130px;
    line-height: 1.6;
  }

  .char-count {
    text-align: right;
    font-size: 0.65rem;
    color: var(--muted);
    margin-top: -1rem;
    margin-bottom: 1.25rem;
  }

  button {
    width: 100%;
    background: linear-gradient(135deg, var(--deep) 0%, var(--rose) 100%);
    color: white;
    border: none;
    border-radius: 1px;
    padding: 0.9rem;
    font-family: 'Montserrat', sans-serif;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.3s, transform 0.2s;
  }

  button:hover { opacity: 0.9; transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .toast {
    margin-top: 1.25rem;
    padding: 0.85rem 1rem;
    border-radius: 1px;
    font-size: 0.8rem;
    text-align: center;
    display: none;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .toast.success { background: rgba(92,45,45,0.08); color: var(--deep); border: 1px solid var(--blush); }
  .toast.error { background: rgba(193,127,116,0.12); color: var(--rose); border: 1px solid var(--blush); }

  #broadcastSection { display: none; }

  .preview {
    background: rgba(232,196,184,0.15);
    border: 1px dashed var(--blush);
    border-radius: 1px;
    padding: 0.85rem 1rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--muted);
    margin-bottom: 1.25rem;
    min-height: 50px;
    white-space: pre-wrap;
  }

  .preview-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.4rem;
    display: block;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span class="logo-petal">🌸</span>
    <h1>Soyol Spa</h1>
    <p>Broadcast Dashboard</p>
  </div>

  <!-- LOGIN -->
  <div id="loginSection">
    <label>Нууц үг</label>
    <input type="password" id="secretInput" placeholder="••••••••" />
    <button onclick="doLogin()">Нэвтрэх</button>
    <div class="toast" id="loginToast"></div>
  </div>

  <!-- BROADCAST -->
  <div id="broadcastSection">
    <div class="stats">
      <div>
        <div class="stats-label">Нийт subscriber</div>
        <div class="stats-count" id="subCount">—</div>
      </div>
      <div style="font-size:1.5rem">📣</div>
    </div>

    <div class="divider"><span>✦</span></div>

    <label>Мессеж</label>
    <textarea id="msgInput" placeholder="Шинэ үйлчилгээ, урамшуулал, мэдэгдлээ энд бичнэ үү..." oninput="updatePreview(this)"></textarea>
    <div class="char-count"><span id="charCount">0</span> тэмдэгт</div>

    <span class="preview-label">Харагдах байдал</span>
    <div class="preview" id="preview">Мессеж бичнэ үү...</div>

    <button id="sendBtn" onclick="doBroadcast()">Бүх subscriber-т илгээх</button>
    <div class="toast" id="broadcastToast"></div>
  </div>
</div>

<script>
  let secret = '';

  function showToast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
  }

  async function doLogin() {
    secret = document.getElementById('secretInput').value;
    if (!secret) return;
    try {
      const r = await fetch('/stats?secret=' + encodeURIComponent(secret));
      if (r.status === 401) return showToast('loginToast', 'Нууц үг буруу байна.', 'error');
      const data = await r.json();
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('broadcastSection').style.display = 'block';
      document.getElementById('subCount').textContent = data.subscribers;
    } catch (e) {
      showToast('loginToast', 'Алдаа гарлаа. Дахин оролдоно уу.', 'error');
    }
  }

  function updatePreview(el) {
    const text = el.value;
    document.getElementById('charCount').textContent = text.length;
    document.getElementById('preview').textContent = text || 'Мессеж бичнэ үү...';
  }

  async function doBroadcast() {
    const message = document.getElementById('msgInput').value.trim();
    if (!message) return showToast('broadcastToast', 'Мессеж хоосон байна.', 'error');

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
      const r = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, message })
      });
      const data = await r.json();
      if (r.ok) {
        showToast('broadcastToast', \`✓ \${data.sent} хүнд амжилттай илгээлээ!\`, 'success');
        document.getElementById('msgInput').value = '';
        document.getElementById('preview').textContent = 'Мессеж бичнэ үү...';
        document.getElementById('charCount').textContent = '0';
      } else {
        showToast('broadcastToast', data.error || 'Алдаа гарлаа.', 'error');
      }
    } catch (e) {
      showToast('broadcastToast', 'Холболтын алдаа гарлаа.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Бүх subscriber-т илгээх';
  }

  // Allow Enter key in password field
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('secretInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════

app.get('/', (req, res) => res.send('Soyol Spa Bot is running 🌸'));

// ════════════════════════════════════════════
//  BOT FUNCTIONS (unchanged from original)
// ════════════════════════════════════════════

async function sendMainMenu(id) {
  let name = 'та';
  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) name = p.first_name;
  } catch (e) {}
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸 Тун удахгүй хариу өгөх болно оо.`,
            buttons: [
              { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
              { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
              { type: 'phone_number', title: 'Холбоо барих', payload: '+97670599999' }
            ]
          }
        }
      }
    })
  });
  console.log('mainMenu:', await r.json());
}

async function sendServiceCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Гоо сайхны үйлчилгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop', subtitle: 'Арьс арчилгаа, гоо сайхны үйлчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }] },
              { title: 'Үсчин', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үс тайралт, будалт, хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }] },
              { title: 'Үсний эмчилгээ', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үсний эмчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }] },
              { title: 'Маникюр, педикюр', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны чимэглэл, гель, гоёлын будалт', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }] },
              { title: 'Сормуус, хөмсөг', image_url: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?q=80&w=1287&auto=format&fit=crop', subtitle: 'Сормуус, Сормуусны хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }] },
              { title: '6D Лазер шивээс', image_url: 'https://www.facebook.com/photo.php?fbid=781825203974356&set=pb.100064406513460.-2207520000&type=3', subtitle: 'Хөмсөгний шивээс', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYEBROW_SERVICE' }] },
              { title: 'Чих цоолох, персинг', image_url: 'https://www.tovessentials.com/cdn/shop/files/TOV-241125-752_v2_c793760b-0a1a-4b37-b909-a451bbfb6016.jpg?crop=center&height=380&v=1740568534&width=380', subtitle: 'Чих цоолох, персинг', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }] },
              { title: 'Мэнгэ, үү, ургацаг авах', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Мэнгэ, үү, ургацгыг мэргэжлийн өндөр түвшинд авна', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }] },
              { title: 'Үс арчилгаа, эмчилгээний бүтээгдэхүүн', image_url: 'https://images.unsplash.com/photo-1626379501846-0df4067b8bb9?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгаа', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }] }
            ]
          }
        }
      }
    })
  });
  console.log('carousel:', await r.json());
}

async function sendBeautyCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Энгийн массаж', image_url: 'https://images.unsplash.com/photo-1731514771613-991a02407132?q=80&w=1287&auto=format&fit=crop', subtitle: 'Энгийн массаж.\nҮнэ: 65,000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Гуаша массаж', image_url: 'https://assets.clevelandclinic.org/transform/LargeFeatureImage/b9bd499d-f631-42c3-87c6-4ba1bd3ef9f3/guasha-2177381155', subtitle: 'Гуаша массаж\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Miracle CO2', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Miracle CO2\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carbon peel', image_url: 'https://elaraclinics.com/wp-content/uploads/2023/12/close-up-of-cosmetologist-s-hand-making-hardware-c-2023-11-27-05-28-55-utc-1024x683.jpg', subtitle: 'Үхэжсэн эд эсийг зөөлнөөр гуужуулна\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Green peel', image_url: 'https://static.wixstatic.com/media/1271a4_97c99e40720c40b28dccfba938a373df~mv2.jpg/v1/fill/w_270,h_411,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/424961441_809218821248442_8848183980442323113_n.jpg', subtitle: 'Green peel\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Батга цэвэрлэгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop', subtitle: 'Арьсны гүн цэвэрлэгээ\nҮнэ: 85.000₮-120.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carboxy', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Карбоксин үйлчилгээ\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
            ]
          }
        }
      }
    })
  });
  console.log('beauty carousel:', await r.json());
}

async function sendHairCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Үс засах', image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop', subtitle: 'Эмэгтэй, эрэгтэй үс тайралт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс угаах', image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс угаалт, хуйх арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс будах', image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop', subtitle: 'Будаг, өнгө сэргээх үйлчилгээ', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс эмчлэх', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсний арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair carousel:', await r.json());
}

async function sendHairTreatmentCarousel(id) { await sendHairCarousel(id); }
async function sendPiercingCarousel(id) { await sendHairCarousel(id); }
async function sendRemovalCarousel(id) { await sendHairCarousel(id); }

async function sendNailCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Гоёлын будалт', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны будалт, дизайн', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Гоёлын хумс', image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop', subtitle: 'Уртасгалт, гель хумс', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Чимэглэл', image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop', subtitle: 'Чулуу, шигтгээ, special design', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Педикюр', image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop', subtitle: 'Хөлийн хумс арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('nail carousel:', await r.json());
}

async function sendEyelashCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Сормуус', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Сормуус суулгах, Сормуус салгах', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyelash carousel:', await r.json());
}

async function sendEyebrowCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: '6D Хөмсөг шивээс', image_url: 'https://scontent.fuln6-3.fna.fbcdn.net/v/t39.30808-6/480326600_1021864419970432_6850776916430674181_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=7b2446&_nc_ohc=04eU9mz4ad4Q7kNvwH44SQX&_nc_oc=AdqZj6Gffrm7v48uTr6ikkbV5iY5DCUwvjtJUn46QMDy4Tfh3XTzxyWnk82OAkaPh-I&_nc_zt=23&_nc_ht=scontent.fuln6-3.fna&_nc_gid=2U42kHJeniYjDC0QrFfBfg&_nc_ss=7a3a8&oh=00_Afwgl0lfgfmdRkaHoT9L_Vcbcfd8vGV43JvsBcK8TfQLcg&oe=69CFDA57', subtitle: 'Хөмсөгний шивээс, хэлбэр засалт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyebrow carousel:', await r.json());
}

async function sendHairProductCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Шампунь', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгааны шампунь', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Ангижруулагч', image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс зөөлрүүлэх, тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Үсний маск', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсэнд тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair product carousel:', await r.json());
}

async function sendLocationMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍', buttons: [{ type: 'web_url', title: 'Google Maps', url: 'https://maps.app.goo.gl/nM6smG6Wb6iDYkzT6' }] } } }
    })
  });
  console.log('location:', await r.json());
}

async function sendContactMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Доорх утасны дугаараар холбогдон дэлгэрэнгүй мэдээлэл аваарай 📞', buttons: [{ type: 'phone_number', title: '70599999', payload: '+97670599999' }, { type: 'phone_number', title: '91191215', payload: '+97691191215' }] } } }
    })
  });
  console.log('contact:', await r.json());
}

async function sendSchedule(id) {
  await reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

async function setGetStarted() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ get_started: { payload: 'GET_STARTED' } })
  });
  console.log('get started:', await r.json());
}

async function setPersistentMenu() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persistent_menu: [{
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
          { type: 'postback', title: 'Цагийн хуваарь', payload: 'SCHEDULE' },
          { type: 'postback', title: 'Ажилтантай холбогдох', payload: 'STAFF' }
        ]
      }]
    })
  });
  console.log('persistent menu:', await r.json());
}

// ── Subscribe to page feed for auto-broadcast ──
async function subscribeToPageFeed() {
  const r = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: ['feed', 'messages', 'messaging_postbacks'] })
  });
  console.log('page subscription:', await r.json());
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  await setGetStarted();
  await setPersistentMenu();
  await subscribeToPageFeed();
});    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: messageBody })
  });
  return r.json();
}

async function reply(id, text) {
  return sendMessage(id, { text });
}

// ─── Broadcast to all subscribers ───
async function broadcastToAll(message) {
  const results = [];
  for (const subId of subscribers) {
    try {
      const r = await sendMessage(subId, { text: message });
      results.push({ id: subId, result: r });
    } catch (e) {
      results.push({ id: subId, error: e.message });
    }
  }
  return results;
}

// ════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // ── Handle Facebook Page feed events (new post) ──
    if (body.object === 'page') {
      for (const entry of body.entry || []) {

        // New post on the page → broadcast to subscribers
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'feed' && change.value?.item === 'status' && change.value?.verb === 'add') {
              const postMsg = change.value.message;
              if (postMsg && subscribers.size > 0) {
                const broadcastText = `🌸 Soyol Spa Salon шинэ мэдэгдэл:\n\n${postMsg}`;
                await broadcastToAll(broadcastText);
                console.log(`Auto-broadcast sent to ${subscribers.size} subscribers`);
              }
            }
          }
        }

        // Messenger events
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

          // Auto-subscribe anyone who messages
          if (!subscribers.has(id)) {
            subscribers.add(id);
            await addSubscriber(id);
            console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
          }

          const payload = event.postback?.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') await sendMainMenu(id);
          else if (payload === 'SERVICE') await sendServiceCarousel(id);
          else if (payload === 'LOCATION') await sendLocationMenu(id);
          else if (payload === 'CONTACT') await sendContactMenu(id);
          else if (payload === 'SCHEDULE') await sendSchedule(id);
          else if (payload === 'BEAUTY_SERVICE') await sendBeautyCarousel(id);
          else if (payload === 'HAIR_SERVICE') await sendHairCarousel(id);
          else if (payload === 'EYEBROW_SERVICE') await sendEyebrowCarousel(id);
          else if (payload === 'EYELASH_SERVICE') await sendEyelashCarousel(id);
          else if (payload === 'NAIL_SERVICE') await sendNailCarousel(id);
          else if (payload === 'HAIR_PRODUCT') await sendHairProductCarousel(id);
          else if (payload === 'HAIRTREATMENT_SERVICE') await sendHairTreatmentCarousel(id);
          else if (payload === 'PIERCING_SERVICE') await sendPiercingCarousel(id);
          else if (payload === 'REMOVAL_SERVICE') await sendRemovalCarousel(id);
          else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          }
          else if (event.message?.text) {
            await sendMainMenu(id);
          }
        }
      }
      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Error:', err);
    res.sendStatus(500);
  }
});

// ════════════════════════════════════════════
//  BROADCAST API (called by admin page)
// ════════════════════════════════════════════

app.post('/broadcast', async (req, res) => {
  const { secret, message } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });
  if (subscribers.size === 0) return res.json({ sent: 0, message: 'No subscribers yet' });

  const results = await broadcastToAll(message.trim());
  const sent = results.filter(r => !r.error).length;
  res.json({ sent, total: subscribers.size, results });
});

app.get('/stats', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ subscribers: subscribers.size });
});

// ════════════════════════════════════════════
//  ADMIN PAGE
// ════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa — Broadcast</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Montserrat:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f5f0e8;
    --blush: #e8c4b8;
    --rose: #c17f74;
    --deep: #5c2d2d;
    --gold: #b8935a;
    --text: #3a2a2a;
    --muted: #8a6f6f;
  }

  body {
    background: var(--cream);
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    color: var(--text);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 40% at 20% 20%, rgba(232,196,184,0.4) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 80%, rgba(193,127,116,0.15) 0%, transparent 60%);
    pointer-events: none;
  }

  .card {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(184,147,90,0.2);
    border-radius: 2px;
    padding: 3rem;
    width: 100%;
    max-width: 520px;
    position: relative;
    box-shadow: 0 8px 60px rgba(92,45,45,0.08);
  }

  .card::before {
    content: '';
    position: absolute;
    top: 12px; left: 12px; right: 12px; bottom: 12px;
    border: 1px solid rgba(184,147,90,0.15);
    border-radius: 1px;
    pointer-events: none;
  }

  .logo {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .logo-petal {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
    animation: sway 4s ease-in-out infinite;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }

  .logo h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 1.8rem;
    letter-spacing: 0.15em;
    color: var(--deep);
  }

  .logo p {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
    margin-top: 0.25rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--blush), transparent);
  }

  .divider span {
    color: var(--gold);
    font-size: 0.7rem;
  }

  /* Stats bar */
  .stats {
    background: linear-gradient(135deg, var(--deep), var(--rose));
    color: white;
    border-radius: 1px;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .stats-label {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .stats-count {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    font-weight: 300;
    line-height: 1;
  }

  /* Login */
  #loginSection label,
  #broadcastSection label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }

  input[type="password"], textarea {
    width: 100%;
    background: rgba(255,255,255,0.8);
    border: 1px solid var(--blush);
    border-radius: 1px;
    padding: 0.8rem 1rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    font-size: 0.9rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.3s;
    margin-bottom: 1.25rem;
  }

  input[type="password"]:focus, textarea:focus {
    border-color: var(--rose);
  }

  textarea {
    resize: vertical;
    min-height: 130px;
    line-height: 1.6;
  }

  .char-count {
    text-align: right;
    font-size: 0.65rem;
    color: var(--muted);
    margin-top: -1rem;
    margin-bottom: 1.25rem;
  }

  button {
    width: 100%;
    background: linear-gradient(135deg, var(--deep) 0%, var(--rose) 100%);
    color: white;
    border: none;
    border-radius: 1px;
    padding: 0.9rem;
    font-family: 'Montserrat', sans-serif;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.3s, transform 0.2s;
  }

  button:hover { opacity: 0.9; transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .toast {
    margin-top: 1.25rem;
    padding: 0.85rem 1rem;
    border-radius: 1px;
    font-size: 0.8rem;
    text-align: center;
    display: none;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .toast.success { background: rgba(92,45,45,0.08); color: var(--deep); border: 1px solid var(--blush); }
  .toast.error { background: rgba(193,127,116,0.12); color: var(--rose); border: 1px solid var(--blush); }

  #broadcastSection { display: none; }

  .preview {
    background: rgba(232,196,184,0.15);
    border: 1px dashed var(--blush);
    border-radius: 1px;
    padding: 0.85rem 1rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--muted);
    margin-bottom: 1.25rem;
    min-height: 50px;
    white-space: pre-wrap;
  }

  .preview-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.4rem;
    display: block;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span class="logo-petal">🌸</span>
    <h1>Soyol Spa</h1>
    <p>Broadcast Dashboard</p>
  </div>

  <!-- LOGIN -->
  <div id="loginSection">
    <label>Нууц үг</label>
    <input type="password" id="secretInput" placeholder="••••••••" />
    <button onclick="doLogin()">Нэвтрэх</button>
    <div class="toast" id="loginToast"></div>
  </div>

  <!-- BROADCAST -->
  <div id="broadcastSection">
    <div class="stats">
      <div>
        <div class="stats-label">Нийт subscriber</div>
        <div class="stats-count" id="subCount">—</div>
      </div>
      <div style="font-size:1.5rem">📣</div>
    </div>

    <div class="divider"><span>✦</span></div>

    <label>Мессеж</label>
    <textarea id="msgInput" placeholder="Шинэ үйлчилгээ, урамшуулал, мэдэгдлээ энд бичнэ үү..." oninput="updatePreview(this)"></textarea>
    <div class="char-count"><span id="charCount">0</span> тэмдэгт</div>

    <span class="preview-label">Харагдах байдал</span>
    <div class="preview" id="preview">Мессеж бичнэ үү...</div>

    <button id="sendBtn" onclick="doBroadcast()">Бүх subscriber-т илгээх</button>
    <div class="toast" id="broadcastToast"></div>
  </div>
</div>

<script>
  let secret = '';

  function showToast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
  }

  async function doLogin() {
    secret = document.getElementById('secretInput').value;
    if (!secret) return;
    try {
      const r = await fetch('/stats?secret=' + encodeURIComponent(secret));
      if (r.status === 401) return showToast('loginToast', 'Нууц үг буруу байна.', 'error');
      const data = await r.json();
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('broadcastSection').style.display = 'block';
      document.getElementById('subCount').textContent = data.subscribers;
    } catch (e) {
      showToast('loginToast', 'Алдаа гарлаа. Дахин оролдоно уу.', 'error');
    }
  }

  function updatePreview(el) {
    const text = el.value;
    document.getElementById('charCount').textContent = text.length;
    document.getElementById('preview').textContent = text || 'Мессеж бичнэ үү...';
  }

  async function doBroadcast() {
    const message = document.getElementById('msgInput').value.trim();
    if (!message) return showToast('broadcastToast', 'Мессеж хоосон байна.', 'error');

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
      const r = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, message })
      });
      const data = await r.json();
      if (r.ok) {
        showToast('broadcastToast', \`✓ \${data.sent} хүнд амжилттай илгээлээ!\`, 'success');
        document.getElementById('msgInput').value = '';
        document.getElementById('preview').textContent = 'Мессеж бичнэ үү...';
        document.getElementById('charCount').textContent = '0';
      } else {
        showToast('broadcastToast', data.error || 'Алдаа гарлаа.', 'error');
      }
    } catch (e) {
      showToast('broadcastToast', 'Холболтын алдаа гарлаа.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Бүх subscriber-т илгээх';
  }

  // Allow Enter key in password field
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('secretInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════

app.get('/', (req, res) => res.send('Soyol Spa Bot is running 🌸'));

// ════════════════════════════════════════════
//  BOT FUNCTIONS (unchanged from original)
// ════════════════════════════════════════════

async function sendMainMenu(id) {
  let name = 'та';
  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) name = p.first_name;
  } catch (e) {}
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸 Тун удахгүй хариу өгөх болно оо.`,
            buttons: [
              { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
              { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
              { type: 'postback', title: 'Холбоо барих', payload: 'CONTACT' }
            ]
          }
        }
      }
    })
  });
  console.log('mainMenu:', await r.json());
}

async function sendServiceCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Гоо сайхны үйлчилгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop', subtitle: 'Арьс арчилгаа, гоо сайхны үйлчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }] },
              { title: 'Үсчин', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үс тайралт, будалт, хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }] },
              { title: 'Үсний эмчилгээ', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үсний эмчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }] },
              { title: 'Маникюр, педикюр', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны чимэглэл, гель, гоёлын будалт', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }] },
              { title: 'Сормуус, хөмсөг', image_url: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?q=80&w=1287&auto=format&fit=crop', subtitle: 'Сормуус, Сормуусны хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }] },
              { title: '6D Лазер шивээс', image_url: 'https://www.facebook.com/photo.php?fbid=781825203974356&set=pb.100064406513460.-2207520000&type=3', subtitle: 'Хөмсөгний шивээс', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYEBROW_SERVICE' }] },
              { title: 'Чих цоолох, персинг', image_url: 'https://www.tovessentials.com/cdn/shop/files/TOV-241125-752_v2_c793760b-0a1a-4b37-b909-a451bbfb6016.jpg?crop=center&height=380&v=1740568534&width=380', subtitle: 'Чих цоолох, персинг', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }] },
              { title: 'Мэнгэ, үү, ургацаг авах', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Мэнгэ, үү, ургацгыг мэргэжлийн өндөр түвшинд авна', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }] },
              { title: 'Үс арчилгаа, эмчилгээний бүтээгдэхүүн', image_url: 'https://images.unsplash.com/photo-1626379501846-0df4067b8bb9?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгаа', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }] }
            ]
          }
        }
      }
    })
  });
  console.log('carousel:', await r.json());
}

async function sendBeautyCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Энгийн массаж', image_url: 'https://images.unsplash.com/photo-1731514771613-991a02407132?q=80&w=1287&auto=format&fit=crop', subtitle: 'Энгийн массаж.\nҮнэ: 65,000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Гуаша массаж', image_url: 'https://assets.clevelandclinic.org/transform/LargeFeatureImage/b9bd499d-f631-42c3-87c6-4ba1bd3ef9f3/guasha-2177381155', subtitle: 'Гуаша массаж\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Miracle CO2', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Miracle CO2\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carbon peel', image_url: 'https://elaraclinics.com/wp-content/uploads/2023/12/close-up-of-cosmetologist-s-hand-making-hardware-c-2023-11-27-05-28-55-utc-1024x683.jpg', subtitle: 'Үхэжсэн эд эсийг зөөлнөөр гуужуулна\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Green peel', image_url: 'https://static.wixstatic.com/media/1271a4_97c99e40720c40b28dccfba938a373df~mv2.jpg/v1/fill/w_270,h_411,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/424961441_809218821248442_8848183980442323113_n.jpg', subtitle: 'Green peel\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Батга цэвэрлэгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop', subtitle: 'Арьсны гүн цэвэрлэгээ\nҮнэ: 85.000₮-120.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carboxy', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Карбоксин үйлчилгээ\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
            ]
          }
        }
      }
    })
  });
  console.log('beauty carousel:', await r.json());
}

async function sendHairCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Үс засах', image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop', subtitle: 'Эмэгтэй, эрэгтэй үс тайралт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс угаах', image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс угаалт, хуйх арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс будах', image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop', subtitle: 'Будаг, өнгө сэргээх үйлчилгээ', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс эмчлэх', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсний арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair carousel:', await r.json());
}

async function sendHairTreatmentCarousel(id) { await sendHairCarousel(id); }
async function sendPiercingCarousel(id) { await sendHairCarousel(id); }
async function sendRemovalCarousel(id) { await sendHairCarousel(id); }

async function sendNailCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Гоёлын будалт', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны будалт, дизайн', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Гоёлын хумс', image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop', subtitle: 'Уртасгалт, гель хумс', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Чимэглэл', image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop', subtitle: 'Чулуу, шигтгээ, special design', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Педикюр', image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop', subtitle: 'Хөлийн хумс арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('nail carousel:', await r.json());
}

async function sendEyelashCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Сормуус', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Сормуус суулгах, Сормуус салгах', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyelash carousel:', await r.json());
}

async function sendEyebrowCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: '6D Хөмсөг шивээс', image_url: 'https://scontent.fuln6-3.fna.fbcdn.net/v/t39.30808-6/480326600_1021864419970432_6850776916430674181_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=7b2446&_nc_ohc=04eU9mz4ad4Q7kNvwH44SQX&_nc_oc=AdqZj6Gffrm7v48uTr6ikkbV5iY5DCUwvjtJUn46QMDy4Tfh3XTzxyWnk82OAkaPh-I&_nc_zt=23&_nc_ht=scontent.fuln6-3.fna&_nc_gid=2U42kHJeniYjDC0QrFfBfg&_nc_ss=7a3a8&oh=00_Afwgl0lfgfmdRkaHoT9L_Vcbcfd8vGV43JvsBcK8TfQLcg&oe=69CFDA57', subtitle: 'Хөмсөгний шивээс, хэлбэр засалт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyebrow carousel:', await r.json());
}

async function sendHairProductCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Шампунь', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгааны шампунь', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Ангижруулагч', image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс зөөлрүүлэх, тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Үсний маск', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсэнд тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair product carousel:', await r.json());
}

async function sendLocationMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍', buttons: [{ type: 'web_url', title: 'Google Maps', url: 'https://maps.app.goo.gl/nM6smG6Wb6iDYkzT6' }] } } }
    })
  });
  console.log('location:', await r.json());
}

async function sendContactMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Доорх утасны дугаараар холбогдон дэлгэрэнгүй мэдээлэл аваарай 📞', buttons: [{ type: 'phone_number', title: '70599999', payload: '+97670599999' }, { type: 'phone_number', title: '91191215', payload: '+97691191215' }] } } }
    })
  });
  console.log('contact:', await r.json());
}

async function sendSchedule(id) {
  await reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

async function setGetStarted() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ get_started: { payload: 'GET_STARTED' } })
  });
  console.log('get started:', await r.json());
}

async function setPersistentMenu() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persistent_menu: [{
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
          { type: 'postback', title: 'Цагийн хуваарь', payload: 'SCHEDULE' },
          { type: 'postback', title: 'Ажилтантай холбогдох', payload: 'STAFF' }
        ]
      }]
    })
  });
  console.log('persistent menu:', await r.json());
}

// ── Subscribe to page feed for auto-broadcast ──
async function subscribeToPageFeed() {
  const r = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: ['feed', 'messages', 'messaging_postbacks'] })
  });
  console.log('page subscription:', await r.json());
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  await setGetStarted();
  await setPersistentMenu();
  await subscribeToPageFeed();
});}

// ════════════════════════════════════════════
//  WEBHOOK
// ════════════════════════════════════════════

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // ── Handle Facebook Page feed events (new post) ──
    if (body.object === 'page') {
      for (const entry of body.entry || []) {

        // New post on the page → broadcast to subscribers
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'feed' && change.value?.item === 'status' && change.value?.verb === 'add') {
              const postMsg = change.value.message;
              if (postMsg && subscribers.size > 0) {
                const broadcastText = `🌸 Soyol Spa Salon шинэ мэдэгдэл:\n\n${postMsg}`;
                await broadcastToAll(broadcastText);
                console.log(`Auto-broadcast sent to ${subscribers.size} subscribers`);
              }
            }
          }
        }

        // Messenger events
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

          // Auto-subscribe anyone who messages
          if (!subscribers.has(id)) {
            subscribers.add(id);
            saveSubscribers();
            console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
          }

          const payload = event.postback?.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') await sendMainMenu(id);
          else if (payload === 'SERVICE') await sendServiceCarousel(id);
          else if (payload === 'LOCATION') await sendLocationMenu(id);
          else if (payload === 'CONTACT') await sendContactMenu(id);
          else if (payload === 'SCHEDULE') await sendSchedule(id);
          else if (payload === 'BEAUTY_SERVICE') await sendBeautyCarousel(id);
          else if (payload === 'HAIR_SERVICE') await sendHairCarousel(id);
          else if (payload === 'EYEBROW_SERVICE') await sendEyebrowCarousel(id);
          else if (payload === 'EYELASH_SERVICE') await sendEyelashCarousel(id);
          else if (payload === 'NAIL_SERVICE') await sendNailCarousel(id);
          else if (payload === 'HAIR_PRODUCT') await sendHairProductCarousel(id);
          else if (payload === 'HAIRTREATMENT_SERVICE') await sendHairTreatmentCarousel(id);
          else if (payload === 'PIERCING_SERVICE') await sendPiercingCarousel(id);
          else if (payload === 'REMOVAL_SERVICE') await sendRemovalCarousel(id);
          else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          }
          else if (event.message?.text) {
            await sendMainMenu(id);
          }
        }
      }
      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Error:', err);
    res.sendStatus(500);
  }
});

// ════════════════════════════════════════════
//  BROADCAST API (called by admin page)
// ════════════════════════════════════════════

app.post('/broadcast', async (req, res) => {
  const { secret, message } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });
  if (subscribers.size === 0) return res.json({ sent: 0, message: 'No subscribers yet' });

  const results = await broadcastToAll(message.trim());
  const sent = results.filter(r => !r.error).length;
  res.json({ sent, total: subscribers.size, results });
});

app.get('/stats', (req, res) => {
  const secret = req.query.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ subscribers: subscribers.size });
});

// ════════════════════════════════════════════
//  ADMIN PAGE
// ════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa — Broadcast</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Montserrat:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f5f0e8;
    --blush: #e8c4b8;
    --rose: #c17f74;
    --deep: #5c2d2d;
    --gold: #b8935a;
    --text: #3a2a2a;
    --muted: #8a6f6f;
  }

  body {
    background: var(--cream);
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    color: var(--text);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 40% at 20% 20%, rgba(232,196,184,0.4) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 80%, rgba(193,127,116,0.15) 0%, transparent 60%);
    pointer-events: none;
  }

  .card {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(184,147,90,0.2);
    border-radius: 2px;
    padding: 3rem;
    width: 100%;
    max-width: 520px;
    position: relative;
    box-shadow: 0 8px 60px rgba(92,45,45,0.08);
  }

  .card::before {
    content: '';
    position: absolute;
    top: 12px; left: 12px; right: 12px; bottom: 12px;
    border: 1px solid rgba(184,147,90,0.15);
    border-radius: 1px;
    pointer-events: none;
  }

  .logo {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .logo-petal {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
    animation: sway 4s ease-in-out infinite;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }

  .logo h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 1.8rem;
    letter-spacing: 0.15em;
    color: var(--deep);
  }

  .logo p {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
    margin-top: 0.25rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--blush), transparent);
  }

  .divider span {
    color: var(--gold);
    font-size: 0.7rem;
  }

  /* Stats bar */
  .stats {
    background: linear-gradient(135deg, var(--deep), var(--rose));
    color: white;
    border-radius: 1px;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .stats-label {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .stats-count {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2rem;
    font-weight: 300;
    line-height: 1;
  }

  /* Login */
  #loginSection label,
  #broadcastSection label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }

  input[type="password"], textarea {
    width: 100%;
    background: rgba(255,255,255,0.8);
    border: 1px solid var(--blush);
    border-radius: 1px;
    padding: 0.8rem 1rem;
    font-family: 'Montserrat', sans-serif;
    font-weight: 300;
    font-size: 0.9rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.3s;
    margin-bottom: 1.25rem;
  }

  input[type="password"]:focus, textarea:focus {
    border-color: var(--rose);
  }

  textarea {
    resize: vertical;
    min-height: 130px;
    line-height: 1.6;
  }

  .char-count {
    text-align: right;
    font-size: 0.65rem;
    color: var(--muted);
    margin-top: -1rem;
    margin-bottom: 1.25rem;
  }

  button {
    width: 100%;
    background: linear-gradient(135deg, var(--deep) 0%, var(--rose) 100%);
    color: white;
    border: none;
    border-radius: 1px;
    padding: 0.9rem;
    font-family: 'Montserrat', sans-serif;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.3s, transform 0.2s;
  }

  button:hover { opacity: 0.9; transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .toast {
    margin-top: 1.25rem;
    padding: 0.85rem 1rem;
    border-radius: 1px;
    font-size: 0.8rem;
    text-align: center;
    display: none;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .toast.success { background: rgba(92,45,45,0.08); color: var(--deep); border: 1px solid var(--blush); }
  .toast.error { background: rgba(193,127,116,0.12); color: var(--rose); border: 1px solid var(--blush); }

  #broadcastSection { display: none; }

  .preview {
    background: rgba(232,196,184,0.15);
    border: 1px dashed var(--blush);
    border-radius: 1px;
    padding: 0.85rem 1rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--muted);
    margin-bottom: 1.25rem;
    min-height: 50px;
    white-space: pre-wrap;
  }

  .preview-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.4rem;
    display: block;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span class="logo-petal">🌸</span>
    <h1>Soyol Spa</h1>
    <p>Broadcast Dashboard</p>
  </div>

  <!-- LOGIN -->
  <div id="loginSection">
    <label>Нууц үг</label>
    <input type="password" id="secretInput" placeholder="••••••••" />
    <button onclick="doLogin()">Нэвтрэх</button>
    <div class="toast" id="loginToast"></div>
  </div>

  <!-- BROADCAST -->
  <div id="broadcastSection">
    <div class="stats">
      <div>
        <div class="stats-label">Нийт subscriber</div>
        <div class="stats-count" id="subCount">—</div>
      </div>
      <div style="font-size:1.5rem">📣</div>
    </div>

    <div class="divider"><span>✦</span></div>

    <label>Мессеж</label>
    <textarea id="msgInput" placeholder="Шинэ үйлчилгээ, урамшуулал, мэдэгдлээ энд бичнэ үү..." oninput="updatePreview(this)"></textarea>
    <div class="char-count"><span id="charCount">0</span> тэмдэгт</div>

    <span class="preview-label">Харагдах байдал</span>
    <div class="preview" id="preview">Мессеж бичнэ үү...</div>

    <button id="sendBtn" onclick="doBroadcast()">Бүх subscriber-т илгээх</button>
    <div class="toast" id="broadcastToast"></div>
  </div>
</div>

<script>
  let secret = '';

  function showToast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
  }

  async function doLogin() {
    secret = document.getElementById('secretInput').value;
    if (!secret) return;
    try {
      const r = await fetch('/stats?secret=' + encodeURIComponent(secret));
      if (r.status === 401) return showToast('loginToast', 'Нууц үг буруу байна.', 'error');
      const data = await r.json();
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('broadcastSection').style.display = 'block';
      document.getElementById('subCount').textContent = data.subscribers;
    } catch (e) {
      showToast('loginToast', 'Алдаа гарлаа. Дахин оролдоно уу.', 'error');
    }
  }

  function updatePreview(el) {
    const text = el.value;
    document.getElementById('charCount').textContent = text.length;
    document.getElementById('preview').textContent = text || 'Мессеж бичнэ үү...';
  }

  async function doBroadcast() {
    const message = document.getElementById('msgInput').value.trim();
    if (!message) return showToast('broadcastToast', 'Мессеж хоосон байна.', 'error');

    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
      const r = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, message })
      });
      const data = await r.json();
      if (r.ok) {
        showToast('broadcastToast', \`✓ \${data.sent} хүнд амжилттай илгээлээ!\`, 'success');
        document.getElementById('msgInput').value = '';
        document.getElementById('preview').textContent = 'Мессеж бичнэ үү...';
        document.getElementById('charCount').textContent = '0';
      } else {
        showToast('broadcastToast', data.error || 'Алдаа гарлаа.', 'error');
      }
    } catch (e) {
      showToast('broadcastToast', 'Холболтын алдаа гарлаа.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Бүх subscriber-т илгээх';
  }

  // Allow Enter key in password field
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('secretInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════

app.get('/', (req, res) => res.send('Soyol Spa Bot is running 🌸'));

// ════════════════════════════════════════════
//  BOT FUNCTIONS (unchanged from original)
// ════════════════════════════════════════════

async function sendMainMenu(id) {
  let name = 'та';
  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) name = p.first_name;
  } catch (e) {}
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸 Тун удахгүй хариу өгөх болно оо.`,
            buttons: [
              { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
              { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
              { type: 'postback', title: 'Холбоо барих', payload: 'CONTACT' }
            ]
          }
        }
      }
    })
  });
  console.log('mainMenu:', await r.json());
}

async function sendServiceCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Гоо сайхны үйлчилгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop', subtitle: 'Арьс арчилгаа, гоо сайхны үйлчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }] },
              { title: 'Үсчин', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үс тайралт, будалт, хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }] },
              { title: 'Үсний эмчилгээ', image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop', subtitle: 'Үсний эмчилгээ', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }] },
              { title: 'Маникюр, педикюр', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны чимэглэл, гель, гоёлын будалт', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }] },
              { title: 'Сормуус, хөмсөг', image_url: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?q=80&w=1287&auto=format&fit=crop', subtitle: 'Сормуус, Сормуусны хими', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }] },
              { title: '6D Лазер шивээс', image_url: 'https://www.facebook.com/photo.php?fbid=781825203974356&set=pb.100064406513460.-2207520000&type=3', subtitle: 'Хөмсөгний шивээс', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYEBROW_SERVICE' }] },
              { title: 'Чих цоолох, персинг', image_url: 'https://www.tovessentials.com/cdn/shop/files/TOV-241125-752_v2_c793760b-0a1a-4b37-b909-a451bbfb6016.jpg?crop=center&height=380&v=1740568534&width=380', subtitle: 'Чих цоолох, персинг', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }] },
              { title: 'Мэнгэ, үү, ургацаг авах', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Мэнгэ, үү, ургацгыг мэргэжлийн өндөр түвшинд авна', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }] },
              { title: 'Үс арчилгаа, эмчилгээний бүтээгдэхүүн', image_url: 'https://images.unsplash.com/photo-1626379501846-0df4067b8bb9?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгаа', buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }] }
            ]
          }
        }
      }
    })
  });
  console.log('carousel:', await r.json());
}

async function sendBeautyCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              { title: 'Энгийн массаж', image_url: 'https://images.unsplash.com/photo-1731514771613-991a02407132?q=80&w=1287&auto=format&fit=crop', subtitle: 'Энгийн массаж.\nҮнэ: 65,000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Гуаша массаж', image_url: 'https://assets.clevelandclinic.org/transform/LargeFeatureImage/b9bd499d-f631-42c3-87c6-4ba1bd3ef9f3/guasha-2177381155', subtitle: 'Гуаша массаж\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Miracle CO2', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Miracle CO2\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carbon peel', image_url: 'https://elaraclinics.com/wp-content/uploads/2023/12/close-up-of-cosmetologist-s-hand-making-hardware-c-2023-11-27-05-28-55-utc-1024x683.jpg', subtitle: 'Үхэжсэн эд эсийг зөөлнөөр гуужуулна\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Green peel', image_url: 'https://static.wixstatic.com/media/1271a4_97c99e40720c40b28dccfba938a373df~mv2.jpg/v1/fill/w_270,h_411,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/424961441_809218821248442_8848183980442323113_n.jpg', subtitle: 'Green peel\nҮнэ: 85.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Батга цэвэрлэгээ', image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop', subtitle: 'Арьсны гүн цэвэрлэгээ\nҮнэ: 85.000₮-120.000₮', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
              { title: 'Carboxy', image_url: 'https://www.lerden.ru/assets/images/data/photo-2024-09-05-17-50-40.webp', subtitle: 'Карбоксин үйлчилгээ\nҮнэ: 85.000₮-өөс 65.000₮ болж хямдарлаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
            ]
          }
        }
      }
    })
  });
  console.log('beauty carousel:', await r.json());
}

async function sendHairCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Үс засах', image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop', subtitle: 'Эмэгтэй, эрэгтэй үс тайралт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс угаах', image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс угаалт, хуйх арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс будах', image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop', subtitle: 'Будаг, өнгө сэргээх үйлчилгээ', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Үс эмчлэх', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсний арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair carousel:', await r.json());
}

async function sendHairTreatmentCarousel(id) { await sendHairCarousel(id); }
async function sendPiercingCarousel(id) { await sendHairCarousel(id); }
async function sendRemovalCarousel(id) { await sendHairCarousel(id); }

async function sendNailCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Гоёлын будалт', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Хумсны будалт, дизайн', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Гоёлын хумс', image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop', subtitle: 'Уртасгалт, гель хумс', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Чимэглэл', image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop', subtitle: 'Чулуу, шигтгээ, special design', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] },
        { title: 'Педикюр', image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop', subtitle: 'Хөлийн хумс арчилгаа', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('nail carousel:', await r.json());
}

async function sendEyelashCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Сормуус', image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80', subtitle: 'Сормуус суулгах, Сормуус салгах', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyelash carousel:', await r.json());
}

async function sendEyebrowCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: '6D Хөмсөг шивээс', image_url: 'https://scontent.fuln6-3.fna.fbcdn.net/v/t39.30808-6/480326600_1021864419970432_6850776916430674181_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=7b2446&_nc_ohc=04eU9mz4ad4Q7kNvwH44SQX&_nc_oc=AdqZj6Gffrm7v48uTr6ikkbV5iY5DCUwvjtJUn46QMDy4Tfh3XTzxyWnk82OAkaPh-I&_nc_zt=23&_nc_ht=scontent.fuln6-3.fna&_nc_gid=2U42kHJeniYjDC0QrFfBfg&_nc_ss=7a3a8&oh=00_Afwgl0lfgfmdRkaHoT9L_Vcbcfd8vGV43JvsBcK8TfQLcg&oe=69CFDA57', subtitle: 'Хөмсөгний шивээс, хэлбэр засалт', buttons: [{ type: 'phone_number', title: 'Цаг авах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('eyebrow carousel:', await r.json());
}

async function sendHairProductCarousel(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'generic', elements: [
        { title: 'Шампунь', image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop', subtitle: 'Үс арчилгааны шампунь', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Ангижруулагч', image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop', subtitle: 'Үс зөөлрүүлэх, тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] },
        { title: 'Үсний маск', image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop', subtitle: 'Гэмтэлтэй үсэнд тэжээл өгөх', buttons: [{ type: 'phone_number', title: 'Захиалах', payload: '+97670599999' }] }
      ] } } }
    })
  });
  console.log('hair product carousel:', await r.json());
}

async function sendLocationMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍', buttons: [{ type: 'web_url', title: 'Google Maps', url: 'https://maps.app.goo.gl/nM6smG6Wb6iDYkzT6' }] } } }
    })
  });
  console.log('location:', await r.json());
}

async function sendContactMenu(id) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id },
      message: { attachment: { type: 'template', payload: { template_type: 'button', text: 'Доорх утасны дугаараар холбогдон дэлгэрэнгүй мэдээлэл аваарай 📞', buttons: [{ type: 'phone_number', title: '70599999', payload: '+97670599999' }, { type: 'phone_number', title: '91191215', payload: '+97691191215' }] } } }
    })
  });
  console.log('contact:', await r.json());
}

async function sendSchedule(id) {
  await reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

async function setGetStarted() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ get_started: { payload: 'GET_STARTED' } })
  });
  console.log('get started:', await r.json());
}

async function setPersistentMenu() {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persistent_menu: [{
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
          { type: 'postback', title: 'Цагийн хуваарь', payload: 'SCHEDULE' },
          { type: 'postback', title: 'Ажилтантай холбогдох', payload: 'STAFF' }
        ]
      }]
    })
  });
  console.log('persistent menu:', await r.json());
}

// ── Subscribe to page feed for auto-broadcast ──
async function subscribeToPageFeed() {
  const r = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: ['feed', 'messages', 'messaging_postbacks'] })
  });
  console.log('page subscription:', await r.json());
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  await setGetStarted();
  await setPersistentMenu();
  await subscribeToPageFeed();
});
