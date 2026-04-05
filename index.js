const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN; // Page Access Token
const VERIFY = process.env.VERIFY_TOKEN; // Webhook verify token

if (!TOKEN || !VERIFY) {
  console.error("Missing TOKEN or VERIFY_TOKEN in environment variables.");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send("Bot is running");
});

/**
 * Webhook verification
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * Messenger webhook
 */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("Received webhook:", JSON.stringify(body, null, 2));

    if (body.object !== "page") {
      return res.sendStatus(404);
    }

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        if (event.postback?.payload) {
          await handlePostback(senderId, event.postback.payload);
          continue;
        }

        if (event.message?.text) {
          await handleMessage(senderId, event.message.text);
          continue;
        }

        if (event.message?.attachments) {
          await reply(
            senderId,
            "Зурвасаа текстээр үлдээнэ үү. Манай ажилтан удахгүй хариу өгнө."
          );
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message || error);
    return res.sendStatus(500);
  }
});

/**
 * Optional manual setup route
 * Open /setup once after deploy to force re-register profile settings
 */
app.get("/setup", async (req, res) => {
  try {
    const results = {};
    results.getStarted = await setGetStarted();
    results.persistentMenu = await setPersistentMenu();

    res.status(200).json({
      ok: true,
      results,
    });
  } catch (error) {
    console.error("Setup error:", error.response?.data || error.message || error);
    res.status(500).json({
      ok: false,
      error: error.response?.data || error.message || "Unknown setup error",
    });
  }
});

/**
 * Main handlers
 */
async function handlePostback(senderId, payload) {
  console.log("Postback payload:", payload);

  switch (payload) {
    case "GET_STARTED":
    case "MAIN_MENU":
      return sendMainMenu(senderId);

    case "SERVICE":
      return sendServiceCarousel(senderId);

    case "LOCATION":
      return sendLocationMenu(senderId);

    case "CONTACT":
      return sendContactMenu(senderId);

    case "SCHEDULE":
      return sendSchedule(senderId);

    case "BEAUTY_SERVICE":
      return sendBeautyCarousel(senderId);

    case "HAIR_SERVICE":
      return sendHairCarousel(senderId);

    case "EYEBROW_SERVICE":
      return sendEyebrowCarousel(senderId);

    case "EYELASH_SERVICE":
      return sendEyelashCarousel(senderId);

    case "NAIL_SERVICE":
      return sendNailCarousel(senderId);

    case "HAIR_PRODUCT":
      return sendHairProductCarousel(senderId);

    case "STAFF":
      return reply(
        senderId,
        "Та асуух зүйлээ үлдээнэ үү.\nАжилтан таны асуултад удахгүй хариу өгөх болно."
      );

    default:
      return sendMainMenu(senderId);
  }
}

async function handleMessage(senderId, text) {
  const normalized = (text || "").trim().toLowerCase();

  if (
    normalized === "menu" ||
    normalized === "start" ||
    normalized === "эхлэх" ||
    normalized === "цэс"
  ) {
    return sendMainMenu(senderId);
  }

  return reply(
    senderId,
    "Та асуух зүйлээ үлдээнэ үү.\nАжилтан таны асуултад удахгүй хариу өгөх болно."
  );
}

/**
 * Messenger Profile API
 * Get Started button must be registered here.
 */
async function setGetStarted() {
  return callMessengerProfileAPI({
    get_started: {
      payload: "GET_STARTED",
    },
  });
}

async function setPersistentMenu() {
  return callMessengerProfileAPI({
    persistent_menu: [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: [
          {
            type: "postback",
            title: "Үндсэн цэс",
            payload: "MAIN_MENU",
          },
          {
            type: "postback",
            title: "Үйлчилгээ",
            payload: "SERVICE",
          },
          {
            type: "postback",
            title: "Хаяг байршил",
            payload: "LOCATION",
          },
          {
            type: "postback",
            title: "Холбоо барих",
            payload: "CONTACT",
          },
        ],
      },
    ],
  });
}

async function callMessengerProfileAPI(body) {
  const response = await fetch(
    `https://graph.facebook.com/v20.0/me/messenger_profile?access_token=${TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  console.log("Messenger profile updated:", data);
  return data;
}

/**
 * Send API wrappers
 */
async function callSendAPI(psid, message) {
  const response = await fetch(
    `https://graph.facebook.com/v20.0/me/messages?access_token=${TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

async function reply(psid, text) {
  return callSendAPI(psid, { text });
}

async function sendButtons(psid, text, buttons) {
  return callSendAPI(psid, {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons,
      },
    },
  });
}

async function sendGenericTemplate(psid, elements) {
  return callSendAPI(psid, {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements,
      },
    },
  });
}

/**
 * Bot content
 */
