const axios = require('axios');

const BASE_URL = 'http://localhost:3001/webhook-whats';
const TEST_PHONE = '5511986387651';

const mensagens = [
  'Oi',
  'Bom dia',
  'Olá',
  'Boa tarde',
  'Boa noite',
  'Quanto gastei esse mês?',
  'Acabei de gastar 80 reais em unha',
  'Recebi 1000 de salário',
  'Quais contas tenho a pagar esse mês?'
];

async function testarAPI() {
  for (const mensagem of mensagens) {
    try {
      const response = await axios.post(BASE_URL, {
        sender: { id: TEST_PHONE },
        msgContent: { conversation: mensagem }
      });
      console.log(`Mensagem: "${mensagem}"`);
      console.log('Resposta:', response.data);
      console.log('-----------------------------');
    } catch (err) {
      if (err.response) {
        console.error(`Erro ao testar mensagem: "${mensagem}"`);
        console.error('Status:', err.response.status);
        console.error('Headers:', err.response.headers);
        console.error('Data:', err.response.data);
      } else {
        console.error(`Erro ao testar mensagem: "${mensagem}"`, err);
      }
      console.error('Stack:', err.stack);
      console.log('-----------------------------');
    }
  }
}

testarAPI();
