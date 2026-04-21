const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;
const PAGE_ID = process.env.PAGE_ID || '422150027892054';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'soyol2024';

const SHEET_ID = '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const SUBSCRIBERS_SHEET = 'Sheet1';
const BOOKINGS_SHEET = 'Sheet2';
const CREDENTIALS_PATH = '/etc/secrets/credentials.json';

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({
    version: 'v4',
    auth,
  });
}

async function ensureSheetExists(sheetTitle) {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const titles = new Set(
    (meta.data.sheets || [])
      .map((s) => s.properties && s.properties.title)
      .filter(Boolean)
  );

  if (!titles.has(sheetTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetTitle },
            },
          },
        ],
      },
    });
  }
}

async function ensureHeadersIfEmpty(sheetTitle, headers) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetTitle}!1:1`,
  });

  const firstRow = res.data.values && res.data.values[0] ? res.data.values[0] : [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetTitle}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }
}

async function initializeSheets() {
  await ensureSheetExists(SUBSCRIBERS_SHEET);
  await ensureSheetExists(BOOKINGS_SHEET);

  await ensureHeadersIfEmpty(SUBSCRIBERS_SHEET, [
    'subscriber_id',
    'date_added',
  ]);

  await ensureHeadersIfEmpty(BOOKINGS_SHEET, [
    'booking_id',
    'created_at',
    'customer_name',
    'phone',
    'category_name',
    'service_name',
    'date',
    'time',
    'note',
    'status',
    'service_duration',
    'service_price',
  ]);
}

async function loadSubscribers() {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SUBSCRIBERS_SHEET}!A:A`,
    });

    const rows = res.data.values || [];
    return new Set(
      rows
        .map((r) => (r[0] || '').trim())
        .filter((v) => v && v !== 'subscriber_id')
    );
  } catch (e) {
    console.error('Failed to load subscribers from Sheets:', e.message);
    return new Set();
  }
}

async function addSubscriber(id) {
  try {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SUBSCRIBERS_SHEET}!A:B`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[id, new Date().toISOString()]],
      },
    });
  } catch (e) {
    console.error('Failed to add subscriber to Sheets:', e.message);
  }
}

async function getAllBookings() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:L`,
  });

  const rows = res.data.values || [];
  return rows
    .filter((row) => row.some(Boolean))
    .filter((row) => (row[0] || '').trim() !== 'booking_id')
    .map((row) => ({
      bookingId: row[0] || '',
      createdAt: row[1] || '',
      customerName: row[2] || '',
      phone: row[3] || '',
      categoryName: row[4] || '',
      serviceName: row[5] || '',
      date: row[6] || '',
      time: row[7] || '',
      note: row[8] || '',
      status: row[9] || '',
      serviceDuration: row[10] || '',
      servicePrice: row[11] || '',
    }));
}

async function getUnavailableTimes(date) {
  const bookings = await getAllBookings();
  return bookings
    .filter((row) => row.date === date)
    .filter((row) => String(row.status || '').toLowerCase() !== 'cancelled')
    .map((row) => row.time)
    .filter(Boolean);
}

