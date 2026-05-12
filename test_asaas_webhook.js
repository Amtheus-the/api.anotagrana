const axios = require('axios');

// Simula um webhook do Asaas para o endpoint /asaas/webhook
// Ajuste PORT e o payload conforme necessário.
const PORT = process.env.PORT || 3001;
const url = `http://localhost:${PORT}/asaas/webhook`;

async function run() {
  const sample = {
    // exemplo de estrutura com payment e externalReference apontando para user id 24
    payment: {
      id: 'pay_12345',
      value: 10.71,
      status: 'CONFIRMED',
      externalReference: '24',
      customer: {
        email: 'anderson.visiontech@gmail.com',
        mobilePhone: '5511986387651'
      }
    }
  };

  try {
    const resp = await axios.post(url, sample, { headers: { 'Content-Type': 'application/json' } });
    console.log('Resposta do servidor:', resp.status, resp.data);
  } catch (err) {
    console.error('Erro ao chamar webhook:', err.response?.status, err.response?.data || err.message);
  }
}

run();
