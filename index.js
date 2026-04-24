const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TOKEN = process.env.TOKEN || '';
const VERIFY = process.env.VERIFY_TOKEN || '';
const PAGE_ID = process.env.PAGE_ID || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'soyol2024';

const SHEET_ID =
  process.env.SHEET_ID || '1-Dqv0Jj9BCKMZc2RXaT6VC0_xwiAmz9gje3vpMKf2Yo';
const SUBSCRIBERS_SHEET = process.env.SUBSCRIBERS_SHEET || 'Sheet1';
const BOOKINGS_SHEET = process.env.BOOKINGS_SHEET || 'Sheet2';
const CREDENTIALS_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || '/etc/secrets/credentials.json';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = GEMINI_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  : '';

const BOOKING_URL =
  process.env.BOOKING_URL || 'https://soyol-chat-bot.onrender.com/booking';
const BASE_URL =
  process.env.BASE_URL || BOOKING_URL.replace(/\/booking\/?$/, '');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const mailer =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

const conversations = new Map();
let subscribers = new Set();

const SYSTEM_PROMPT = `Та Soyol Spa Salon-ын AI туслах юм. Зөвхөн Монгол хэлээр хариулна. Хариулт богино, ойлгомжтой, 2-4 өгүүлбэртэй байна. Emoji бүү ашигла.

Салоны тухай асуултад зөвхөн доорх мэдээлэлд тулгуурлан хариул.
Хэрэв хэрэглэгч цаг захиалахыг хүсвэл энэ холбоосыг өг: ${BOOKING_URL}
Хэрэв хэрэглэгч захиалга цуцлахыг хүсвэл энэ холбоосыг өг: ${BASE_URL}/cancel
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
- Энгийн массаж: үнэ лавлана уу
- Гуаша массаж: үнэ лавлана уу
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

ҮСНИЙ ЭМЧИЛГЭЭ:
- Хуйхны спа цэвэрлэгээ: 65,000-85,000₮
- Хуйхны спа цэвэрлэгээ /хүүхэд/: 50,000-65,000₮
- Эрчимжүүлсэн эмчилгээний тос /1 удаа/: 65,000-120,000₮
- Эрчимжүүлсэн эмчилгээний тос /курс/: 255,000-450,000₮
- Уураг /1 удаа/: 50,000-85,000₮
- Уураг /курс/: 250,000-500,000₮
- Тосон тэжээл /1 удаа/: 35,000-60,000₮
- Тосон тэжээл /курс/: 150,000-300,000₮`;

const SERVICE_MENU = [
  {
    title: 'Гоо сайхны үйлчилгээ',
    image_url:
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Нүүр арчилгаа, цэвэрлэгээ, массаж',
    payload: 'BEAUTY_SERVICE',
  },
  {
    title: 'Үсчин',
    image_url:
      'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Үс засалт, тайралт, хими, будаг',
    payload: 'HAIR_SERVICE',
  },
  {
    title: 'Маникюр, педикюр',
    image_url:
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Маникюр, педикюр, хумсны үйлчилгээ',
    payload: 'NAIL_SERVICE',
  },
  {
    title: 'Сормуус, хөмсөг',
    image_url:
      'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Сормуус, хөмсөг, 6D шивээс',
    payload: 'EYELASH_SERVICE',
  },
  {
    title: 'Чих цоолох, персинг',
    image_url:
      'https://images.unsplash.com/photo-1596944948860-67d8f0d2f30e?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Чих, хамар, хүйс болон бусад',
    payload: 'PIERCING_SERVICE',
  },
  {
    title: 'Мэнгэ, үү, ургацаг авах',
    image_url:
      'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Мэнгэ түүх, үү ургацаг авах',
    payload: 'REMOVAL_SERVICE',
  },
  {
    title: 'Үсний эмчилгээ',
    image_url:
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
    subtitle: 'Хуйхны спа, уураг, тосон тэжээл',
    payload: 'HAIRTREATMENT_SERVICE',
  },
];

