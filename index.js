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
            await serviceMenu(id);
          } else if (event.postback?.payload === 'LOCATION') {
            await locationMenu(id);
          } else if (event.postback?.payload === 'CONTACT') {
            await reply(id, 'Холбоо барих: 70599999, 91191215 📞');
          } else if (event.postback?.payload === 'BEAUTY_SERVICE') {
            await reply(id, 'Гоо сайхны үйлчилгээний мэдээлэл удахгүй нэмэгдэнэ ✨');
          } else if (event.postback?.payload === 'BLANK_1') {
            await reply(id, 'Энд дараагийн үйлчилгээний мэдээлэл орно.');
          } else if (event.postback?.payload === 'BLANK_2') {
            await reply(id, 'Энд гурав дахь үйлчилгээний мэдээлэл орно.');
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

async function serviceMenu(id) {
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
              text: 'Үйлчилгээний төрлөө сонгоно уу 💆',
              buttons: [
                {
                  type: 'postback',
                  title: 'Гоо сайхны үйлчилгээ',
                  payload: 'BEAUTY_SERVICE'
                },
                {
                  type: 'postback',
                  title: 'Blank 1',
                  payload: 'BLANK_1'
                },
                {
                  type: 'postback',
                  title: 'Blank 2',
                  payload: 'BLANK_2'
                }
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('serviceMenu response:', data);
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
