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

// ── Email config ──
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || '';
const NOTIFY_PASS  = process.env.NOTIFY_PASS  || '';

async function sendEmail(subject, html) {
  if (!NOTIFY_EMAIL || !NOTIFY_PASS) return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: { user: NOTIFY_EMAIL, pass: NOTIFY_PASS },
      tls: { ciphers: 'SSLv3' },
    });
    await transporter.sendMail({
      from: `"Soyol Spa Salon" <${NOTIFY_EMAIL}>`,
      to: NOTIFY_EMAIL,
      subject,
      html,
    });
    console.log('Email sent:', subject);
  } catch (e) {
    console.error('Email error:', e.message);
  }
}

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

async function cancelBooking(bookingId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:L`,
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => (r[0] || '').trim() === bookingId);
  if (rowIndex < 0) return false;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = (meta.data.sheets || []).find(
    (s) => s.properties && s.properties.title === BOOKINGS_SHEET
  );
  if (!sheet) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    },
  });
  return true;
}

async function getBookingById(bookingId) {
  const bookings = await getAllBookings();
  return bookings.find((b) => b.bookingId === bookingId) || null;
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

    // Send email notification
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f3fb;padding:24px;border-radius:16px">
        <div style="text-align:center;margin-bottom:20px">
          <h2 style="color:#6b2180;font-size:22px;margin:0">Шинэ цаг захиалга</h2>
          <p style="color:#888;margin:4px 0 0;font-size:13px">${new Date().toLocaleString('mn-MN')}</p>
        </div>
        <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e8d5f5">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em;width:35%">Booking ID</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;font-weight:700;color:#6b2180">${bookingId}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Үйлчилгээ</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;font-weight:600">${payload.serviceName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Огноо</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8">${payload.date}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Цаг</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8">${payload.time}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Нэр</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8">${payload.customerName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Утас</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8">${payload.phone}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Үнэ</td><td style="padding:10px 0;border-bottom:1px solid #f0e8f8;color:#6b2180;font-weight:700">${payload.servicePrice}</td></tr>
            ${payload.note ? `<tr><td style="padding:10px 0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Тэмдэглэл</td><td style="padding:10px 0">${payload.note}</td></tr>` : ''}
          </table>
        </div>
        <div style="text-align:center;margin-top:16px">
          <a href="https://soyol-chat-bot.onrender.com/bookings?secret=${ADMIN_SECRET}" style="display:inline-block;background:#6b2180;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:700;font-size:14px">Захиалга удирдах</a>
        </div>
      </div>
    `;
    sendEmail(`🌸 Шинэ захиалга: ${payload.serviceName} — ${payload.date} ${payload.time}`, emailHtml);

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
  return reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

// ── Bookings management page ──
app.get('/bookings', async (req, res) => {
  const secret = String(req.query.secret || '').trim();
  if (secret !== ADMIN_SECRET) {
    return res.status(401).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access Denied</title>
    <style>body{font-family:system-ui;background:#f7f3fb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{background:#fff;border:1px solid #e8d5f5;border-radius:20px;padding:32px;text-align:center;max-width:400px}
    h2{color:#6b2180;margin:0 0 8px}p{color:#888;font-size:14px}code{background:#f3e8f9;color:#6b2180;padding:4px 8px;border-radius:6px;font-size:13px}</style>
    </head><body><div class="box"><h2>🔒 Нэвтрэх шаардлагатай</h2><p>URL дээр password-оо оруулна уу:</p><br><code>/bookings?secret=YOUR_PASSWORD</code></div></body></html>`);
  }

  try {
    const bookings = await getAllBookings();
    const sorted = bookings.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa — Захиалга</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--p:#6b2180;--p2:#9b59b6;--pale:#f5eef9;--border:#ede6f2;--text:#1a0a22;--muted:#7c6d87;--red:#c0392b;--green:#2d9b6b}
body{font-family:'Manrope',sans-serif;background:#faf8fc;color:var(--text);min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 15% 10%,rgba(155,89,182,.1),transparent 30%),radial-gradient(circle at 85% 80%,rgba(107,33,128,.08),transparent 30%);pointer-events:none;z-index:0}
nav{position:sticky;top:0;z-index:50;background:rgba(250,248,252,.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
.nav-logo{height:40px;width:auto}
.nav-title{font-family:'Cormorant Garamond',serif;font-size:1.1rem;font-weight:400;color:var(--p);position:absolute;left:50%;transform:translateX(-50%)}
.nav-right{font-size:.75rem;color:var(--muted)}
.wrap{position:relative;z-index:1;max-width:1000px;margin:0 auto;padding:24px 16px 60px}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.stat{background:rgba(255,255,255,.85);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;padding:16px;text-align:center}
.stat-num{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:500;color:var(--p)}
.stat-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.15em;color:var(--muted);margin-top:2px}
.filter-row{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.filter-btn{padding:8px 16px;border-radius:100px;border:1.5px solid var(--border);background:#fff;font-family:'Manrope',sans-serif;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;color:var(--muted)}
.filter-btn.active{background:var(--p);color:#fff;border-color:var(--p)}
.search-input{flex:1;min-width:160px;padding:8px 14px;border-radius:100px;border:1.5px solid var(--border);font-family:'Manrope',sans-serif;font-size:.82rem;outline:none;background:#fff;color:var(--text)}
.search-input:focus{border-color:var(--p)}
.booking-card{background:rgba(255,255,255,.88);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:18px;padding:18px 20px;margin-bottom:10px;display:flex;align-items:center;gap:14px;transition:all .2s;animation:fadeUp .3s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.booking-card:hover{border-color:rgba(107,33,128,.22);box-shadow:0 8px 28px rgba(107,33,128,.08)}
.booking-date{text-align:center;min-width:54px;background:var(--pale);border-radius:12px;padding:8px 10px}
.booking-date .day{font-family:'Cormorant Garamond',serif;font-size:1.5rem;font-weight:500;color:var(--p);line-height:1}
.booking-date .month{font-size:.6rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-top:2px}
.booking-date .time{font-size:.72rem;font-weight:700;color:var(--p);margin-top:4px}
.booking-info{flex:1;min-width:0}
.booking-service{font-size:.92rem;font-weight:700;color:var(--text)}
.booking-meta{font-size:.75rem;color:var(--muted);margin-top:3px}
.booking-price{font-size:.88rem;font-weight:700;color:var(--p);flex-shrink:0}
.cancel-btn{padding:8px 14px;border-radius:10px;border:1.5px solid rgba(192,57,43,.25);background:rgba(192,57,43,.06);color:var(--red);font-family:'Manrope',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;transition:all .2s;flex-shrink:0}
.cancel-btn:hover{background:var(--red);color:#fff;border-color:var(--red)}
.booking-id{font-size:.62rem;color:var(--muted);margin-top:4px;font-weight:500}
.empty{text-align:center;padding:60px 20px;color:var(--muted);font-size:.9rem}
.section-label{font-size:.65rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--p);margin-bottom:10px}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);z-index:200;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal{background:#fff;border-radius:24px;padding:28px;max-width:380px;width:90%;text-align:center;animation:fadeUp .3s ease}
.modal h3{font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:400;margin-bottom:8px}
.modal p{font-size:.85rem;color:var(--muted);line-height:1.6;margin-bottom:20px}
.modal-btns{display:flex;gap:10px}
.modal-btns button{flex:1;padding:12px;border-radius:12px;border:none;font-family:'Manrope',sans-serif;font-weight:700;font-size:.85rem;cursor:pointer;transition:all .2s}
.btn-confirm{background:var(--red);color:#fff}
.btn-confirm:hover{background:#a93226}
.btn-cancel{background:var(--pale);color:var(--p)}
.btn-cancel:hover{background:#e8d5f5}
</style>
</head>
<body>
<nav>
  <img class="nav-logo" src="/logo.png" alt="logo">
  <div class="nav-title">Захиалга удирдах</div>
  <div class="nav-right">${sorted.length} захиалга</div>
</nav>

<div class="wrap">
  <div class="stats-row">
    <div class="stat">
      <div class="stat-num">${sorted.length}</div>
      <div class="stat-label">Нийт захиалга</div>
    </div>
    <div class="stat">
      <div class="stat-num">${sorted.filter(b => b.date === new Date().toISOString().split('T')[0]).length}</div>
      <div class="stat-label">Өнөөдрийн</div>
    </div>
    <div class="stat">
      <div class="stat-num">${sorted.filter(b => b.date > new Date().toISOString().split('T')[0]).length}</div>
      <div class="stat-label">Ирэх захиалга</div>
    </div>
    <div class="stat">
      <div class="stat-num">${new Set(sorted.map(b => b.phone)).size}</div>
      <div class="stat-label">Давтагдахгүй харилцагч</div>
    </div>
  </div>

  <div class="filter-row">
    <input class="search-input" id="searchInput" placeholder="Нэр, утас, үйлчилгээ хайх..." oninput="filterBookings()">
    <button class="filter-btn active" data-filter="all" onclick="setFilter('all', this)">Бүгд</button>
    <button class="filter-btn" data-filter="today" onclick="setFilter('today', this)">Өнөөдөр</button>
    <button class="filter-btn" data-filter="upcoming" onclick="setFilter('upcoming', this)">Ирэх</button>
  </div>

  <div class="section-label">Захиалгууд</div>
  <div id="bookingList">
    ${sorted.length === 0 ? '<div class="empty">Захиалга байхгүй байна</div>' : sorted.map(b => {
      const dateParts = b.date.split('-');
      const months = ['1-р','2-р','3-р','4-р','5-р','6-р','7-р','8-р','9-р','10-р','11-р','12-р'];
      const month = months[parseInt(dateParts[1]) - 1] || '';
      const today = new Date().toISOString().split('T')[0];
      const isPast = b.date < today;
      return `<div class="booking-card" data-date="${b.date}" data-search="${(b.customerName + ' ' + b.phone + ' ' + b.serviceName).toLowerCase()}">
        <div class="booking-date" style="${isPast ? 'opacity:.5' : ''}">
          <div class="day">${dateParts[2]}</div>
          <div class="month">${month}</div>
          <div class="time">${b.time}</div>
        </div>
        <div class="booking-info">
          <div class="booking-service">${b.serviceName}</div>
          <div class="booking-meta">${b.customerName} · ${b.phone}${b.note ? ' · ' + b.note : ''}</div>
          <div class="booking-id">${b.bookingId} · ${b.servicePrice}</div>
        </div>
        <div class="booking-price">${b.servicePrice}</div>
        <button class="cancel-btn" onclick="confirmCancel('${b.bookingId}', '${b.serviceName.replace(/'/g,"\'")}', '${b.date}', '${b.time}')">Цуцлах</button>
      </div>`;
    }).join('')}
  </div>
</div>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <h3>Захиалга цуцлах уу?</h3>
    <p id="modalText">Энэ захиалгыг цуцлах гэж байна.</p>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Болих</button>
      <button class="btn-confirm" id="confirmBtn">Цуцлах</button>
    </div>
  </div>
</div>

<script>
let currentFilter = 'all';
let pendingCancelId = null;
const TODAY = new Date().toISOString().split('T')[0];

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterBookings();
}

function filterBookings() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('.booking-card').forEach(card => {
    const date = card.dataset.date;
    const search = card.dataset.search;
    let show = true;
    if (currentFilter === 'today') show = date === TODAY;
    else if (currentFilter === 'upcoming') show = date > TODAY;
    if (q && !search.includes(q)) show = false;
    card.style.display = show ? 'flex' : 'none';
  });
}

function confirmCancel(id, service, date, time) {
  pendingCancelId = id;
  document.getElementById('modalText').textContent = service + ' — ' + date + ' ' + time + ' цагийн захиалгыг цуцлах уу? Sheets-ээс бүрмөсөн устгагдана.';
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('confirmBtn').onclick = doCancel;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  pendingCancelId = null;
}

async function doCancel() {
  if (!pendingCancelId) return;
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true; btn.textContent = 'Устгаж байна...';
  try {
    const r = await fetch('/booking-cancel', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ secret: '${ADMIN_SECRET}', bookingId: pendingCancelId })
    });
    const data = await r.json();
    if (r.ok) {
      const card = document.querySelector('[data-date]');
      document.querySelectorAll('.booking-card').forEach(c => {
        if (c.querySelector('.cancel-btn') && c.querySelector('.cancel-btn').getAttribute('onclick').includes(pendingCancelId)) {
          c.style.animation = 'none'; c.style.opacity = '0'; c.style.transform = 'scale(.95)';
          c.style.transition = 'all .3s ease';
          setTimeout(() => c.remove(), 300);
        }
      });
      closeModal();
    } else {
      alert(data.error || 'Алдаа гарлаа');
    }
  } catch(e) {
    alert('Сүлжээний алдаа');
  } finally {
    btn.disabled = false; btn.textContent = 'Цуцлах';
  }
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
</script>
</body>
</html>`);
  } catch(e) {
    console.error('Bookings page error:', e.message);
    res.status(500).send('Error loading bookings');
  }
});

// ── Cancel booking API ──
app.post('/booking-cancel', async (req, res) => {
  try {
    const secret = String(req.body.secret || '').trim();
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

    const bookingId = String(req.body.bookingId || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

    const booking = await getBookingById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const deleted = await cancelBooking(bookingId);
    if (!deleted) return res.status(500).json({ error: 'Failed to delete booking' });

    // Send cancellation email
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fef2f2;padding:24px;border-radius:16px">
        <h2 style="color:#c0392b;text-align:center">Захиалга цуцлагдлаа</h2>
        <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #fca5a5;margin-top:16px">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Үйлчилгээ:</strong> ${booking.serviceName}</p>
          <p><strong>Огноо:</strong> ${booking.date} ${booking.time}</p>
          <p><strong>Харилцагч:</strong> ${booking.customerName} — ${booking.phone}</p>
        </div>
      </div>`;
    sendEmail(`❌ Захиалга цуцлагдлаа: ${booking.serviceName} — ${booking.date} ${booking.time}`, emailHtml);

    return res.json({ ok: true });
  } catch(e) {
    console.error('Cancel booking error:', e.message);
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

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