const DETAIL_CAROUSELS = {
  BEAUTY_SERVICE: [
    {
      title: 'Miracle CO2',
      image_url:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Carbon peel',
      image_url:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Green peel',
      image_url:
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 350,000₮-аас',
    },
    {
      title: 'Батга цэвэрлэгээ',
      image_url:
        'https://images.unsplash.com/photo-1552693673-1bf958298935?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮-аас',
    },
    {
      title: 'Carboxy',
      image_url:
        'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Энгийн массаж',
      image_url:
        'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      subtitle: 'Үнэ: лавлана уу',
    },
    {
      title: 'Гуаша массаж',
      image_url:
        'https://assets.clevelandclinic.org/transform/LargeFeatureImage/b9bd499d-f631-42c3-87c6-4ba1bd3ef9f3/guasha-2177381155',
      subtitle: 'Үнэ: лавлана уу',
    },
    {
      title: 'Үү ургацаг /1ш/',
      image_url:
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 15,000₮-аас',
    },
    {
      title: 'Мэнгэ түүх /1ш/',
      image_url:
        'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮-аас',
    },
  ],

  HAIR_SERVICE: [
    {
      title: 'Эрэгтэй үс засалт',
      image_url:
        'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 25,000₮',
    },
    {
      title: 'Эмэгтэй тайралт',
      image_url:
        'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000-40,000₮',
    },
    {
      title: 'Эмэгтэй үс засалт',
      image_url:
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Шулуун хими',
      image_url:
        'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮-аас',
    },
    {
      title: 'Тосон буржгар хими',
      image_url:
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Ботокс',
      image_url:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 80,000₮-аас',
    },
    {
      title: 'Кератин',
      image_url:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 120,000₮-аас',
    },
    {
      title: 'Өнгө гаргаж будах',
      image_url:
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: '20–40% хямдрал',
    },
  ],

  EYELASH_SERVICE: [
    {
      title: 'Сормуус',
      image_url:
        'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
    {
      title: 'Хөмсөг засах',
      image_url:
        'https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 10,000₮',
    },
    {
      title: 'Хөмсөг хими',
      image_url:
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Сормуус хими',
      image_url:
        'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: '6D үстэй мэт уусгалттай хөмсөгний шивээс',
      image_url:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: '450,000₮-аас 250,000₮',
    },
  ],

  NAIL_SERVICE: [
    {
      title: 'Маникюр',
      image_url:
        'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'French будалт',
      image_url:
        'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 45,000₮',
    },
    {
      title: 'Смарт хумс',
      image_url:
        'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
    {
      title: 'Педикюр',
      image_url:
        'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 85,000₮',
    },
    {
      title: 'Энгийн педикюр',
      image_url:
        'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮',
    },
  ],

  HAIRTREATMENT_SERVICE: [
    {
      title: 'Хуйхны спа цэвэрлэгээ',
      image_url:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Хуйхны спа цэвэрлэгээ /хүүхэд/',
      image_url:
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 50,000₮-аас',
    },
    {
      title: 'Эрчимжүүлсэн эмчилгээний тос /1 удаа/',
      image_url:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 65,000₮-аас',
    },
    {
      title: 'Эрчимжүүлсэн эмчилгээний тос /курс/',
      image_url:
        'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 255,000₮-аас',
    },
    {
      title: 'Уураг /1 удаа/',
      image_url:
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 50,000₮-аас',
    },
    {
      title: 'Уураг /курс/',
      image_url:
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 250,000₮-аас',
    },
    {
      title: 'Тосон тэжээл /1 удаа/',
      image_url:
        'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮-аас',
    },
    {
      title: 'Тосон тэжээл /курс/',
      image_url:
        'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 150,000₮-аас',
    },
  ],

  PIERCING_SERVICE: [
    {
      title: 'Чих цоолох',
      image_url:
        'https://images.unsplash.com/photo-1589987607627-09c0b5f7fd3f?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 20,000₮',
    },
    {
      title: 'Хүйс цоолох',
      image_url:
        'https://images.unsplash.com/photo-1596944948860-67d8f0d2f30e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 45,000₮',
    },
    {
      title: 'Хөмсөг цоолох',
      image_url:
        'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Хамар цоолох',
      image_url:
        'https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮',
    },
    {
      title: 'Хэл цоолох',
      image_url:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: тохиролцоно',
    },
    {
      title: 'Хацар цоолох',
      image_url:
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: тохиролцоно',
    },
  ],

  REMOVAL_SERVICE: [
    {
      title: 'Үү ургацаг /1ш/',
      image_url:
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 15,000₮–85,000₮',
    },
    {
      title: 'Мэнгэ түүх /1ш/',
      image_url:
        'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1200&auto=format&fit=crop',
      subtitle: 'Үнэ: 35,000₮–65,000₮',
    },
  ],
};

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
      .map((s) => s.properties?.title)
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

async function ensureSubscriberHeaders() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SUBSCRIBERS_SHEET}!A1:B1`,
  });

  const row = res.data.values?.[0] || [];
  if (row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SUBSCRIBERS_SHEET}!A1:B1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['subscriber_id', 'date_added']],
      },
    });
  }
}

async function ensureBookingSheetStructure() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:M`,
  });

  const rows = res.data.values || [];
  const desiredHeaders = [
    'booking_id',
    'created_at',
    'customer_name',
    'phone',
    'email',
    'category_name',
    'service_name',
    'date',
    'time',
    'note',
    'status',
    'service_duration',
    'service_price',
  ];

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${BOOKINGS_SHEET}!A1:M1`,
      valueInputOption: 'RAW',
      requestBody: { values: [desiredHeaders] },
    });
    return;
  }

  const header = rows[0];
  const isNew = header[4] === 'email';
  const isOld = header[0] === 'booking_id' && header[4] === 'category_name';

  if (isNew) return;

  if (isOld) {
    const migrated = rows.map((row, idx) => {
      if (idx === 0) return desiredHeaders;

      return [
        row[0] || '',
        row[1] || '',
        row[2] || '',
        row[3] || '',
        '',
        row[4] || '',
        row[5] || '',
        row[6] || '',
        row[7] || '',
        row[8] || '',
        row[9] || '',
        row[10] || '',
        row[11] || '',
      ];
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${BOOKINGS_SHEET}!A:M`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${BOOKINGS_SHEET}!A1:M${migrated.length}`,
      valueInputOption: 'RAW',
      requestBody: { values: migrated },
    });
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A1:M1`,
    valueInputOption: 'RAW',
    requestBody: { values: [desiredHeaders] },
  });
}

