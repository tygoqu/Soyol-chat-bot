const path = require('path');
const { google } = require('googleapis');

const SHEET_ID = '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const INFO_SHEET = 'Sheet3';
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
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
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

async function ensureDefaultInfoData() {
  const sheets = getSheets();
  await ensureSheetExists(INFO_SHEET);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${INFO_SHEET}!A:B`,
  });

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
        ['services', 'Гоо сайхан, Бариа, Хумс, Сормуус, Үсчин, Персинг'],
        ['instagram', ''],
        ['facebook', ''],
        ['announcement', ''],
      ],
    },
  });
}

async function getInfoData() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${INFO_SHEET}!A:B`,
  });

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

  const values = [
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
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${INFO_SHEET}!A1:B20`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function registerInfoRoutes(app, adminSecret) {
  app.get('/info', async (req, res) => {
    try {
      await ensureDefaultInfoData();
      const info = await getInfoData();

      res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мэдээлэл</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f6f3f7; color: #1f2937; }
    .topbar { height: 84px; background: #fff; border-bottom: 1px solid #ece7f0; display: flex; align-items: center; justify-content: center; }
    .topbar img { height: 58px; width: auto; display: block; }
    .wrap { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }
    .hero, .card { background: #fff; border: 1px solid #ece7f0; border-radius: 18px; padding: 22px; margin-bottom: 16px; }
    .hero h1 { font-size: 28px; margin-bottom: 10px; }
    .hero p, .card p, .card li { line-height: 1.7; color: #4b5563; }
    .card h2 { font-size: 18px; margin-bottom: 10px; color: #7b2d8b; }
    .row { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
    .pill { display: inline-block; background: #f3edf7; color: #7b2d8b; border-radius: 999px; padding: 8px 12px; margin: 4px 6px 0 0; font-size: 14px; }
    .buttons { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .btn { text-decoration: none; padding: 12px 16px; border-radius: 12px; font-weight: 700; display: inline-block; }
    .btn-primary { background: #7b2d8b; color: #fff; }
    .btn-secondary { background: #f3edf7; color: #7b2d8b; border: 1px solid #e7d8ef; }
    @media (max-width: 700px) { .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="topbar"><img src="/logo.png" alt="logo"></div>
    <div class="hero">
    <h1>${esc(info.hero_title)}</h1>
    <p>${esc(info.hero_text)}</p>
    <div class="buttons">
      <a class="btn btn-primary" href="/booking">Цаг захиалах</a>
      <a class="btn btn-secondary" href="tel:+97670599999">Залгах</a>
    </div>
  </div>
    ${info.announcement ? `<div class="card"><h2>Зар мэдээ</h2><p>${esc(info.announcement)}</p></div>` : ''}

    <div class="row">
      <div class="card">
        <h2>Хаяг</h2>
        <p>${esc(info.address)}</p>
      </div>
      <div class="card">
        <h2>Холбоо барих</h2>
        <p>${esc(info.phone)}</p>
      </div>
    </div>

    <div class="row">
      <div class="card">
        <h2>Цагийн хуваарь</h2>
        <p>${esc(info.hours)}</p>
      </div>
      <div class="card">
        <h2>Сошиал</h2>
        <p>Facebook: ${esc(info.facebook || '-')}</p>
        <p>Instagram: ${esc(info.instagram || '-')}</p>
      </div>
    </div>

    <div class="card">
      <h2>Үндсэн үйлчилгээ</h2>
      ${(info.services || '').split(',').map(s => s.trim()).filter(Boolean).map(s => `<span class="pill">${esc(s)}</span>`).join('')}
    </div>
  </div>
</body>
</html>`);
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
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Info Admin</title>
<style>
body{font-family:Arial,sans-serif;background:#f7f3f8;padding:24px} .card{max-width:520px;margin:60px auto;background:#fff;border:1px solid #eadff0;border-radius:18px;padding:24px} input,button{width:100%;padding:12px;border-radius:12px;font:inherit} input{border:1px solid #d9cbe4;margin-top:10px} button{border:0;background:#7b2d8b;color:#fff;font-weight:700;margin-top:12px}
</style></head><body>
<div class="card">
  <h2>Info Admin</h2>
  <p>Password-оо URL дээр ингэж оруулна:</p>
  <p><b>/info-admin?secret=YOUR_PASSWORD</b></p>
</div>
</body></html>`);
      }

      await ensureDefaultInfoData();
      const info = await getInfoData();

      res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Info Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f3f8; padding: 24px; color: #241b2f; }
    .card { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #eadff0; border-radius: 18px; padding: 24px; }
    h1 { margin-top: 0; }
    label { display: block; margin: 14px 0 8px; font-size: 13px; font-weight: 700; }
    input, textarea, button { width: 100%; border-radius: 12px; font: inherit; }
    input, textarea { border: 1px solid #d9cbe4; padding: 12px 14px; background: #fff; }
    textarea { min-height: 100px; resize: vertical; }
    button { border: 0; padding: 13px 16px; margin-top: 16px; background: #7b2d8b; color: #fff; font-weight: 700; cursor: pointer; }
    .help { color: #7d6c8e; font-size: 13px; margin-top: 6px; }
    .top { display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .link { color:#7b2d8b; text-decoration:none; font-weight:700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <h1>Info Page Admin</h1>
      <a class="link" href="/info" target="_blank">/info үзэх</a>
    </div>

    <form method="POST" action="/info-admin-save?secret=${encodeURIComponent(adminSecret)}">
      <label>Гарчиг</label>
      <input name="hero_title" value="${esc(info.hero_title)}">

      <label>Тайлбар</label>
      <textarea name="hero_text">${esc(info.hero_text)}</textarea>

      <label>Хаяг</label>
      <textarea name="address">${esc(info.address)}</textarea>

      <label>Утас</label>
      <input name="phone" value="${esc(info.phone)}">

      <label>Цагийн хуваарь</label>
      <input name="hours" value="${esc(info.hours)}">

      <label>Үйлчилгээ</label>
      <textarea name="services">${esc(info.services)}</textarea>
      <div class="help">Таслалаар салгаж бичнэ. Жишээ: Гоо сайхан, Бариа, Хумс</div>

      <label>Facebook</label>
      <input name="facebook" value="${esc(info.facebook)}">

      <label>Instagram</label>
      <input name="instagram" value="${esc(info.instagram)}">

      <label>Зар мэдээ</label>
      <textarea name="announcement">${esc(info.announcement)}</textarea>

      <button type="submit">Хадгалах</button>
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
      if (secret !== adminSecret) {
        return res.status(401).send('Unauthorized');
      }

      await saveInfoData(req.body || {});
      return res.redirect('/info-admin?secret=' + encodeURIComponent(adminSecret));
    } catch (e) {
      console.error('Info save error:', e.message);
      res.status(500).send('Save failed');
    }
  });
}
