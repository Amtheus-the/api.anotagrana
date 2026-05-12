const axios = require('axios');

const INSTANCE_ID = '90LFF2-THZ1AJ-HYES7R';
const TOKEN = 'TKXyC4sgFOORzzAXGXT9PtZOA386hJAna';

async function sendWelcomeMessage(phone, name) {
  const messages = [
    `Olá, ${name}! 👋\nBem-vindo ao AnotaGrana 🚀\n\nControle seu dinheiro de forma simples:\n💰 Registre ganhos e gastos\n📊 Veja quanto tem disponível\n📈 Organize sua vida financeira\n\nExemplos:\n"Recebi 3000"\n"Gastei 50 no almoço"\n\n▶️ Veja como usar: [link do vídeo]\n\nMe mande uma mensagem e eu cuido do resto �`
  ];
  for (const message of messages) {
    await axios.post(
      `https://api.w-api.app/v1/message/send-text?instanceId=${INSTANCE_ID}`,
      { phone, message },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`,
        },
      }
    );
  }
}

module.exports = { sendWelcomeMessage };
