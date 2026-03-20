const axios = require('axios');

const INSTANCE_ID = '90LFF2-THZ1AJ-HYES7R';
const TOKEN = 'TKXyC4sgFOORzzAXGXT9PtZOA386hJAna';

async function sendWelcomeMessage(phone, name) {
  const message = `Olá, ${name}! Seja bem-vindo ao Finança PF 🚀`;
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

module.exports = { sendWelcomeMessage };