async function addBooking(payload) {
  const sheets = getSheets();
  const bookingId = 'BK-' + Date.now().toString(36).toUpperCase();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:L`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        bookingId,
        new Date().toISOString(),
        payload.customerName,
        payload.phone,
        payload.categoryName,
        payload.serviceName,
        payload.date,
        payload.time,
        payload.note || '',
        'new',
        payload.serviceDuration || '',
        payload.servicePrice || '',
      ]],
    },
  });

  return bookingId;
}

let subscribers = new Set();

async function sendMessage(recipientId, messageBody) {
  const r = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: messageBody,
      }),
    }
  );

  return r.json();
}

async function reply(id, text) {
  return sendMessage(id, { text });
}

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

app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY
  ) {
    return res.send(req.query['hub.challenge']);
  }

  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (
              change.field === 'feed' &&
              change.value &&
              change.value.item === 'status' &&
              change.value.verb === 'add'
            ) {
              const postMsg = change.value.message;

              if (postMsg && subscribers.size > 0) {
                const broadcastText = '🌸 Soyol шинэ мэдэгдэл:\n\n' + postMsg;
                await broadcastToAll(broadcastText);
                console.log(`Auto-broadcast sent to ${subscribers.size} subscribers`);
              }
            }
          }
        }

        for (const event of entry.messaging || []) {
          const id = event.sender && event.sender.id;
          if (!id) continue;

          if (!subscribers.has(id)) {
            subscribers.add(id);
            await addSubscriber(id);
            console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
          }

          const payload = event.postback && event.postback.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
            await sendMainMenu(id);
          } else if (payload === 'SERVICE') {
            await sendServiceCarousel(id);
          } else if (payload === 'LOCATION') {
            await sendLocationMenu(id);
          } else if (payload === 'CONTACT') {
            await sendContactMenu(id);
          } else if (payload === 'SCHEDULE') {
            await sendSchedule(id);
          } else if (payload === 'BEAUTY_SERVICE') {
            await sendBeautyCarousel(id);
          } else if (payload === 'HAIR_SERVICE') {
            await sendHairCarousel(id);
          } else if (payload === 'EYEBROW_SERVICE') {
            await sendEyebrowCarousel(id);
          } else if (payload === 'EYELASH_SERVICE') {
            await sendEyelashCarousel(id);
          } else if (payload === 'NAIL_SERVICE') {
            await sendNailCarousel(id);
          } else if (payload === 'HAIR_PRODUCT') {
            await sendHairProductCarousel(id);
          } else if (payload === 'HAIRTREATMENT_SERVICE') {
            await sendHairTreatmentCarousel(id);
          } else if (payload === 'PIERCING_SERVICE') {
            await sendPiercingCarousel(id);
          } else if (payload === 'REMOVAL_SERVICE') {
            await sendRemovalCarousel(id);
          } else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан удахгүй хариу өгнө.');
          } else if (event.message && event.message.text) {
            await sendMainMenu(id);
          }
        }
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(404);
  } catch (err) {
    console.error('Webhook error:', err);
    return res.sendStatus(500);
  }
});

app.post('/broadcast', async (req, res) => {
  const secret = req.body.secret;
  const message = req.body.message;

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message is empty' });
  }

  if (subscribers.size === 0) {
    return res.json({ sent: 0, message: 'No subscribers yet' });
  }

  const results = await broadcastToAll(String(message).trim());
  const sent = results.filter((r) => !r.error).length;

  return res.json({
    sent,
    total: subscribers.size,
    results,
  });
});

app.get('/stats', (req, res) => {
  const secret = req.query.secret;

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({ subscribers: subscribers.size });
});

app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'booking.html'));
});

app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.png'));
});

app.get('/booking-unavailable', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const unavailable = await getUnavailableTimes(date);
    return res.json({ unavailable });
  } catch (e) {
    console.error('Failed to get unavailable times:', e.message);
    return res.status(500).json({ error: 'Failed to load unavailable times' });
  }
});

app.post('/booking-submit', async (req, res) => {
  try {
    const payload = {
      categoryKey: String(req.body.categoryKey || '').trim(),
      categoryName: String(req.body.categoryName || '').trim(),
      serviceName: String(req.body.serviceName || '').trim(),
      serviceDuration: String(req.body.serviceDuration || '').trim(),
      servicePrice: String(req.body.servicePrice || '').trim(),
      date: String(req.body.date || '').trim(),
      time: String(req.body.time || '').trim(),
      customerName: String(req.body.customerName || '').trim(),
      phone: String(req.body.phone || '').trim(),
      note: String(req.body.note || '').trim(),
    };

    if (
      !payload.categoryName ||
      !payload.serviceName ||
      !payload.date ||
      !payload.time ||
      !payload.customerName ||
      !payload.phone
    ) {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (!/^\d{2}:\d{2}$/.test(payload.time)) {
      return res.status(400).json({ error: 'Invalid time format' });
    }

    if (payload.phone.replace(/\D/g, '').length < 8) {
      return res.status(400).json({ error: 'Утасны дугаар буруу байна.' });
    }

    const unavailable = await getUnavailableTimes(payload.date);
    if (unavailable.includes(payload.time)) {
      return res.status(409).json({
        error: 'Энэ цаг аль хэдийн захиалагдсан байна. Өөр цаг сонгоно уу.',
        code: 'SLOT_TAKEN',
      });
    }

    const bookingId = await addBooking(payload);
    return res.json({ ok: true, bookingId });
  } catch (e) {
    console.error('Failed to save booking:', e.message);
    return res.status(500).json({ error: 'Failed to save booking' });
  }
});

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Broadcast</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f7f3f8;
      color: #241b2f;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 560px;
      background: #fff;
      border: 1px solid #eadff0;
      border-radius: 18px;
      box-shadow: 0 18px 48px rgba(79, 32, 104, 0.10);
      padding: 28px;
    }
    .brand {
      text-align: center;
      margin-bottom: 22px;
    }
    .brand img {
      width: 96px;
      height: 96px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      background: #6f3f89;
      color: #fff;
      border-radius: 14px;
      margin-bottom: 18px;
    }
    .stats strong {
      font-size: 26px;
    }
    label {
      display: block;
      margin: 12px 0 8px;
      font-size: 13px;
      font-weight: 700;
    }
    input, textarea, button {
      width: 100%;
      border-radius: 12px;
      font: inherit;
    }
    input, textarea {
      border: 1px solid #d9cbe4;
      padding: 12px 14px;
      background: #fff;
    }
    textarea {
      min-height: 140px;
      resize: vertical;
    }
    button {
      border: 0;
      padding: 13px 16px;
      margin-top: 14px;
      background: #7b2d8b;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .hidden {
      display: none;
    }
    .note, .toast {
      font-size: 13px;
      color: #7d6c8e;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <img src="/logo.png" alt="logo">
    </div>

    <div id="loginSection">
      <label for="secretInput">Admin password</label>
      <input id="secretInput" type="password" placeholder="Password оруулна уу">
      <button onclick="doLogin()">Нэвтрэх</button>
      <div class="toast" id="loginToast"></div>
    </div>

    <div id="broadcastSection" class="hidden">
      <div class="stats">
        <span>Нийт subscriber</span>
        <strong id="subCount">0</strong>
      </div>

      <label for="msgInput">Broadcast message</label>
      <textarea id="msgInput" placeholder="Илгээх мессежээ бичнэ үү"></textarea>
      <button id="sendBtn" onclick="sendBroadcast()">Бүх subscriber-т илгээх</button>

      <div class="note">Энэ нь одоогийн subscriber жагсаалт руу нэг дор илгээнэ.</div>
      <div class="toast" id="broadcastToast"></div>
    </div>
  </div>

  <script>
    let secret = '';

    async function doLogin() {
      const input = document.getElementById('secretInput');
      const toast = document.getElementById('loginToast');
      secret = input.value.trim();
      toast.textContent = '';

      if (!secret) {
        toast.textContent = 'Password оруулна уу.';
        return;
      }

      const r = await fetch('/stats?secret=' + encodeURIComponent(secret));
      const data = await r.json();

      if (!r.ok) {
        toast.textContent = data.error || 'Нэвтрэх үед алдаа гарлаа.';
        return;
      }

      document.getElementById('subCount').textContent = data.subscribers || 0;
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('broadcastSection').classList.remove('hidden');
    }

    async function sendBroadcast() {
      const btn = document.getElementById('sendBtn');
      const toast = document.getElementById('broadcastToast');
      const message = document.getElementById('msgInput').value.trim();
      toast.textContent = '';

      if (!message) {
        toast.textContent = 'Мессеж хоосон байна.';
        return;
      }

      btn.disabled = true;

      try {
        const r = await fetch('/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, message })
        });

        const data = await r.json();

        if (!r.ok) {
          toast.textContent = data.error || 'Илгээх үед алдаа гарлаа.';
        } else {
          toast.textContent = String(data.sent) + ' subscriber руу амжилттай илгээлээ.';
          document.getElementById('msgInput').value = '';
        }
      } catch (e) {
        toast.textContent = 'Сүлжээний алдаа гарлаа.';
      } finally {
        btn.disabled = false;
      }
    }

    document.addEventListener('DOMContentLoaded', function () {
      document.getElementById('secretInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doLogin();
      });
    });
  </script>
</body>
</html>`);
});