async function sendMainMenu(psid) {
  await sendButtons(psid, "Сайн байна уу. Доорх цэснээс сонгоно уу.", [
    {
      type: "postback",
      title: "Үйлчилгээ",
      payload: "SERVICE",
    },
    {
      type: "postback",
      title: "Цаг авах",
      payload: "SCHEDULE",
    },
    {
      type: "postback",
      title: "Холбоо барих",
      payload: "CONTACT",
    },
  ]);
}

async function sendServiceCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Үсний үйлчилгээ",
      subtitle: "Үс арчилгаа, будаг, засалт",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "HAIR_SERVICE",
        },
      ],
    },
    {
      title: "Хөмсөгний үйлчилгээ",
      subtitle: "Хөмсөг хэлбэржүүлэлт, арчилгаа",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "EYEBROW_SERVICE",
        },
      ],
    },
    {
      title: "Сормуусны үйлчилгээ",
      subtitle: "Сормуус суулгалт, арчилгаа",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "EYELASH_SERVICE",
        },
      ],
    },
    {
      title: "Гоо сайхны үйлчилгээ",
      subtitle: "Арьс арчилгаа, нүүр будалт",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "BEAUTY_SERVICE",
        },
      ],
    },
    {
      title: "Хумсны үйлчилгээ",
      subtitle: "Маникюр, педикюр",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "NAIL_SERVICE",
        },
      ],
    },
    {
      title: "Үсний бүтээгдэхүүн",
      subtitle: "Худалдаалагдаж буй бүтээгдэхүүнүүд",
      buttons: [
        {
          type: "postback",
          title: "Дэлгэрэнгүй",
          payload: "HAIR_PRODUCT",
        },
      ],
    },
  ]);
}

async function sendLocationMenu(psid) {
  await sendButtons(psid, "Манай байршлын мэдээлэл:", [
    {
      type: "web_url",
      title: "Google Maps",
      url: "https://maps.google.com",
    },
    {
      type: "postback",
      title: "Үндсэн цэс",
      payload: "MAIN_MENU",
    },
  ]);
}

async function sendContactMenu(psid) {
  await sendButtons(psid, "Холбоо барих мэдээлэл:", [
    {
      type: "phone_number",
      title: "Утасдах",
      payload: "+97600000000",
    },
    {
      type: "postback",
      title: "Ажилтантай холбох",
      payload: "STAFF",
    },
    {
      type: "postback",
      title: "Үндсэн цэс",
      payload: "MAIN_MENU",
    },
  ]);
}

async function sendSchedule(psid) {
  await reply(
    psid,
    "Цаг захиалах бол өөрийн нэр, утасны дугаар, хүссэн үйлчилгээ, ирэх өдөр цагаа бичиж үлдээнэ үү."
  );
}

async function sendBeautyCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Арьс арчилгаа",
      subtitle: "Нүүр цэвэрлэгээ, арчилгаа",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Нүүр будалт",
      subtitle: "Өдөр тутам, event make-up",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
  ]);
}

async function sendHairCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Үс засалт",
      subtitle: "Эмэгтэй, эрэгтэй үс засалт",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Үс будах",
      subtitle: "Бүх төрлийн будаг, өнгө сэргээх",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Үс арчилгаа",
      subtitle: "Тэжээл, сэргээх үйлчилгээ",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
  ]);
}

async function sendEyebrowCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Хөмсөг хэлбэржүүлэлт",
      subtitle: "Засалт, арчилгаа",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Хөмсөг будах",
      subtitle: "Өнгө оруулах үйлчилгээ",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
  ]);
}

async function sendEyelashCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Сормуус суулгалт",
      subtitle: "Classic, volume, hybrid",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Сормуус арчилгаа",
      subtitle: "Нөхөн сэргээх, цэвэрлэгээ",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
  ]);
}

async function sendNailCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Маникюр",
      subtitle: "Гель, будалт, арчилгаа",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
    {
      title: "Педикюр",
      subtitle: "Хөл арчилгаа, будалт",
      buttons: [{ type: "postback", title: "Цаг авах", payload: "SCHEDULE" }],
    },
  ]);
}

async function sendHairProductCarousel(psid) {
  await sendGenericTemplate(psid, [
    {
      title: "Шампунь",
      subtitle: "Үсний төрөл бүрт",
      buttons: [{ type: "postback", title: "Асуух", payload: "STAFF" }],
    },
    {
      title: "Тэжээлийн маск",
      subtitle: "Үс сэргээх бүтээгдэхүүн",
      buttons: [{ type: "postback", title: "Асуух", payload: "STAFF" }],
    },
    {
      title: "Серум / тос",
      subtitle: "Үс хамгаалах, гялалзуулах",
      buttons: [{ type: "postback", title: "Асуух", payload: "STAFF" }],
    },
  ]);
}

app.listen(PORT, async () => {
  console.log(`Bot running on port ${PORT}`);

  try {
    await setGetStarted();
    await setPersistentMenu();
    console.log("Messenger profile setup complete");
  } catch (error) {
    console.error("Startup setup failed:", error.message || error);
  }
});