async function initializeSheets() {
  await ensureSheetExists(SUBSCRIBERS_SHEET);
  await ensureSheetExists(BOOKINGS_SHEET);
  await ensureSubscriberHeaders();
  await ensureBookingSheetStructure();
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
    console.error('Failed to load subscribers:', e.message);
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
    console.error('Failed to add subscriber:', e.message);
  }
}

async function getAllBookings() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:M`,
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
      email: row[4] || '',
      categoryName: row[5] || '',
      serviceName: row[6] || '',
      date: row[7] || '',
      time: row[8] || '',
      note: row[9] || '',
      status: row[10] || '',
      serviceDuration: row[11] || '',
      servicePrice: row[12] || '',
    }));
}

async function getUnavailableTimes(date) {
  const bookings = await getAllBookings();
  return bookings
    .filter((b) => b.date === date)
    .filter((b) => String(b.status || '').toLowerCase() !== 'cancelled')
    .map((b) => b.time)
    .filter(Boolean);
}

async function addBooking(payload) {
  const sheets = getSheets();
  const bookingId = 'BK-' + Date.now().toString(36).toUpperCase();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:M`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        bookingId,
        new Date().toISOString(),
        payload.customerName,
        payload.phone,
        payload.email || '',
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

async function cancelBookingById(bookingId, verifier) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!A:M`,
  });

  const rows = res.data.values || [];
  let rowIndex = -1;
  let email = '';
  let customerName = '';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowBookingId = (row[0] || '').trim();
    const rowPhone = (row[3] || '').trim();
    const rowEmail = (row[4] || '').trim().toLowerCase();
    const rowStatus = (row[10] || '').trim().toLowerCase();

    if (
      rowBookingId === bookingId &&
      (rowPhone === verifier || rowEmail === String(verifier).trim().toLowerCase())
    ) {
      rowIndex = i + 1;
      email = row[4] || '';
      customerName = row[2] || '';
      if (rowStatus === 'cancelled') {
        return { alreadyCancelled: true };
      }
      break;
    }
  }

  if (rowIndex === -1) return { notFound: true };

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${BOOKINGS_SHEET}!K${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['cancelled']],
    },
  });

  return { ok: true, email, customerName };
}

async function sendBookingConfirmationEmail(booking) {
  if (!mailer || !booking.email) {
    return { ok: false, reason: 'mailer_not_configured' };
  }

  try {
    const cancelUrl = `${BASE_URL}/cancel?bookingId=${encodeURIComponent(booking.bookingId)}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2 style="margin-bottom:8px;">Soyol Spa Salon</h2>
        <p>Таны захиалга амжилттай бүртгэгдлээ.</p>

        <table style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="padding:6px 12px 6px 0;"><strong>Booking ID:</strong></td><td>${booking.bookingId}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Нэр:</strong></td><td>${booking.customerName}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Үйлчилгээ:</strong></td><td>${booking.serviceName}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Ангилал:</strong></td><td>${booking.categoryName}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Огноо:</strong></td><td>${booking.date}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Цаг:</strong></td><td>${booking.time}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;"><strong>Үнэ:</strong></td><td>${booking.servicePrice || '-'}</td></tr>
        </table>

        <p style="margin-top:18px;">Захиалгаа цуцлах бол доорх холбоосыг ашиглана уу:</p>

        <p>
          <a href="${cancelUrl}" style="display:inline-block;padding:10px 16px;background:#7b2d8b;color:#fff;text-decoration:none;border-radius:8px;">
            Захиалга цуцлах
          </a>
        </p>

        <p style="margin-top:18px;">Холбоо барих: 7059-9999, 9119-1215</p>
      </div>
    `;

    await mailer.sendMail({
      from: SMTP_FROM,
      to: booking.email,
      subject: `Soyol Spa Salon - Захиалга баталгаажлаа (${booking.bookingId})`,
      html,
    });

    return { ok: true };
  } catch (e) {
    console.error('Confirmation email failed:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendCancellationEmail({ email, bookingId, customerName }) {
  if (!mailer || !email) {
    return { ok: false, reason: 'mailer_not_configured' };
  }

  try {
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2 style="margin-bottom:8px;">Soyol Spa Salon</h2>
        <p>${customerName || 'Хэрэглэгч'} таны захиалга цуцлагдлаа.</p>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p>Хэрэв алдаа гарсан бол 7059-9999, 9119-1215 дугаараар холбогдоно уу.</p>
      </div>
    `;

    await mailer.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: `Soyol Spa Salon - Захиалга цуцлагдлаа (${bookingId})`,
      html,
    });

    return { ok: true };
  } catch (e) {
    console.error('Cancellation email failed:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function verifyMailer() {
  if (!mailer) {
    console.log('SMTP is not configured. Confirmation emails are disabled.');
    return;
  }

  try {
    await mailer.verify();
    console.log('SMTP ready');
  } catch (e) {
    console.error('SMTP verify failed:', e.message);
  }
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

async function sendMainMenu(id) {
  let name = 'та';

  try {
    const r = await fetch(
      `https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`
    );
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

async function sendServiceCarousel(id) {
  const elements = SERVICE_MENU.map((item) => ({
    title: item.title,
    image_url: item.image_url,
    subtitle: item.subtitle,
    buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: item.payload }],
  }));

  return sendMessage(id, {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements,
      },
    },
  });
}

