const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;
const PAGE_ID = process.env.PAGE_ID || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'soyol2024';

const SHEET_ID = process.env.SHEET_ID || '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const SUBSCRIBERS_SHEET = process.env.SUBSCRIBERS_SHEET || 'Sheet1';
const BOOKINGS_SHEET = process.env.BOOKINGS_SHEET || 'Sheet2';
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '/etc/secrets/credentials.json';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = GEMINI_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  : '';

const conversations = new Map();

const BOOKING_URL = process.env.BOOKING_URL || 'https://soyol-chat-bot.onrender.com/booking';

const SYSTEM_PROMPT = `Та Soyol Spa Salon-ын AI туслах юм. Зөвхөн Монгол хэлээр хариулна. Хариулт богино, ойлгомжтой, 2-4 өгүүлбэртэй байна. Emoji бүү ашигла.

Салоны тухай асуултад зөвхөн доорх мэдээлэлд тулгуурлан хариул.
Хэрэв хэрэглэгч цаг захиалахыг хүсвэл энэ холбоосыг өг: ${BOOKING_URL}
Хэрэв хэрэглэгч залгах эсвэл лавлахыг хүсвэл: 7059-9999, 9119-1215
Хэрэв үнэ нь хүрээтэй бол доод үнийг хэлээд дэлгэрэнгүйг утсаар лавлахыг зөвлө.
Хэрэв хэрэглэгч үс, хими, будаг асуувал эдгээрийг нэг ангилал гэж ойлго.
Хэрэв хэрэглэгч хумс, manicure, pedicure, маникюр, педикюр гэж асуувал эхлээд Маникюр 35,000₮, Педикюр 85,000₮, French будалт 45,000₮ гэж товч дурд.
Хэрэв хэрэглэгч үсний эмчилгээ, хуйхны спа, уураг, тосон тэжээл гэж асуувал эхлээд Хуйхны спа цэвэрлэгээ 65,000₮-аас, Уураг 50,000₮-аас, Тосон тэжээл 35,000₮-аас гэж товч хариул.
Хэрэв хэрэглэгч мэнгэ, үү, ургацаг авах тухай асуувал: Үү ургацаг /1ш/ 15,000₮-аас, Мэнгэ түүх /1ш/ 35,000₮-аас гэж товч хариул.
Хэрэв хэрэглэгч персинг асуувал: Чих цоолох 20,000₮, Хүйс цоолох 45,000₮, Хөмсөг болон хамар цоолох 35,000₮ гэж эхэлж хариул.
Хэрэв асуулт салонтой холбоогүй бол эелдгээр салон, үйлчилгээ, үнэ, цаг захиалгын талаар тусалж чадна гэж хариул.

БАЙРШИЛ, ХОЛБОО БАРИХ:
- Хаяг: 3, 4-р хороолол, Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon
- Утас: 7059-9999, 9119-1215
- Цагийн хуваарь: Даваа-Баасан 9:00-21:00, Бямба-Ням 10:00-21:00

ГОО САЙХАН:
- Miracle CO2: 85,000₮
- Carbon peel: 85,000₮
- Green peel: 350,000-540,000₮
- Carboxy: 85,000₮
- Батга цэвэрлэгээ: 85,000-120,000₮
- Үү ургацаг /1ш/: 15,000-85,000₮
- Мэнгэ түүх /1ш/: 35,000-65,000₮

ХУМС:
- Маникюр: 35,000₮
- French будалт: 45,000₮
- Смарт хумс: 65,000₮
- Педикюр: 85,000₮
- Энгийн педикюр: 65,000₮

СОРМУУС, ХӨМСӨГ:
- Сормуус: 65,000₮
- Хөмсөг засах: 10,000₮
- Хөмсөг хими: 35,000₮
- Сормуус хими: 35,000₮
- 6D үстэй мэт уусгалттай хөмсөгний шивээс: 250,000₮
- 6D үстэй мэт уусгалттай хөмсөгний шивээс нь 450,000₮-аас 250,000₮ болж хямдарсан

ПЕРСИНГ:
- Чих цоолох: 20,000₮
- Хүйс цоолох: 45,000₮
- Хөмсөг цоолох: 35,000₮
- Хамар цоолох: 35,000₮
- Хэл цоолох: үнэ тохирно
- Хацар цоолох: үнэ тохирно

LASER ЭМЧИЛГЭЭ:
- Сэвхний лазер: 250,000₮
- Нүжжилтийн эсрэг: 250,000₮
- Шивээс арилгах: 120,000-650,000₮

ҮСЧИН, ХИМИ, БУДАГ:
- Эрэгтэй үс засалт: 25,000₮
- Эмэгтэй тайралт: 35,000₮
- Эмэгтэй үс засалт: 35,000₮
- Шулуун хими: 85,000-280,000₮
- Шулуун хими /хүүхэд/: 50,000-120,000₮
- Шулуун хими /эрэгтэй/: 50,000-90,000₮
- Тосон буржгар хими: 65,000-120,000₮
- Тосон буржгар хими /хүүхэд/: 50,000-80,000₮
- Ботокс: 80,000-180,000₮
- Кератин: 120,000-280,000₮
- Хими арчих: 50,000-120,000₮
- Угны хими: 50,000-80,000₮
- Будаг: 45,000-65,000₮
- Угны будаг: 45,000-55,000₮
- Өнгө гаргаж будах: 20-40% хямдрал
- Хими болон өнгө гаргаж будах үйлчилгээнд 20-40% хямдралтай

ҮСНИЙ ЭМЧИЛГЭЭ:
- Хуйхны спа цэвэрлэгээ: 65,000-85,000₮
- Хуйхны спа цэвэрлэгээ /хүүхэд/: 50,000-65,000₮
- Эрчимжүүлсэн эмчилгээний тос /1 удаа/: 65,000-120,000₮
- Эрчимжүүлсэн эмчилгээний тос /курс/: 255,000-450,000₮
- Уураг /1 удаа/: 50,000-85,000₮
- Уураг /курс/: 250,000-500,000₮
- Тосон тэжээл /1 удаа/: 35,000-60,000₮
- Тосон тэжээл /курс/: 150,000-300,000₮`;

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
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
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
      requestBody: { values: [headers] },
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

