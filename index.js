const express = require('express');
const app = express();

app.use(express.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY_TOKEN;

// -------------------- Basic routes --------------------
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

// -------------------- Webhook --------------------
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('POST /webhook received');
    console.log(JSON.stringify(body, null, 2));

    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          const id = event.sender?.id;
          if (!id) continue;

          const payload = event.postback?.payload;

          if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
            await sendMainMenu(id);
          } else if (payload === 'SERVICE') {
            await sendServiceCarousel(id);
          } else if (payload === 'LOCATION') {
            await sendLocationMenu(id);
          } else if (payload === 'CONTACT') {
            await sendContactMenu(id);
          } else if (payload === 'SCHEDULE') {
            await sendSchedule(id);
          } else if (payload === 'BEAUTY_SERVICE') {
            await reply(
              id,
              'Гоо сайхны үйлчилгээ:\n• Нүүр арчилгаа\n• Арьс цэвэрлэгээ\n• Арьс чийгшүүлэх үйлчилгээ ✨'
            );
          } else if (payload === 'SPA_SERVICE') {
            await reply(
              id,
              'Spa үйлчилгээ:\n• Relax spa\n• Body treatment\n• Тайвшруулах үйлчилгээ ♨️'
            );
          } else if (payload === 'MASSAGE_SERVICE') {
            await reply(
              id,
              'Массаж:\n• Бүтэн биеийн массаж\n• Хүзүү нурууны массаж\n• Алжаал тайлах массаж 💆'
            );
          } else if (event.message?.text) {
            await sendMainMenu(id);
          } else {
            console.log('Unhandled event');
          }
        }
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(404);
  } catch (error) {
    console.error('Webhook error:', error);
    return res.sendStatus(500);
  }
});

// -------------------- Message helpers --------------------
async function sendMainMenu(id) {
  let name = 'та';

  try {
    const userRes = await fetch(
      `https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`
    );
    const userData = await userRes.json();
    console.log('getName response:', userData);

    if (userData.first_name) {
      name = userData.first_name;
    }
  } catch (error) {
    console.error('Error getting user name:', error);
  }

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

  console.log('sendMainMenu response:', await response.json());
}

async function sendServiceCarousel(id) {
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
                  image_url:
                    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80',
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

  console.log('sendServiceCarousel response:', await response.json());
}

async function sendLocationMenu(id) {
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

  console.log('sendLocationMenu response:', await response.json());
}

async function sendContactMenu(id) {
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

  console.log('sendContactMenu response:', await response.json());
}

async function sendSchedule(id) {
  const text = `Цагийн хуваарь:
Monday
9:00 AM - 9:00 PM
Tuesday
9:00 AM - 9:00 PM
Wednesday
9:00 AM - 9:00 PM
Thursday
9:00 AM - 9:00 PM
Friday
9:00 AM - 9:00 PM
Saturday
10:00 AM - 9:00 PM
Sunday
10:00 AM - 9:00 PM`;

  await reply(id, text);
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

  console.log('reply response:', await response.json());
}

// -------------------- Persistent menu --------------------
async function setPersistentMenu() {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: 'Үндсэн цэс',
                payload: 'MAIN_MENU'
              },
              {
                type: 'postback',
                title: 'Цагийн хуваарь',
                payload: 'SCHEDULE'
              },
              {
                type: 'phone_number',
                title: 'Ажилтантай холбогдох',
                payload: '+97670599999'
              }
            ]
          }
        ]
      })
    }
  );

  console.log('persistent menu response:', await response.json());
}

