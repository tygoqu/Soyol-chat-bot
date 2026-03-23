const express = require('express');
const app = express();

app.use(express.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;

app.get('/', (req, res) => {
  res.status(200).send('Bot is running');
});

app.get('/webhook', (req, res) => {
  console.log('GET /webhook query:', req.query);

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
            await reply(id, 'Манай үйлчилгээний талаар энд дарна уу 👇');
          } else if (event.postback?.payload === 'LOCATION') {
            await reply(id, 'Манай хаяг: Улаанбаатар хот 📍');
          } else if (event.postback?.payload === 'SCHEDULE') {
            await reply(id, 'Цагийн хуваарь: ...');
          } else if (event.postback?.payload === 'CONTACT') {
            await reply(id, 'Холбоо барих: 70599999, 91191215 📞');
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
  await buttons(id, name);
}

async function buttons(id, name) {
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
              text: `Сайн байна уу ${name}! Та Soyol Spa Salon-д холбогдлоо 🌸`
              buttons: [
                buttons: [
  { type: 'postback', title: 'Үйлчилгээ', payload: 'SERVICE' },
  { type: 'postback', title: 'Хаяг, байршил', payload: 'LOCATION' },
  { type: 'postback', title: 'Холбогдох', payload: 'CONTACT' }
]
              ]
            }
          }
        }
      })
    }
  );

  const data = await response.json();
  console.log('buttons response:', data);
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