app.get('/', (req, res) => {
  res.send('Bot is running');
});

async function sendMainMenu(id) {
  let name = 'та';

  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) {
      name = p.first_name;
    }
  } catch (e) {}

  const r = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸 Тун удахгүй хариу өгөх болно.`,
              buttons: [
                { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
                {
                  type: 'web_url',
                  title: 'Цаг захиалах',
                  url: 'https://soyol-chat-bot.onrender.com/booking',
                  webview_height_ratio: 'full',
                },
                { type: 'postback', title: 'Холбоо барих', payload: 'CONTACT' },
              ],
            },
          },
        },
      }),
    }
  );

  console.log('mainMenu:', await r.json());
}

async function sendServiceCarousel(id) {
  const r = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`,
    {
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
                {
                  title: 'Гоо сайхны үйлчилгээ',
                  image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop',
                  subtitle: 'Арьс арчилгаа, нүүр арчилгаа, массаж',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }],
                },
                {
                  title: 'Үсчин',
                  image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Үс тайралт, будаг, янзалгаа',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }],
                },
                {
                  title: 'Маникюр, педикюр',
                  image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Гар, хөлийн арчилгаа',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }],
                },
                {
                  title: 'Сормуус, хөмсөг',
                  image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Сормуус, хөмсөгний үйлчилгээ',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }],
                },
                {
                  title: 'Чих цоолох, персинг',
                  image_url: 'https://images.unsplash.com/photo-1596944948860-67d8f0d2f30e?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Персинг үйлчилгээ',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }],
                },
                {
                  title: 'Мэнгэ, үү, ургацаг авах',
                  image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Арьсны жижиг ургацаг авах үйлчилгээ',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }],
                },
                {
                  title: 'Үсний эмчилгээ',
                  image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Үсний тэжээл, сэргээх үйлчилгээ',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }],
                },
                {
                  title: 'Үсний бүтээгдэхүүн',
                  image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
                  subtitle: 'Шампунь, ангижруулагч, маск',
                  buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }],
                },
              ],
            },
          },
        },
      }),
    }
  );

  console.log('services:', await r.json());
}