// -------------------- Start server --------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);

  try {
    await setPersistentMenu();
  } catch (error) {
    console.error('Error setting persistent menu:', error);
  }
});            );
          } else if (payload === 'MASSAGE_SERVICE') {
            await reply(
              id,
              'Массаж:\n• Бүтэн биеийн массаж\n• Хүзүү нурууны массаж\n• Алжаал тайлах массаж 💆'
            );
          } else if (event.message?.text) {
            await sendMainMenu(id);
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

// Send main menu
async function sendMainMenu(id) {
  let name = 'та';

  try {
    const userUrl = `https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`;
    const userRes = await fetch(userUrl);
    const userData = await userRes.json();
    console.log('getName response:', userData);

    if (userData.first_name) {
      name = userData.first_name;
    }
  } catch (error) {
    console.error('Error getting name:', error);
  }

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
  console.log('sendMainMenu response:', data);
}

// Swipeable services carousel
async function sendServiceCarousel(id) {
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
                  image_url:
                    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80',
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
  console.log('sendServiceCarousel response:', data);
}

// Location with Google Maps button
async function sendLocationMenu(id) {
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
  console.log('sendLocationMenu response:', data);
}

// Contact with call buttons
async function sendContactMenu(id) {
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
  console.log('sendContactMenu response:', data);
}

// Schedule text
async function sendSchedule(id) {
  const text = `Цагийн хуваарь:
Monday
9:00 AM - 9:00 PM
Tuesday
9:00 AM - 9:00 PM
Wednesday
9:00 AM - 9:00 PM
Thursday
9:00 AM - 9:00 PM
Friday
9:00 AM - 9:00 PM
Saturday
10:00 AM - 9:00 PM
Sunday
10:00 AM - 9:00 PM`;

  await reply(id, text);
}

// Plain text reply
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

// Persistent menu
async function setPersistentMenu() {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: 'Үндсэн цэс',
                payload: 'MAIN_MENU'
              },
              {
                type: 'postback',
                title: 'Цагийн хуваарь',
                payload: 'SCHEDULE'
              },
              {
                type: 'phone_number',
                title: 'Ажилтантай холбогдох',
                payload: '+97670599999'
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();
  console.log('persistent menu response:', data);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);

  try {
    await setPersistentMenu();
  } catch (error) {
    console.error('Error setting persistent menu:', error);
  }
});          } else if (payload === 'MASSAGE_SERVICE') {
            await reply(
              id,
              'Массаж:\n• Бүтэн биеийн массаж\n• Хүзүү нурууны массаж\n• Алжаал тайлах массаж 💆'
            );
          } else if (event.message?.text) {
            await sendMainMenu(id);
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

// ---------- Messenger actions ----------
async function sendMainMenu(id) {
  let name = 'та';

  try {
    const userUrl = `https://graph.facebook.com/${id}?fields=first_name&access_token=${TOKEN}`;
    const userRes = await fetch(userUrl);
    const userData = await userRes.json();
    console.log('getName response:', userData);

    if (userData.first_name) {
      name = userData.first_name;
    }
  } catch (error) {
    console.error('Error getting name:', error);
  }

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
  console.log('sendMainMenu response:', data);
}

async function sendServiceCarousel(id) {
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
                  image_url:
                    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
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
                  image_url:
                    'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80',
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
  console.log('sendServiceCarousel response:', data);
}

async function sendLocationMenu(id) {
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
  console.log('sendLocationMenu response:', data);
}

async function sendContactMenu(id) {
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
  console.log('sendContactMenu response:', data);
}

async function sendSchedule(id) {
  const text = `Цагийн хуваарь:
Monday
9:00 AM - 9:00 PM
Tuesday
9:00 AM - 9:00 PM
Wednesday
9:00 AM - 9:00 PM
Thursday
9:00 AM - 9:00 PM
Friday
9:00 AM - 9:00 PM
Saturday
10:00 AM - 9:00 PM
Sunday
10:00 AM - 9:00 PM`;

  await reply(id, text);
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

// ---------- Persistent menu ----------
async function setPersistentMenu() {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: 'Үндсэн цэс',
                payload: 'MAIN_MENU'
              },
              {
                type: 'postback',
                title: 'Цагийн хуваарь',
                payload: 'SCHEDULE'
              },
              {
                type: 'phone_number',
                title: 'Ажилтантай холбогдох',
                payload: '+97670599999'
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();
  console.log('persistent menu response:', data);
}

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);

  try {
    await setPersistentMenu();
  } catch (error) {
    console.error('Error setting persistent menu:', error);
  }
});    }

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

async function scheduleMenu(id) {
  const text = `Цагийн хуваарь:
Monday
9:00 AM - 9:00 PM
Tuesday
9:00 AM - 9:00 PM
Wednesday
9:00 AM - 9:00 PM
Thursday
9:00 AM - 9:00 PM
Friday
9:00 AM - 9:00 PM
Saturday
10:00 AM - 9:00 PM
Sunday
10:00 AM - 9:00 PM`;

  await reply(id, text);
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

async function setPersistentMenu() {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: 'Үндсэн цэс',
                payload: 'MAIN_MENU'
              },
              {
                type: 'postback',
                title: 'Цагийн хуваарь',
                payload: 'SCHEDULE'
              },
              {
                type: 'phone_number',
                title: 'Ажилтантай холбогдох',
                payload: '+97670599999'
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();
  console.log('persistent menu response:', data);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);

  try {
    await setPersistentMenu();
  } catch (error) {
    console.error('Error setting persistent menu:', error);
  }
});
