const axios = require('axios');

const INSTANCE_ID = '90LFF2-THZ1AJ-HYES7R';
const TOKEN = 'TKXyC4sgFOORzzAXGXT9PtZOA386hJAna';

async function sendWelcomeMessage(phone, name) {
  const messages = [
    `Olá, ${name}! 👋 Seja muito bem-vindo ao AnotaGrana 🚀`,
    `Aqui você pode controlar todos os seus gastos, receitas, investimentos e contas de forma simples e inteligente. Sempre que quiser, basta me enviar mensagens como:\n- “Meu salário de 3 mil caiu na conta”\n- “Gastei 100 reais no café da manhã”\n- “Quero investir meu dinheiro”\n- “Quanto tenho disponível?”`,
    `Eu registro automaticamente suas movimentações, organizo suas finanças e te ajudo a planejar o futuro. Se precisar de dicas, relatórios ou quiser saber onde está gastando mais, é só perguntar! Conte comigo para facilitar sua vida financeira. 😊`
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
