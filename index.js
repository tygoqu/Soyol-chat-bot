const express = require('express');
const app = express();

app.use(express.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;

app.get('/', (req, res) => {
  res.status(200).send('Bot is running');
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY) {
    console.log('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.log('Webhook verification failed');
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  console.log('POST /webhook received');
  console.log(JSON.stringify(req.body, null, 2));

  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        console.log('EVENT:', JSON.stringify(event, null, 2));

        const id = event.sender?.id;
        if (!id) continue;

        try {
          if (event.postback?.payload === 'GET_STARTED') {
            await getName(id);
          } else if (event.postback?.payload === 'SERVICE') {
            await serviceCarousel(id);
          } else if (event.postback?.payload === 'LOCATION') {
            await locationMenu(id);
          } else if (event.postback?.payload === 'CONTACT') {
            await contactMenu(id);
          } else if (event.postback?.payload === 'BEAUTY_SERVICE') {
            await reply(id, 'Гоо сайхны үйлчилгээний мэдээлэл удахгүй нэмэгдэнэ ✨');
          } else if (event.postback?.payload === 'SPA_SERVICE') {
            await reply(id, 'Spa үйлчилгээний мэдээлэл удахгүй нэмэгдэнэ ♨️');
          } else if (event.postback?.payload === 'MASSAGE_SERVICE') {
            await reply(id, 'Массажны үйлчилгээний мэдээлэл удахгүй нэмэгдэнэ 💆');
          } else if (event.message?.text) {
            await getName(id);
          } else {
            console.log('Unhandled event type');
          }
        } catch (error) {
          console.error('Error handling event:', error);
        }
      }
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(404);
});

async function getName(id) {
  const url = `https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`;
  const r = await fetch(url);
  const p = await r.json();

  console.log('getName response:', p);

  const name = p.first_name || 'та';
  await mainMenu(id, name);
}

async function mainMenu(id, name) {
  const response = await fetch(
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
              text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸`,
              buttons: [
                { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
                { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
                { type: 'postback', title: 'Холбогдох', payload: 'CONTACT' }
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('mainMenu response:', data);
}

async function serviceCarousel(id) {
  const response = await fetch(
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
                  image_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
                  subtitle: 'Арьс арчилгаа, нүүрний үйлчилгээ, гоо заслын арчилгаа',
                  buttons: [
                    {
                      type: 'postback',
                      title: 'Дэлгэрэнгүй',
                      payload: 'BEAUTY_SERVICE'
                    }
                  ]
                },
                {
                  title: 'Spa үйлчилгээ',
                  image_url: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
                  subtitle: 'Тайвшруулах болон бие сэргээх үйлчилгээ',
                  buttons: [
                    {
                      type: 'postback',
                      title: 'Дэлгэрэнгүй',
                      payload: 'SPA_SERVICE'
                    }
                  ]
                },
                {
                  title: 'Массаж',
                  image_url: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80',
                  subtitle: 'Биеийн алжаал тайлах массажны үйлчилгээ',
                  buttons: [
                    {
                      type: 'postback',
                      title: 'Дэлгэрэнгүй',
                      payload: 'MASSAGE_SERVICE'
                    }
                  ]
                }
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('serviceCarousel response:', data);
}

async function locationMenu(id) {
  const response = await fetch(
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
              text: 'Манай хаяг: 3, 4-р хороолол Ачлал их дэлгүүрийн замын эсрэг талд Soyol Spa Salon 📍',
              buttons: [
                {
                  type: 'web_url',
                  title: 'Google Maps',
                  url: 'https://maps.google.com/?q=Soyol+Spa+Salon'
                }
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('locationMenu response:', data);
}

async function contactMenu(id) {
  const response = await fetch(
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
              text: 'Холбоо барих дугаараа сонгоно уу 📞',
              buttons: [
                {
                  type: 'phone_number',
                  title: '70599999',
                  payload: '+97670599999'
                },
                {
                  type: 'phone_number',
                  title: '91191215',
                  payload: '+97691191215'
                }
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('contactMenu response:', data);
}

async function reply(id, text) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id },
        message: { text }
      })
    }
  );

  const data = await response.json();
  console.log('reply response:', data);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
