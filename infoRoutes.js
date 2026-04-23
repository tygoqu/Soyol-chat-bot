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
  return google.sheets({ version: 'v4', auth });
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
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
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
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInfoPage(info) {
  const announcement = info.announcement
    ? `
      <div class="announcement" data-reveal>
        <div class="announcement-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/>
            <path d="M10 21a2 2 0 0 0 4 0"/>
          </svg>
        </div>
        <div>
          <h3>Зар мэдээ</h3>
          <p>${esc(info.announcement)}</p>
        </div>
      </div>
    `
    : '';

  const services = (info.services || '')
    .split(',')
    .map((s, i) => {
      const name = esc(s.trim());
      if (!name) return '';
      return `<span class="service-pill" style="animation-delay:${i * 70}ms">${name}</span>`;
    })
    .join('');

  const social = [
    info.facebook ? `<span class="social-chip">Facebook · ${esc(info.facebook)}</span>` : '',
    info.instagram ? `<span class="social-chip">Instagram · ${esc(info.instagram)}</span>` : '',
  ].filter(Boolean).join('') || '<span class="social-chip muted">Удахгүй нэмэгдэнэ</span>';

  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soyol Spa Salon</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #f8f3fb;
  --bg-2: #f4ebf8;
  --card: rgba(255,255,255,0.78);
  --card-strong: rgba(255,255,255,0.92);
  --text: #24152b;
  --muted: #776784;
  --line: rgba(98, 52, 123, 0.12);
  --purple: #6b2180;
  --purple-2: #8f52aa;
  --purple-3: #eedeff;
  --shadow: 0 20px 60px rgba(78, 24, 97, 0.10);
}

html { scroll-behavior: smooth; }

body {
  font-family: 'Manrope', sans-serif;
  background:
    radial-gradient(circle at 15% 10%, rgba(143,82,170,0.18), transparent 26%),
    radial-gradient(circle at 85% 20%, rgba(107,33,128,0.12), transparent 24%),
    radial-gradient(circle at 50% 80%, rgba(194,164,216,0.18), transparent 28%),
    linear-gradient(180deg, var(--bg), var(--bg-2));
  color: var(--text);
  overflow-x: hidden;
}

.bg-grid,
.bg-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.bg-grid {
  background-image:
    linear-gradient(rgba(107,33,128,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(107,33,128,0.03) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black 35%, transparent 90%);
}

.bg-glow::before,
.bg-glow::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  filter: blur(90px);
  animation: floatOrb 13s ease-in-out infinite;
}

.bg-glow::before {
  width: 360px;
  height: 360px;
  top: 8%;
  left: -80px;
  background: rgba(143,82,170,0.18);
}

.bg-glow::after {
  width: 320px;
  height: 320px;
  right: -80px;
  bottom: 8%;
  background: rgba(107,33,128,0.14);
  animation-delay: -5s;
}

@keyframes floatOrb {
  0%, 100% { transform: translateY(0) translateX(0) scale(1); }
  50% { transform: translateY(-20px) translateX(16px) scale(1.06); }
}

.nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 50;
  height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--line);
  animation: slideDown .7s ease both;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-16px); }
  to { opacity: 1; transform: translateY(0); }
}

.nav-logo {
  height: 46px;
  width: auto;
  display: block;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn,
.nav-btn,
.cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 52px;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  line-height: 1.15;
  font-weight: 600;
  transition: transform .22s ease, box-shadow .22s ease, background .22s ease, border-color .22s ease;
}

.nav-btn {
  padding: 0 18px;
  border-radius: 999px;
  font-size: 14px;
  border: 1px solid var(--line);
}

.nav-btn svg,
.btn svg,
.cta-btn svg,
.info-icon svg,
.announcement-icon svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.nav-btn-ghost {
  background: rgba(255,255,255,0.55);
  color: var(--purple);
}

.nav-btn-fill {
  background: linear-gradient(135deg, var(--purple), var(--purple-2));
  color: #fff;
  box-shadow: 0 10px 24px rgba(107,33,128,0.22);
}