async function sendGenericBookingCarousel(id, items) {
  const elements = items.map((item) => ({
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

  return sendMessage(id, {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements,
      },
    },
  });
}

async function setupMessengerProfile() {
  if (!TOKEN) {
    console.log('Messenger profile setup skipped: TOKEN missing');
    return;
  }

  const url = `https://graph.facebook.com/v25.0/me/messenger_profile?access_token=${TOKEN}`;

  // Step 1: Delete existing profile fields to force a fresh registration
  try {
    const delRes = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: ['get_started', 'persistent_menu'] }),
    });
    const delData = await delRes.json();
    console.log('Messenger profile DELETE:', JSON.stringify(delData));
  } catch (e) {
    console.error('Messenger profile DELETE failed:', e.message);
  }

  // Step 2: Re-set get_started and persistent_menu
  try {
    const body = {
      get_started: {
        payload: 'GET_STARTED',
      },
      persistent_menu: [
        {
          locale: 'default',
          composer_input_disabled: false,
          call_to_actions: [
            {
              type: 'postback',
              title: 'Үйлчилгээ',
              payload: 'SERVICE',
            },
            {
              type: 'web_url',
              title: 'Цаг захиалах',
              url: BOOKING_URL,
              webview_height_ratio: 'full',
            },
            {
              type: 'postback',
              title: 'Холбоо барих',
              payload: 'CONTACT',
            },
          ],
        },
      ],
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    console.log('Messenger profile POST:', JSON.stringify(data));

    if (data.result === 'success') {
      console.log('✅ Persistent menu & Get Started button registered successfully.');
    } else {
      console.error('❌ Messenger profile setup returned unexpected result:', JSON.stringify(data));
    }
  } catch (e) {
    console.error('Messenger profile POST failed:', e.message);
  }
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
    if (body.object !== 'page') return res.sendStatus(404);

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const id = event.sender?.id;
        if (!id) continue;

        if (!subscribers.has(id)) {
          subscribers.add(id);
          await addSubscriber(id);
          console.log(`New subscriber: ${id} | Total: ${subscribers.size}`);
        }

        const payload = event.postback?.payload;

        if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
          await sendMainMenu(id);
        } else if (payload === 'SERVICE') {
          await sendServiceCarousel(id);
        } else if (payload === 'CONTACT') {
          await sendContactMenu(id);
        } else if (DETAIL_CAROUSELS[payload]) {
          await sendGenericBookingCarousel(id, DETAIL_CAROUSELS[payload]);
        } else if (event.message?.text) {
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
      email: String(req.body.email || '').trim(),
      note: String(req.body.note || '').trim(),
    };

    if (
      !payload.categoryName ||
      !payload.serviceName ||
      !payload.date ||
      !payload.time ||
      !payload.customerName ||
      !payload.phone ||
      !payload.email
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return res.status(400).json({ error: 'И-мэйл буруу байна.' });
    }

    const unavailable = await getUnavailableTimes(payload.date);
    if (unavailable.includes(payload.time)) {
      return res.status(409).json({
        error: 'Энэ цаг аль хэдийн захиалагдсан байна. Өөр цаг сонгоно уу.',
        code: 'SLOT_TAKEN',
      });
    }

    const bookingId = await addBooking(payload);

    let emailSent = false;
    let warning = '';

    try {
      const emailResult = await sendBookingConfirmationEmail({
        bookingId,
        customerName: payload.customerName,
        email: payload.email,
        phone: payload.phone,
        categoryName: payload.categoryName,
        serviceName: payload.serviceName,
        date: payload.date,
        time: payload.time,
        servicePrice: payload.servicePrice,
      });

      emailSent = !!emailResult?.ok;
      if (!emailSent) {
        warning = 'Захиалга хадгалагдсан боловч баталгаажуулах и-мэйл илгээгдсэнгүй.';
      }
    } catch (mailErr) {
      console.error('Booking email failed:', mailErr.message);
      warning = 'Захиалга хадгалагдсан боловч баталгаажуулах и-мэйл илгээгдсэнгүй.';
    }

    return res.json({
      ok: true,
      bookingId,
      emailSent,
      warning,
    });
  } catch (e) {
    console.error('Failed to save booking:', e.message);
    return res.status(500).json({ error: 'Failed to save booking' });
  }
});

