// Listar recorrências Pix
async function listarRecorrenciasPix({ offset = 0, limit = 10, status, value, searchText }) {
  try {
    const params = {};
    if (offset) params.offset = offset;
    if (limit) params.limit = limit;
    if (status) params.status = status;
    if (value) params.value = value;
    if (searchText) params.searchText = searchText;
    const response = await axios.get(
      `${ASAS_API_URL}/pix/transactions/recurrings`,
      {
        headers: getAsaasHeaders(false),
        params
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}
// Serviço para integração com a API do Asaas (produção)
// Criação de cliente

const axios = require('axios');
const ASAS_API_KEY = process.env.ASAS_API_KEY;
const ASAS_API_URL = 'https://api.asaas.com/v3';

function getAsaasHeaders(withContentType = true) {
  if (!ASAS_API_KEY) {
    throw new Error('ASAS_API_KEY environment variable is required for Asaas integration');
  }
  const headers = {
    'accept': 'application/json',
    'access_token': ASAS_API_KEY
  };
  if (withContentType) headers['content-type'] = 'application/json';
  return headers;
}

async function criarCliente({ name, cpfCnpj, email, mobilePhone, externalReference }) {
  try {
    const response = await axios.post(
      `${ASAS_API_URL}/customers`,
      {
        name,
        cpfCnpj,
        email,
        mobilePhone,
        externalReference
      },
      {
        headers: getAsaasHeaders(true)
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}

// Criação de cobrança Pix
async function criarCobrancaPix({ customer, value, dueDate, description, externalReference }) {
  try {
    const response = await axios.post(
      `${ASAS_API_URL}/payments`,
      {
        customer,
        billingType: 'PIX',
        value: 10.71, // repassando taxa ao usuário
        dueDate,
        description,
        externalReference
      },
      {
        headers: getAsaasHeaders(true)
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}


// Criação de cobrança Pix com resposta resumida
async function criarCobrancaPixResumida({ customer, value, dueDate, description, externalReference }) {
  try {
    const response = await axios.post(
      `${ASAS_API_URL}/lean/payments`,
      {
        customer,
        billingType: 'PIX',
        value,
        dueDate,
        description,
        externalReference
      },
      {
        headers: getAsaasHeaders(true)
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}


// Criação de cobrança com cartão de crédito (resposta resumida)
async function criarCobrancaCartaoResumida({ customer, value, dueDate, description, externalReference, creditCard, creditCardHolderInfo, remoteIp }) {
  try {
    const payload = {
      customer,
      billingType: 'CREDIT_CARD',
      value,
      dueDate,
      description,
      externalReference,
      remoteIp
    };
    // If a token is provided instead of card data, use it (creditCardToken)
    if (creditCard && Object.keys(creditCard).length > 0) {
      payload.creditCard = creditCard;
      payload.creditCardHolderInfo = creditCardHolderInfo;
    }
    if (typeof arguments[0] === 'object' && arguments[0].creditCardToken) {
      payload.creditCardToken = arguments[0].creditCardToken;
      // ensure we don't send full creditCard when token present
      delete payload.creditCard;
      delete payload.creditCardHolderInfo;
    }

    const response = await axios.post(
      `${ASAS_API_URL}/lean/payments`,
      payload,
      {
        headers: getAsaasHeaders(true)
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}

// Consulta uma cobrança/pagamento direto na API Asaas para verificação de status
async function getPayment(paymentId) {
  try {
    const response = await axios.get(`${ASAS_API_URL}/payments/${paymentId}`, { headers: getAsaasHeaders(false) });
    return response.data;
  } catch (error) {
    if (error.response) return { error: true, status: error.response.status, data: error.response.data };
    return { error: true, message: error.message };
  }
}

// Tokenizar cartão (cria creditCardToken)
async function tokenizeCard({ customer, creditCard, creditCardHolderInfo, remoteIp }) {
  try {
    const response = await axios.post(`${ASAS_API_URL}/creditCard/tokenize`, { customer, creditCard, creditCardHolderInfo, remoteIp }, { headers: getAsaasHeaders(true) });
    return response.data;
  } catch (error) {
    if (error.response) return { error: true, status: error.response.status, data: error.response.data };
    return { error: true, message: error.message };
  }
}

// Criar assinatura (subscriptions)
async function criarAssinatura({ customer, billingType = 'BOLETO', nextDueDate, value, cycle, description, remoteIp }) {
  try {
    const payload = { customer, billingType, nextDueDate, value, cycle, description, remoteIp };
    // Accept card data or token for immediate charge
    if (arguments[0] && arguments[0].creditCardToken) {
      payload.creditCardToken = arguments[0].creditCardToken;
    } else if (arguments[0] && arguments[0].creditCard) {
      payload.creditCard = arguments[0].creditCard;
      payload.creditCardHolderInfo = arguments[0].creditCardHolderInfo;
    }
    const response = await axios.post(`${ASAS_API_URL}/subscriptions`, payload, { headers: getAsaasHeaders(true) });
    return response.data;
  } catch (error) {
    if (error.response) return { error: true, status: error.response.status, data: error.response.data };
    return { error: true, message: error.message };
  }
}

// Recuperar cobranças de uma assinatura
async function getSubscriptionPayments(subscriptionId) {
  try {
    const response = await axios.get(`${ASAS_API_URL}/subscriptions/${subscriptionId}/payments`, { headers: getAsaasHeaders(false) });
    return response.data;
  } catch (error) {
    if (error.response) return { error: true, status: error.response.status, data: error.response.data };
    return { error: true, message: error.message };
  }
}


// Obter QR Code Pix de uma cobrança
async function getPixQrCode(paymentId) {
  try {
    const response = await axios.get(
      `${ASAS_API_URL}/payments/${paymentId}/pixQrCode`,
      {
        headers: getAsaasHeaders(false)
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, data: error.response.data };
    }
    return { error: true, message: error.message };
  }
}

module.exports = {
  criarCliente,
  criarCobrancaPix,
  criarCobrancaPixResumida,
  criarCobrancaCartaoResumida,
  getPixQrCode,
  listarRecorrenciasPix,
  getPayment,
  tokenizeCard
  ,criarAssinatura
  ,getSubscriptionPayments
};