.nav-btn:hover,
.btn:hover,
.cta-btn:hover {
  transform: translateY(-2px);
}

.hero {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 112px 20px 60px;
}

.hero-inner {
  width: 100%;
  max-width: 1080px;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 28px;
  align-items: center;
}

.hero-copy {
  animation: fadeUp .75s ease .12s both;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,0.66);
  border: 1px solid var(--line);
  color: var(--purple);
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  margin-bottom: 22px;
  backdrop-filter: blur(12px);
}

.hero-logo {
  width: 120px;
  height: 120px;
  object-fit: contain;
  display: block;
  margin-bottom: 22px;
  filter: drop-shadow(0 18px 30px rgba(107,33,128,0.16));
  animation: logoFloat 5s ease-in-out infinite;
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(52px, 8vw, 90px);
  line-height: .92;
  font-weight: 600;
  letter-spacing: -.03em;
  margin-bottom: 18px;
}

.hero h1 span {
  color: var(--purple);
}

.hero p {
  font-size: 18px;
  line-height: 1.8;
  color: var(--muted);
  max-width: 560px;
  margin-bottom: 28px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.btn {
  padding: 0 24px;
  border-radius: 999px;
  font-size: 15px;
  border: 1px solid transparent;
}

.btn-primary {
  background: linear-gradient(135deg, var(--purple), var(--purple-2));
  color: #fff;
  box-shadow: 0 18px 34px rgba(107,33,128,0.20);
}

.btn-secondary {
  background: rgba(255,255,255,0.74);
  color: var(--purple);
  border-color: var(--line);
  backdrop-filter: blur(14px);
}

.hero-side {
  animation: fadeUp .75s ease .24s both;
}

.glass-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 30px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.hero-panel {
  padding: 26px;
  position: relative;
  overflow: hidden;
}

.hero-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,0.34), transparent);
  transform: translateX(-120%);
  animation: sweep 6s linear infinite;
}

@keyframes sweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}

.hero-panel-top {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.mini-card {
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(107,33,128,0.10);
  border-radius: 22px;
  padding: 18px;
}

.mini-card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .16em;
  color: var(--muted);
  margin-bottom: 8px;
}

.mini-card-value {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text);
}

.scroll-note {
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  animation: fadeUp .8s ease .6s both;
}

.scroll-line {
  width: 1px;
  height: 42px;
  background: linear-gradient(to bottom, rgba(107,33,128,0.9), transparent);
  animation: pulseLine 2s ease-in-out infinite;
}

@keyframes pulseLine {
  0%, 100% { opacity: .45; transform: scaleY(1); }
  50% { opacity: 1; transform: scaleY(1.18); }
}

.section {
  position: relative;
  z-index: 2;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 20px 70px;
}

.section-head {
  margin-bottom: 26px;
}

.section-label {
  color: var(--purple);
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  margin-bottom: 8px;
  font-weight: 700;
}

.section-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(36px, 5vw, 54px);
  line-height: 1;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.info-card {
  padding: 22px;
  min-height: 220px;
  opacity: 0;
  transform: translateY(28px);
}

.info-card.visible {
  animation: fadeUp .65s ease forwards;
}

.info-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 24px 50px rgba(78,24,97,0.12);
}

.info-icon,
.announcement-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(107,33,128,0.10), rgba(143,82,170,0.18));
  color: var(--purple);
  margin-bottom: 16px;
  border: 1px solid rgba(107,33,128,0.10);
}

.info-card h3 {
  font-size: 12px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}

.info-card p,
.social-wrap {
  font-size: 15px;
  line-height: 1.85;
  color: var(--text);
}

.announcement {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 18px;
  padding: 24px 26px;
  margin-bottom: 16px;
  border-radius: 26px;
  background: linear-gradient(135deg, var(--purple), var(--purple-2));
  color: #fff;
  box-shadow: 0 18px 40px rgba(107,33,128,0.24);
}

