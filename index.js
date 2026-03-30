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
          else if (payload === 'STAFF') await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно.');
          else if (payload === 'BEAUTY_SERVICE') await reply(id, 'Гоо сайхны үйлчилгээ:\n• Нүүр арчилгаа\n• Арьс цэвэрлэгээ\n• Арьс чийгшүүлэх үйлчилгээ ✨');
          else if (payload === 'HAIR_SERVICE') await reply(id, 'Үсчин:\n• Үс засах\n• Үс угаах\n• Үс будах\n• Үс эмчлэх ✂️');
          else if (payload === 'EYEBROW_SERVICE') await reply(id, 'Лазер 6D шивээс:\n• Хөмсөгний шивээс 👁️');
          else if (payload === 'EYELASH_SERVICE') await reply(id, 'Сормуус:\n• Сормуус\n• Сормуусны хими 👁️');
          else if (payload === 'NAIL_SERVICE') await reply(id, 'Маникюр, Педикюр:\n• Гоёлын будалт\n• Гоёлын хумс\n• Чимэглэл\n• Педикюр 💅');
          else if (payload === 'HAIR_PRODUCT') await reply(id, 'Үс арчилгааны бүтээгдэхүүн:\n• Үс арчилгаа ✨');
          else if (event.message?.text) await reply(id, 'Та асуух зүйлээ үлдээнэ үү. Ажилтан таны асуултанд удахгүй хариу өгөх болно. ');
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
                image_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
                subtitle: 'Арьс арчилгаа, нүүрний үйлчилгээ, гоо заслын арчилгаа',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'BEAUTY_SERVICE' }]
              },
              {
                title: 'Үсчин',
                image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=1226&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
                subtitle: 'Үс засах, угаах, будах үйлчилгээ',
                buttons: [{ type: 'postback', title: 'Дэлгэрэнгүй', payload: 'HAIR_SERVICE' }]
              },
              {
                title: 'Маникюр',
                image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80',
                subtitle: 'Хумсны чимэглэл, гель, уртасгалт үйлчилгээ',
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