app.get('/cancel', (req, res) => {
  const bookingId = String(req.query.bookingId || '').trim();

  res.send(`<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Захиалга цуцлах</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f7f3f8;
      color: #241b2f;
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: #fff;
      border: 1px solid #eadff0;
      border-radius: 18px;
      padding: 26px;
      box-shadow: 0 18px 48px rgba(79,32,104,0.10);
    }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { color: #6f6480; line-height: 1.6; }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 700;
    }
    input, button {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      font: inherit;
      box-sizing: border-box;
    }
    input {
      border: 1px solid #d9cbe4;
    }
    button {
      margin-top: 16px;
      border: 0;
      background: #7b2d8b;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .result {
      margin-top: 14px;
      font-size: 14px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Захиалга цуцлах</h1>
    <p>Booking ID болон утас эсвэл и-мэйлээ оруулж цуцална уу.</p>

    <label>Booking ID</label>
    <input id="bookingId" value="${bookingId}" />

    <label>Утас эсвэл И-мэйл</label>
    <input id="verifier" placeholder="Утас эсвэл и-мэйл" />

    <button onclick="cancelBooking()">Цуцлах</button>
    <div class="result" id="result"></div>
  </div>

  <script>
    async function cancelBooking() {
      const bookingId = document.getElementById('bookingId').value.trim();
      const verifier = document.getElementById('verifier').value.trim();
      const result = document.getElementById('result');
      result.textContent = '';

      const r = await fetch('/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, verifier })
      });

      const data = await r.json();
      result.textContent = data.message || 'Алдаа гарлаа.';
      result.style.color = r.ok ? '#23956f' : '#d64545';
    }
  </script>
</body>
</html>`);
});