async function sendBeautyCarousel(id) {
  const bookingUrl = 'https://soyol-chat-bot.onrender.com/booking';

  const elements = [
    {
      title: 'Энгийн массаж',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
    {
      title: 'Гуаша массаж',
      image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Miracle CO2',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮ - 85,000₮',
    },
    {
      title: 'Carbon peel',
      image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Green peel',
      image_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Батга цэвэрлэгээ',
      image_url: 'https://images.unsplash.com/photo-1552693673-1bf958298935?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮ - 120,000₮',
    },
    {
      title: 'Carboxy',
      image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
  ].map((item) => ({
    title: item.title,
    image_url: item.image_url,
    subtitle: item.subtitle,
    buttons: [
      {
        type: 'web_url',
        title: 'Цаг авах',
        url: bookingUrl,
        webview_height_ratio: 'full',
      },
    ],
  }));

  const r = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements,
            },
          },
        },
      }),
    }
  );

  console.log('beauty:', await r.json());
}

async function sendHairCarousel(id) {
  return reply(id, 'Үсчний үйлчилгээ удахгүй нэмэгдэнэ.');
}

async function sendEyebrowCarousel(id) {
  return reply(id, 'Хөмсөгний үйлчилгээ удахгүй нэмэгдэнэ.');
}

async function sendEyelashCarousel(id) {
  return reply(id, 'Сормуусны үйлчилгээ удахгүй нэмэгдэнэ.');
}

async function sendNailCarousel(id) {
  return reply(id, 'Маникюр, педикюр удахгүй нэмэгдэнэ.');
}

async function sendHairProductCarousel(id) {
  return reply(id, 'Үсний бүтээгдэхүүн удахгүй нэмэгдэнэ.');
}

async function sendHairTreatmentCarousel(id) {
  return reply(id, 'Үсний эмчилгээ удахгүй нэмэгдэнэ.');
}

async function sendPiercingCarousel(id) {
  return reply(id, 'Персинг үйлчилгээ удахгүй нэмэгдэнэ.');
}

async function sendRemovalCarousel(id) {
  return reply(id, 'Мэнгэ, үү, ургацаг авах үйлчилгээ удахгүй нэмэгдэнэ.');
}

async function sendLocationMenu(id) {
  return sendMessage(id, {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: 'Soyol Spa Salon байршил',
        buttons: [
          { type: 'web_url', title: 'Google Maps', url: 'https://maps.google.com/' },
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
        ],
      },
    },
  });
}

async function sendContactMenu(id) {
  return sendMessage(id, {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: 'Холбоо барих',
        buttons: [
          { type: 'phone_number', title: 'Залгах', payload: '+97670599999' },
          { type: 'postback', title: 'Ажилтантай холбох', payload: 'STAFF' },
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
        ],
      },
    },
  });
}

async function sendSchedule(id) {
  return reply(id, 'Цаг захиалах бол энэ линкээр орно уу: https://soyol-chat-bot.onrender.com/booking');
}

const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  try {
    await initializeSheets();
    subscribers = await loadSubscribers();
    console.log(`Loaded ${subscribers.size} subscribers from Google Sheets`);
  } catch (e) {
    console.error('Startup error:', e.message);
  }

  console.log(`Server running on port ${PORT}`);
  console.log(`Page ID: ${PAGE_ID}`);
});
