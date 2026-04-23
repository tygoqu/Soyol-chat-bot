const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const SHEET_ID = '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const INFO_SHEET = 'Sheet3';
const CREDENTIALS_PATH = '/etc/secrets/credentials.json';

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheetExists(sheetTitle) {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const titles = new Set(
    (meta.data.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean)
  );
  if (!titles.has(sheetTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
    });
  }
}

async function ensureDefaultInfoData() {
  const sheets = getSheets();
  await ensureSheetExists(INFO_SHEET);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${INFO_SHEET}!A:B` });
  const rows = res.data.values || [];
  if (rows.length > 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${INFO_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['key', 'value'],
        ['hero_title', 'Манай салонд тавтай морил'],
        ['hero_text', 'Арьс арчилгаа, үсчин, хумс, сормуус, хөмсөг болон бусад үйлчилгээг нэг дороос авах боломжтой.'],
        ['address', '3, 4-р хороолол, Ачлал их дэлгүүрийн замын эсрэг талд'],
        ['phone', '7059-9999, 9119-1215'],
        ['hours', 'Даваа-Баасан 09:00-21:00 | Бямба-Ням 10:00-21:00'],
        ['services', 'Гоо сайхан,Бариа,Хумс,Сормуус,Үсчин,Персинг,Laser эмчилгээ,Хими,Будаг,Үсний эмчилгээ'],
        ['instagram', ''],
        ['facebook', ''],
        ['announcement', ''],
      ],
    },
  });
}

async function getInfoData() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${INFO_SHEET}!A:B` });
  const rows = res.data.values || [];
  const data = {};
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0] || '';
    const value = rows[i][1] || '';
    if (key) data[key] = value;
  }
  return data;
}

async function saveInfoData(payload) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${INFO_SHEET}!A1:B20`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['key', 'value'],
        ['hero_title', payload.hero_title || ''],
        ['hero_text', payload.hero_text || ''],
        ['address', payload.address || ''],
        ['phone', payload.phone || ''],
        ['hours', payload.hours || ''],
        ['services', payload.services || ''],
        ['instagram', payload.instagram || ''],
        ['facebook', payload.facebook || ''],
        ['announcement', payload.announcement || ''],
      ],
    },
  });
}

function esc(v) {
  return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildInfoPage(info) {
  const template = fs.readFileSync(path.join(__dirname, 'info_page_v2.html'), 'utf8');

  const announcement = info.announcement
    ? `<div class="announcement">
        <div class="announcement-icon">📢</div>
        <div>
          <h3>Зар мэдээ</h3>
          <p>${esc(info.announcement)}</p>
        </div>
      </div>`
    : '';

  const services = (info.services || '').split(',').map((s, i) =>
    `<span class="service-pill" style="animation-delay:${i * 60}ms">${esc(s.trim())}</span>`
  ).join('');

  const social = [
    info.facebook ? `FB: ${esc(info.facebook)}` : '',
    info.instagram ? `IG: ${esc(info.instagram)}` : '',
  ].filter(Boolean).join('<br>') || 'Удахгүй нэмэгдэнэ';

  return template
    .replace('HERO_TITLE_PLACEHOLDER', esc(info.hero_title))
    .replace('HERO_TEXT_PLACEHOLDER', esc(info.hero_text))
    .replace('ADDRESS_PLACEHOLDER', esc(info.address))
    .replace('PHONE_PLACEHOLDER', esc(info.phone))
    .replace('HOURS_PLACEHOLDER', esc(info.hours).replace('|', '<br>'))
    .replace('SOCIAL_PLACEHOLDER', social)
    .replace('SERVICES_PLACEHOLDER', services)
    .replace('ANNOUNCEMENT_PLACEHOLDER', announcement);
}

function registerInfoRoutes(app, adminSecret) {
  app.get('/info', async (req, res) => {
    try {
      await ensureDefaultInfoData();
      const info = await getInfoData();
      res.send(buildInfoPage(info));
    } catch (e) {
      console.error('Info page error:', e.message);
      res.status(500).send('Info page error');
    }
  });

  app.get('/info-admin', async (req, res) => {
    try {
      const secret = String(req.query.secret || '');
      if (secret !== adminSecret) {
        return res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Info Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f7f3f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:420px;background:#fff;border:1px solid #eadff0;border-radius:20px;padding:28px;text-align:center}
h2{color:#6b2180;margin-bottom:12px}p{color:#7c6d87;font-size:14px;line-height:1.6}
code{background:#f3e8f9;color:#6b2180;padding:4px 8px;border-radius:6px;font-size:13px}
</style></head><body>
<div class="card">
  <h2>🔒 Info Admin</h2>
  <p>URL дээр password-оо оруулна уу:</p>
  <br><code>/info-admin?secret=YOUR_PASSWORD</code>
</div></body></html>`);
      }

      await ensureDefaultInfoData();
      const info = await getInfoData();

      res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Info Admin</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#f7f3f8;color:#1a0a20;padding:24px;min-height:100vh}