app.post('/cancel-booking', async (req, res) => {
  try {
    const bookingId = String(req.body.bookingId || '').trim();
    const verifier = String(req.body.verifier || '').trim();

    if (!bookingId || !verifier) {
      return res.status(400).json({
        message: 'Booking ID болон утас эсвэл и-мэйл шаардлагатай.',
      });
    }

    const result = await cancelBookingById(bookingId, verifier);

    if (result.notFound) {
      return res.status(404).json({ message: 'Захиалга олдсонгүй.' });
    }

    if (result.alreadyCancelled) {
      return res.status(200).json({
        message: 'Энэ захиалга өмнө нь цуцлагдсан байна.',
      });
    }

    const emailResult = await sendCancellationEmail({
      email: result.email,
      bookingId,
      customerName: result.customerName,
    });

    return res.json({
      message: emailResult.ok
        ? 'Захиалга амжилттай цуцлагдлаа.'
        : 'Захиалга амжилттай цуцлагдлаа. Гэхдээ цуцлалтын и-мэйл илгээгдсэнгүй.',
    });
  } catch (e) {
    console.error('Cancel booking error:', e.message);
    return res.status(500).json({ message: 'Цуцлах үед алдаа гарлаа.' });
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

// Manual trigger: visit /setup?secret=YOUR_ADMIN_SECRET to re-register the menu
app.get('/setup', async (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await setupMessengerProfile();
  res.json({ ok: true, message: 'Setup triggered — check Render logs for result.' });
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

  await verifyMailer();
  await setupMessengerProfile();

  console.log(`Server running on port ${PORT}`);
  if (PAGE_ID) console.log(`Page ID: ${PAGE_ID}`);
});