async function askGemini(userId, userMessage) {
  if (!GEMINI_API_KEY || !GEMINI_URL) return null;

  try {
    if (!conversations.has(userId)) {
      conversations.set(userId, []);
    }

    const history = conversations.get(userId);
    history.push({ role: 'user', parts: [{ text: userMessage }] });
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: history,
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.7,
      },
    };

    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (data.error) {
      console.error('Gemini error:', data.error);
      return null;
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) return null;

    history.push({ role: 'model', parts: [{ text: aiText }] });
    return aiText;
  } catch (e) {
    console.error('Gemini fetch error:', e.message);
    return null;
  }
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

function makeGenericElements(items) {
  return items.map((item) => ({
    title: item.title,
    image_url: item.image_url,
    subtitle: item.subtitle,
    buttons: [
      {
        type: 'web_url',
        title: 'Цаг авах',
        url: BOOKING_URL,
        webview_height_ratio: 'full',
      },
    ],
  }));
}

async function sendMainMenu(id) {
  let name = 'та';

  try {
    const r = await fetch(`https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`);
    const p = await r.json();
    if (p.first_name) name = p.first_name;
  } catch {}

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
              text: `Сайн байна уу ${name}. Soyol Spa Salon-д тавтай морил. Та үйлчилгээ, үнэ, цаг захиалгын талаар асууж болно.`,
              buttons: [
                { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
                {
                  type: 'web_url',
                  title: 'Цаг захиалах',
                  url: BOOKING_URL,
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
  const elements = [
    {
      title: 'Гоо сайхны үйлчилгээ',
      image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Нүүр арчилгаа, цэвэрлэгээ, peel',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }],
    },
    {
      title: 'Үсчин',
      image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үс засалт, тайралт, хими, будаг',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }],
    },
    {
      title: 'Маникюр, педикюр',
      image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Маникюр, педикюр, хумсны үйлчилгээ',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }],
    },
    {
      title: 'Сормуус, хөмсөг',
      image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Сормуус, хөмсөг, 6D шивээс',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }],
    },
    {
      title: 'Чих цоолох, персинг',
      image_url: 'https://images.unsplash.com/photo-1596944948860-67d8f0d2f30e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Чих, хамар, хүйс болон бусад',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PIERCING_SERVICE' }],
    },
    {
      title: 'Мэнгэ, үү, ургацаг авах',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Мэнгэ түүх, үү ургацаг авах',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'REMOVAL_SERVICE' }],
    },
    {
      title: 'Үсний эмчилгээ',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Хуйхны спа, уураг, тосон тэжээл',
      buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIRTREATMENT_SERVICE' }],
    }
  ];

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

  console.log('services:', await r.json());
}

async function sendBeautyCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Miracle CO2',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Carbon peel',
      image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Green peel',
      image_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 350,000₮-аас',
    },
    {
      title: 'Батга цэвэрлэгээ',
      image_url: 'https://images.unsplash.com/photo-1552693673-1bf958298935?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮-аас',
    },
    {
      title: 'Carboxy',
      image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Үү ургацаг /1ш/',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 15,000₮-аас',
    },
    {
      title: 'Мэнгэ түүх /1ш/',
      image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮-аас',
    }
  ]);

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
  const elements = makeGenericElements([
    {
      title: 'Эрэгтэй үс засалт',
      image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 25,000₮',
    },
    {
      title: 'Эмэгтэй тайралт',
      image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Эмэгтэй үс засалт',
      image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Шулуун хими',
      image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮-аас',
    },
    {
      title: 'Тосон буржгар хими',
      image_url: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Ботокс',
      image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 80,000₮-аас',
    },
    {
      title: 'Кератин',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 120,000₮-аас',
    },
    {
      title: 'Өнгө гаргаж будах',
      image_url: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: '20–40% хямдрал',
    }
  ]);

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

  console.log('hair:', await r.json());
}