.wrap{max-width:700px;margin:0 auto}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.topbar h1{font-size:1.3rem;font-weight:700;color:#6b2180}
.topbar a{color:#6b2180;text-decoration:none;font-size:0.85rem;font-weight:600;background:#f3e8f9;padding:8px 14px;border-radius:100px}
.card{background:#fff;border:1px solid rgba(107,33,128,0.12);border-radius:20px;padding:24px;margin-bottom:16px}
.card h2{font-size:0.7rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#9b59b6;margin-bottom:16px}
label{display:block;font-size:0.78rem;font-weight:600;color:#7c6d87;margin-bottom:6px;margin-top:14px}
label:first-of-type{margin-top:0}
input,textarea{width:100%;border:1.5px solid rgba(107,33,128,0.15);border-radius:10px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:0.9rem;color:#1a0a20;outline:none;transition:border-color 0.2s;background:#faf8fc}
input:focus,textarea:focus{border-color:#6b2180;box-shadow:0 0 0 3px rgba(107,33,128,0.08)}
textarea{resize:vertical;min-height:90px}
.help{font-size:0.72rem;color:#9b59b6;margin-top:4px}
button{width:100%;padding:14px;border:none;border-radius:12px;background:#6b2180;color:#fff;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:700;cursor:pointer;margin-top:20px;transition:all 0.2s}
button:hover{background:#8e2fb5;transform:translateY(-1px)}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <h1>✏️ Info Page засах</h1>
    <a href="/info" target="_blank">Харах →</a>
  </div>

  <form method="POST" action="/info-admin-save?secret=${encodeURIComponent(adminSecret)}">
    <div class="card">
      <h2>Hero хэсэг</h2>
      <label>Гарчиг</label>
      <input name="hero_title" value="${esc(info.hero_title)}">
      <label>Тайлбар текст</label>
      <textarea name="hero_text">${esc(info.hero_text)}</textarea>
    </div>

    <div class="card">
      <h2>Холбоо барих</h2>
      <label>Хаяг</label>
      <textarea name="address">${esc(info.address)}</textarea>
      <label>Утас</label>
      <input name="phone" value="${esc(info.phone)}">
      <label>Цагийн хуваарь</label>
      <input name="hours" value="${esc(info.hours)}">
    </div>

    <div class="card">
      <h2>Үйлчилгээ</h2>
      <label>Үйлчилгээнүүд</label>
      <textarea name="services">${esc(info.services)}</textarea>
      <div class="help">Таслалаар салгаж бичнэ үү. Жишээ: Гоо сайхан, Бариа, Хумс</div>
    </div>

    <div class="card">
      <h2>Сошиал хаяг</h2>
      <label>Facebook</label>
      <input name="facebook" value="${esc(info.facebook)}" placeholder="facebook.com/...">
      <label>Instagram</label>
      <input name="instagram" value="${esc(info.instagram)}" placeholder="@username">
    </div>

    <div class="card">
      <h2>Зар мэдээ (заавал биш)</h2>
      <label>Зар мэдээ</label>
      <textarea name="announcement" placeholder="Урамшуулал, мэдэгдэл...">${esc(info.announcement)}</textarea>
      <div class="help">Хоосон орхивол харагдахгүй</div>
    </div>

    <button type="submit">💾 Хадгалах</button>
  </form>
</div>
</body>
</html>`);
    } catch (e) {
      console.error('Info admin error:', e.message);
      res.status(500).send('Info admin error');
    }
  });

  app.post('/info-admin-save', async (req, res) => {
    try {
      const secret = String(req.query.secret || '');
      if (secret !== adminSecret) return res.status(401).send('Unauthorized');
      await saveInfoData(req.body || {});
      return res.redirect('/info-admin?secret=' + encodeURIComponent(adminSecret));
    } catch (e) {
      console.error('Info save error:', e.message);
      res.status(500).send('Save failed');
    }
  });
}

module.exports = { registerInfoRoutes };