.announcement h3 {
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  opacity: .82;
  margin-bottom: 8px;
}

.announcement p {
  line-height: 1.8;
  font-size: 15px;
}

.services-wrap {
  padding: 26px;
}

.services-grid,
.social-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.service-pill,
.social-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(107,33,128,0.10);
  background: rgba(255,255,255,0.76);
  color: var(--purple);
  font-size: 14px;
  font-weight: 600;
  opacity: 0;
  transform: translateY(10px) scale(.96);
  animation: pillIn .45s ease forwards;
}

.social-chip.muted {
  color: var(--muted);
}

.service-pill:hover,
.social-chip:hover {
  background: linear-gradient(135deg, var(--purple), var(--purple-2));
  color: #fff;
  transform: translateY(-2px) scale(1.02);
}

@keyframes pillIn {
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.cta-section {
  margin-top: 18px;
  padding: 42px 26px;
  border-radius: 32px;
  background:
    radial-gradient(circle at top center, rgba(255,255,255,0.10), transparent 40%),
    linear-gradient(135deg, #5f1875, #8f52aa);
  color: #fff;
  text-align: center;
  overflow: hidden;
}

.cta-section h2 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(38px, 5vw, 60px);
  line-height: 1;
  font-weight: 600;
  margin-bottom: 12px;
}

.cta-section p {
  max-width: 560px;
  margin: 0 auto 22px;
  line-height: 1.8;
  opacity: .86;
  font-size: 16px;
}

.cta-btn {
  padding: 0 26px;
  border-radius: 999px;
  background: #fff;
  color: var(--purple);
  font-size: 15px;
  box-shadow: 0 18px 36px rgba(0,0,0,0.18);
}

.footer {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 18px 20px 38px;
  color: var(--muted);
  font-size: 12px;
}

[data-reveal] {
  opacity: 0;
  transform: translateY(28px);
}

[data-reveal].visible {
  animation: fadeUp .65s ease forwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 980px) {
  .hero-inner,
  .info-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .nav {
    padding: 0 14px;
    height: 70px;
  }

  .nav-actions {
    gap: 8px;
  }

  .nav-btn {
    padding: 0 14px;
    font-size: 13px;
  }

  .hero {
    padding-top: 100px;
  }

  .hero-inner,
  .info-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions,
  .nav-actions {
    flex-wrap: wrap;
  }

  .btn,
  .nav-btn,
  .cta-btn {
    width: 100%;
  }

  .announcement {
    grid-template-columns: 1fr;
  }

  .scroll-note {
    display: none;
  }
}
</style>
</head>
<body>

<div class="bg-grid"></div>
<div class="bg-glow"></div>

<nav class="nav">
  <img class="nav-logo" src="/logo.png" alt="Soyol Spa Salon logo">
  <div class="nav-actions">
    <a class="nav-btn nav-btn-ghost" href="#details">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/>
      </svg>
      <span>Мэдээлэл</span>
    </a>
    <a class="nav-btn nav-btn-fill" href="/booking">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="3"/>
        <path d="M16 3v4M8 3v4M3 10h18"/>
      </svg>
      <span>Цаг захиалах</span>
    </a>
  </div>
</nav>

<section class="hero">
  <div class="hero-inner">
    <div class="hero-copy">
      <div class="hero-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/>
        </svg>
        <span>Premium Beauty Experience</span>
      </div>

      <img class="hero-logo" src="/logo.png" alt="Soyol Spa Salon logo">

      <h1>${esc(info.hero_title).replace('PLACEHOLDER', '')}<span></span></h1>
      <p>${esc(info.hero_text)}</p>

      <div class="hero-actions">
        <a class="btn btn-primary" href="/booking">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="3"/>
            <path d="M16 3v4M8 3v4M3 10h18"/>
          </svg>
          <span>Цаг захиалах</span>
        </a>

        <a class="btn btn-secondary" href="#details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8h.01M11 12h1v4h1"/>
          </svg>
          <span>Дэлгэрэнгүй харах</span>
        </a>
      </div>
    </div>

    <div class="hero-side">
      <div class="glass-card hero-panel">
        <div class="hero-panel-top">
          <div class="mini-card">
            <div class="mini-card-label">Хаяг</div>
            <div class="mini-card-value">${esc(info.address)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-card-label">Утас</div>
            <div class="mini-card-value">${esc(info.phone)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-card-label">Цагийн хуваарь</div>
            <div class="mini-card-value">${esc(info.hours).replace('|', '<br>')}</div>
          </div>
          <div class="mini-card">
            <div class="mini-card-label">Social</div>
            <div class="mini-card-value">Messenger · Facebook · Instagram</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="scroll-note">
    <span>Scroll</span>
    <div class="scroll-line"></div>
  </div>
</section>

<section class="section" id="details">
  ${announcement}

  <div class="section-head" data-reveal>
    <div class="section-label">Contact</div>
    <h2 class="section-title">Бүх мэдээлэл нэг дор</h2>
  </div>

  <div class="info-grid">
    <div class="glass-card info-card" data-reveal>
      <div class="info-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
      <h3>Байршил</h3>
      <p>${esc(info.address)}</p>
    </div>

    <div class="glass-card info-card" data-reveal>
      <div class="info-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.8l-1.3 1.3a16 16 0 0 0 7 7l1.3-1.3a2 2 0 0 1 1.8-.6l2.6.4A2 2 0 0 1 22 16.9z"/>
        </svg>
      </div>
      <h3>Холбоо барих</h3>
      <p>${esc(info.phone)}</p>
    </div>

    <div class="glass-card info-card" data-reveal>
      <div class="info-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 3"/>
        </svg>
      </div>
      <h3>Цагийн хуваарь</h3>
      <p>${esc(info.hours).replace('|', '<br>')}</p>
    </div>

    <div class="glass-card info-card" data-reveal>
      <div class="info-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 7.5a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"/>
          <path d="M7 13a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"/>
          <path d="M17 22v-4a4 4 0 0 0-4-4H7"/>
          <path d="M22 22v-3a4 4 0 0 0-3-3.87"/>
        </svg>
      </div>
      <h3>Сошиал</h3>
      <div class="social-wrap">${social}</div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-head" data-reveal>
    <div class="section-label">Services</div>
    <h2 class="section-title">Манай үйлчилгээ</h2>
  </div>

  <div class="glass-card services-wrap" data-reveal>
    <div class="services-grid">
      ${services}
    </div>
  </div>
</section>

<section class="section">
  <div class="cta-section glass-card" data-reveal>
    <h2>Өөртөө цаг гаргаарай</h2>
    <p>Салон дээр ирэх цагаа онлайнаар хурдан захиалаад, өөрт тохирох үйлчилгээгээ сонгоорой.</p>
    <a class="cta-btn" href="/booking">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="3"/>
        <path d="M16 3v4M8 3v4M3 10h18"/>
      </svg>
      <span>Цаг захиалах</span>
    </a>
  </div>
</section>

<div class="footer">© Soyol Spa Salon</div>

<script>
const revealItems = document.querySelectorAll('[data-reveal]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });

revealItems.forEach((item) => observer.observe(item));
</script>
</body>
</html>`;
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
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Info Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f7f3f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:420px;background:#fff;border:1px solid #eadff0;border-radius:20px;padding:28px;text-align:center}
h2{color:#6b2180;margin-bottom:12px}p{color:#7c6d87;font-size:14px;line-height:1.6}
code{background:#f3e8f9;color:#6b2180;padding:4px 8px;border-radius:6px;font-size:13px}
</style>
</head>
<body>
<div class="card">
  <h2>Info Admin</h2>
  <p>URL дээр password-оо оруулна уу:</p>
  <br><code>/info-admin?secret=YOUR_PASSWORD</code>
</div>
</body>
</html>`);
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
    <h1>Info Page засах</h1>
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
