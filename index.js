const express = require('express');
const app = express();
app.use(express.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;

app.get('/', (req, res) => res.send('Bot is running'));

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('Received:', JSON.stringify(body, null, 2));

    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

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
          else if (payload === 'STAFF') {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          }
          else if (event.message?.text) {
            await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
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
            text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸`,
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
              {
                title: 'Гоо сайхны үйлчилгээ',
                image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                subtitle: 'Арьс арчилгаа, нүүрний үйлчилгээ, гоо заслын арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }]
              },
              {
                title: 'Үсчин',
                image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                subtitle: 'Үс тайралт, будалт, хими, эмчилгээ',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }]
              },
              {
                title: 'Маникюр',
                image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80',
                subtitle: 'Хумсны чимэглэл, гель, гоёлын будалт',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_SERVICE' }]
              },
              {
                title: 'Сормуус',
                image_url: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                subtitle: 'Сормуус, Сормуусны хими',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_SERVICE' }]
              },
              {
                title: 'Лазер 6D шивээс',
                image_url: 'https://scontent.fuln6-3.fna.fbcdn.net/v/t39.30808-6/480326600_1021864419970432_6850776916430674181_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=7b2446&_nc_ohc=04eU9mz4ad4Q7kNvwH44SQX&_nc_oc=AdqZj6Gffrm7v48uTr6ikkbV5iY5DCUwvjtJUn46QMDy4Tfh3XTzxyWnk82OAkaPh-I&_nc_zt=23&_nc_ht=scontent.fuln6-3.fna&_nc_gid=2U42kHJeniYjDC0QrFfBfg&_nc_ss=7a3a8&oh=00_Afwgl0lfgfmdRkaHoT9L_Vcbcfd8vGV43JvsBcK8TfQLcg&oe=69CFDA57',
                subtitle: 'Хөмсөгний шивээс',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYEBROW_SERVICE' }]
              },
              {
                title: 'Үс арчилгааны бүтээгдэхүүн',
                image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                subtitle: 'Үс арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_PRODUCT' }]
              }
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
              {
                title: 'Энгийн массаж',
                image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop',
                subtitle: '3 шатлалт цэвэрлэгээ, арьс чангалах массаж, энгийн маск. Үнэ: 65,000₮',
                buttons: [
                  { type: 'phone_number', title: '70599999', payload: '+97670599999' },
                  { type: 'phone_number', title: '91191215', payload: '+97691191215' }
                ]
              },
              {
                title: 'Гуаша массаж',
                image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Гүн цэвэрлэгээ, хар батга цэвэрлэх',
                buttons: [
                  { type: 'phone_number', title: '70599999', payload: '+97670599999' },
                  { type: 'phone_number', title: '91191215', payload: '+97691191215' }
                ]
              },
              {
                title: 'Арьс чийгшүүлэх',
                image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Хуурай арьсны чийгшүүлэх үйлчилгээ',
                buttons: [
                  { type: 'phone_number', title: '70599999', payload: '+97670599999' },
                  { type: 'phone_number', title: '91191215', payload: '+97691191215' }
                ]
              }
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
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: 'Үс засах',
                image_url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Эмэгтэй, эрэгтэй үс тайралт',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_CUT_DETAIL' }]
              },
              {
                title: 'Үс угаах',
                image_url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Үс угаалт, хуйх арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_WASH_DETAIL' }]
              },
              {
                title: 'Үс будах',
                image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Будаг, өнгө сэргээх үйлчилгээ',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_COLOR_DETAIL' }]
              },
              {
                title: 'Үс эмчлэх',
                image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Гэмтэлтэй үсний арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_TREATMENT_DETAIL' }]
              }
            ]
          }
        }
      }
    })
  });
  console.log('hair carousel:', await r.json());
}

async function sendNailCarousel(id) {
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
              {
                title: 'Гоёлын будалт',
                image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80',
                subtitle: 'Хумсны будалт, дизайн',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_ART_DETAIL' }]
              },
              {
                title: 'Гоёлын хумс',
                image_url: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Уртасгалт, гель хумс',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_EXTENSION_DETAIL' }]
              },
              {
                title: 'Чимэглэл',
                image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Чулуу, шигтгээ, special design',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'NAIL_DECOR_DETAIL' }]
              },
              {
                title: 'Педикюр',
                image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop',
                subtitle: 'Хөлийн хумс арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'PEDICURE_DETAIL' }]
              }
            ]
          }
        }
      }
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
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: 'Сормуус',
                image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80',
                subtitle: 'Сормуус суулгах, Сормуус салгах',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'EYELASH_DETAIL' }]
              }
            ]
          }
        }
      }
    })
  });
  console.log('eyelash carousel:', await r.json());
}

async function sendLocationMenu(id) {
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
            text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍',
            buttons: [
              { type: 'web_url', title: 'Google Maps', url: 'https://maps.app.goo.gl/nM6smG6Wb6iDYkzT6' }
            ]
          }
        }
      }
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
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Холбоо барих дугаараа сонгоно уу 📞',
            buttons: [
              { type: 'phone_number', title: '70599999', payload: '+97670599999' },
              { type: 'phone_number', title: '91191215', payload: '+97691191215' }
            ]
          }
        }
      }
    })
  });
  console.log('contact:', await r.json());
}

async function sendSchedule(id) {
  await reply(id, 'Цагийн хуваарь:\nДаваа - Баасан: 9:00 - 21:00\nБямба - Ням: 10:00 - 21:00 🕘');
}

async function reply(id, text) {
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id }, message: { text } })
  });
  console.log('reply:', await r.json());
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);
  await setPersistentMenu();
});