async function sendEyelashCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Сормуус',
      image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
    {
      title: 'Хөмсөг засах',
      image_url: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 10,000₮',
    },
    {
      title: 'Хөмсөг хими',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Сормуус хими',
      image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: '6D үстэй мэт уусгалттай хөмсөгний шивээс',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: '450,000₮-аас 250,000₮',
    }
  ]);

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

  console.log('eyes:', await r.json());
}

async function sendEyebrowCarousel(id) {
  return sendEyelashCarousel(id);
}

async function sendNailCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Маникюр',
      image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'French будалт',
      image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 45,000₮',
    },
    {
      title: 'Смарт хумс',
      image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
    {
      title: 'Педикюр',
      image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Энгийн педикюр',
      image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    }
  ]);

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

  console.log('nail:', await r.json());
}

async function sendHairTreatmentCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Хуйхны спа цэвэрлэгээ',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Хуйхны спа цэвэрлэгээ /хүүхэд/',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 50,000₮-аас',
    },
    {
      title: 'Эрчимжүүлсэн эмчилгээний тос /1 удаа/',
      image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Эрчимжүүлсэн эмчилгээний тос /курс/',
      image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 255,000₮-аас',
    },
    {
      title: 'Уураг /1 удаа/',
      image_url: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 50,000₮-аас',
    },
    {
      title: 'Уураг /курс/',
      image_url: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 250,000₮-аас',
    },
    {
      title: 'Тосон тэжээл /1 удаа/',
      image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮-аас',
    },
    {
      title: 'Тосон тэжээл /курс/',
      image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 150,000₮-аас',
    }
  ]);

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

  console.log('hair treatment:', await r.json());
}

async function sendPiercingCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Чих цоолох',
      image_url: 'https://images.unsplash.com/photo-1589987607627-09c0b5f7fd3f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 20,000₮',
    },
    {
      title: 'Хүйс цоолох',
      image_url: 'https://images.unsplash.com/photo-1596944948860-67d8f0d2f30e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 45,000₮',
    },
    {
      title: 'Хөмсөг цоолох',
      image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Хамар цоолох',
      image_url: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Хэл цоолох',
      image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: тохиролцоно',
    },
    {
      title: 'Хацар цоолох',
      image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: тохиролцоно',
    }
  ]);

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

  console.log('piercing:', await r.json());
}

async function sendRemovalCarousel(id) {
  const elements = makeGenericElements([
    {
      title: 'Үү ургацаг /1ш/',
      image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 15,000₮–85,000₮',
    },
    {
      title: 'Мэнгэ түүх /1ш/',
      image_url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮–65,000₮',
    }
  ]);

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

  console.log('removal:', await r.json());
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
          { type: 'postback', title: 'Үндсэн цэс', payload: 'MAIN_MENU' },
        ],
      },
    },
  });
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

    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    for (const entry of body.entry || []) {
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
        } else if (payload === 'CONTACT') {
          await sendContactMenu(id);
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
        } else if (payload === 'HAIRTREATMENT_SERVICE') {
          await sendHairTreatmentCarousel(id);
        } else if (payload === 'PIERCING_SERVICE') {
          await sendPiercingCarousel(id);
        } else if (payload === 'REMOVAL_SERVICE') {
          await sendRemovalCarousel(id);
        } else if (event.message && event.message.text) {
          const userText = event.message.text.trim();
          const aiReply = await askGemini(id, userText);

          if (aiReply) {
            await reply(id, aiReply);
          } else {
            await sendMainMenu(id);
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    return res.sendStatus(500);
  }
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
  if (PAGE_ID) console.log(`Page ID: ${PAGE_ID}`);
});
