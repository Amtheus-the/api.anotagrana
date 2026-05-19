const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { callOpenAI } = require('../services/openai');

const router = express.Router();

const INSTANCE_ID = process.env.INSTANCE_ID;
const TOKEN = process.env.TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Endpoint de teste para simular o fluxo completo: mensagem > IA > resposta enviada para o WhatsApp
router.post('/testar-fluxo-whats', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone e message são obrigatórios' });
  }
  try {
    // Consulta a IA
    const resposta = await callOpenAI({
      messages: [
        {
          role: 'system', content: `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Responda sempre de forma curta, direta e natural, sem enrolação. Não repita saudações, agradecimentos ou despedidas. Só confirme o registro ou classificação, informe saldo apenas se solicitado ou relevante. Exemplos de resposta:

Gasto de R$20 com café da manhã registrado.
R$28 em marmita registrado. Saldo: R$2.624.
Salário de R$3.000 registrado!
R$8 em Uber registrado em transporte.
R$30 em remédio registrado em saúde. Melhoras!
R$500 em férias registrado em lazer.
R$50 na Netflix registrado em assinaturas.
Não entendi. Pode repetir?
Precisa de mais alguma coisa?

Seja sempre breve, só confirme e pronto.` },
        { role: 'user', content: message }
      ],
      max_tokens: 120,
      apiKey: OPENAI_KEY
    });
    // Envia a resposta da IA para o WhatsApp do usuário
    const url = `https://api.w-api.app/v1/message/send-text?instanceId=${INSTANCE_ID}`;
    const payload = { phone, message: resposta };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    };
    const resp = await axios.post(url, payload, { headers });
    res.json({ status: 'sucesso', resposta, whatsapp: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para conversar com a IA (OpenAI) diretamente
router.post('/enviar-whats', async (req, res) => {
  console.log('[ROUTE][DEBUG] /enviar-whats chamada', JSON.stringify(req.body));
  const { phone, message } = req.body;
  try {
    const resposta = await callOpenAI({
      messages: [
        {
          role: 'system', content: `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Responda sempre de forma curta, direta e natural, sem enrolação. Não repita saudações, agradecimentos ou despedidas. Só confirme o registro ou classificação, informe saldo apenas se solicitado ou relevante. Exemplos de resposta:

Gasto de R$20 com café da manhã registrado.
R$28 em marmita registrado. Saldo: R$2.624.
Salário de R$3.000 registrado!
R$8 em Uber registrado em transporte.
R$30 em remédio registrado em saúde. Melhoras!
R$500 em férias registrado em lazer.
R$50 na Netflix registrado em assinaturas.
Não entendi. Pode repetir?
Precisa de mais alguma coisa?

Seja sempre breve, só confirme e pronto.` },
        { role: 'user', content: message }
      ],
      max_tokens: 120,
      apiKey: OPENAI_KEY
    });
    res.json({ message: resposta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para transcrever áudio recebido em base64
router.post('/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, filename = 'audio.webm', contentType = 'audio/webm' } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: 'Campo audioBase64 é obrigatório' });

    // Converte base64 para buffer
    const matches = audioBase64.match(/^data:(.+);base64,(.+)$/);
    let buffer;
    if (matches) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // Se veio só a base64 sem prefixo
      buffer = Buffer.from(audioBase64, 'base64');
    }

    // Monta multipart/form-data manualmente para enviar à OpenAI sem form-data dependency
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const CRLF = '\r\n';
    const preamble = `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: ${contentType}${CRLF}${CRLF}`;
    const postamble = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}whisper-1${CRLF}--${boundary}--${CRLF}`;

    const bodyBuffer = Buffer.concat([Buffer.from(preamble, 'utf8'), buffer, Buffer.from(postamble, 'utf8')]);

    const openaiRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', bodyBuffer, {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      maxBodyLength: Infinity
    });

    const text = openaiRes.data && openaiRes.data.text ? openaiRes.data.text : null;
    if (!text) return res.status(500).json({ error: 'Transcrição vazia' });
    res.json({ text });
  } catch (err) {
    console.error('[TRANSCRIBE][ERRO]', err.response?.data || err.message || err);
    res.status(500).json({ error: err.message || 'Erro ao transcrever áudio' });
  }
});

// Webhook para receber mensagens do WhatsApp (configure na W-API)
router.post('/webhook-whats', async (req, res) => {
  // Log completo do payload recebido para depuração
  console.log('[WEBHOOK-WHATS][DEBUG][PAYLOAD RECEBIDO]', JSON.stringify(req.body));
  const { Op, literal } = require('sequelize');
  const Account = require('../models/Account');
  const Bill = require('../models/Bill');
  const Investment = require('../models/Investment');
  const MoneyBox = require('../models/MoneyBox');
  const Transaction = require('../models/Transaction');
  const User = require('../models/User');

  let phone = null;
  let message = null;
  const body = req.body || {};
  // Extrair phone
  if (body.sender && body.sender.id) {
    phone = body.sender.id;
  } else if (body.chat && body.chat.id) {
    phone = body.chat.id;
  }

  // --- NOVO: Detectar áudio ---
  let isAudio = false;
  let audioUrl = null;
  let audioMimetype = null;
  let audioMediaKey = null;
  let audioDirectPath = null;
  if (body.msgContent) {
    if (body.msgContent.audioMessage && body.msgContent.audioMessage.url) {
      isAudio = true;
      // Novos campos para baixar corretamente via W-API
      audioMimetype = body.msgContent.audioMessage.mimetype || 'audio/ogg';
      audioMediaKey = body.msgContent.audioMessage.mediaKey;
      audioDirectPath = body.msgContent.audioMessage.directPath;
    } else if (body.msgContent.conversation) {
      message = body.msgContent.conversation;
    } else if (body.msgContent.extendedTextMessage && body.msgContent.extendedTextMessage.text) {
      message = body.msgContent.extendedTextMessage.text;
    }
  }

  // Se for áudio, baixa, transcreve e responde
  if (isAudio && audioMediaKey && audioDirectPath) {
    try {
      // Baixar o áudio corretamente via W-API
      const downloadUrl = `https://api.w-api.app/v1/message/download-media?instanceId=${process.env.INSTANCE_ID}`;
      const downloadPayload = {
        mediaKey: audioMediaKey,
        directPath: audioDirectPath,
        type: 'audio',
        mimetype: audioMimetype || 'audio/ogg'
      };
      const downloadHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOKEN}`
      };
      console.log('[WAPI][DOWNLOAD-MEDIA][PAYLOAD]', downloadPayload);
      const downloadRes = await axios.post(downloadUrl, downloadPayload, { headers: downloadHeaders });
      console.log('[WAPI][DOWNLOAD-MEDIA][RESPONSE]', downloadRes.data);
      if (!downloadRes.data || !downloadRes.data.fileLink) {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: 'Erro ao baixar o áudio (link inválido ou expirado). Tente enviar novamente.' };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(url, payload, { headers });
        return res.json({ status: 'erro', motivo: 'audio_download_falhou', info: downloadRes.data });
      }
      // Agora sim, baixe o áudio do link temporário
      let audioResp;
      let downloadOk = false;
      let lastErr = null;
      const maxTries = 2;
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        try {
          const t0 = Date.now();
          console.log(`[AUDIO][DOWNLOAD][LINK][Tentativa ${attempt}]`, downloadRes.data.fileLink);
          audioResp = await axios.get(downloadRes.data.fileLink, { responseType: 'arraybuffer' });
          const t1 = Date.now();
          console.log(`[AUDIO][DOWNLOAD][SUCESSO][Tentativa ${attempt}] Tempo: ${t1 - t0}ms`);
          downloadOk = true;
          break;
        } catch (err) {
          lastErr = err;
          console.error(`[AUDIO][DOWNLOAD][ERRO][Tentativa ${attempt}]`, err.response?.status, err.response?.data, downloadRes.data.fileLink);
          if (attempt < maxTries) {
            await new Promise(r => setTimeout(r, 500)); // espera 500ms antes de tentar de novo
          }
        }
      }
      if (!downloadOk) {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: `Erro ao baixar o áudio (status ${lastErr?.response?.status || '??'}). Tente novamente.` };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(url, payload, { headers });
        return res.json({ status: 'erro', motivo: 'audio_download_erro', status: lastErr?.response?.status, data: lastErr?.response?.data });
      }
      const audioBuffer = Buffer.from(audioResp.data, 'binary');
      // Converter para base64
      const audioBase64 = audioBuffer.toString('base64');
      // Enviar para transcrição
      const transcribeRes = await axios.post(
        `${req.protocol}://${req.get('host')}/transcribe-audio`,
        {
          audioBase64,
          filename: 'audio.ogg',
          contentType: audioMimetype || 'audio/ogg'
        }
      );
      const textoTranscrito = transcribeRes.data && transcribeRes.data.text ? transcribeRes.data.text : null;
      if (!textoTranscrito) {
        // Falha ao transcrever
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: 'Não consegui entender o áudio. Pode tentar novamente?' };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(url, payload, { headers });
        return res.json({ status: 'erro', motivo: 'transcricao_falhou' });
      }
      // Consultar IA
      const resposta = await callOpenAI({
        messages: [
          { role: 'system', content: `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Responda sempre de forma curta, direta e natural, sem enrolação. Não repita saudações, agradecimentos ou despedidas. Só confirme o registro ou classificação, informe saldo apenas se solicitado ou relevante. Seja sempre breve, só confirme e pronto.` },
          { role: 'user', content: textoTranscrito }
        ],
        max_tokens: 120,
        apiKey: process.env.OPENAI_KEY
      });
      // Responder no WhatsApp
      const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
      const payload = { phone, message: resposta };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
      await axios.post(url, payload, { headers });
      return res.json({ status: 'sucesso', resposta });
    } catch (err) {
      console.error('[WEBHOOK-WHATS][AUDIO][ERRO]', err.message || err);
      const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
      const payload = { phone, message: 'Erro ao processar o áudio. Tente novamente.' };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
      await axios.post(url, payload, { headers });
      return res.json({ status: 'erro', motivo: 'audio_falhou' });
    }
  }

  // Buscar todos os telefones cadastrados na tabela Users
  let PHONES_AUTORIZADOS = [];
  try {
    const users = await User.findAll({ attributes: ['phone'] });
    PHONES_AUTORIZADOS = users.map(u => String(u.phone));
  } catch (e) {
    console.error('[WEBHOOK-WHATS][ERRO] Falha ao buscar telefones autorizados:', e.message);
  }

  if (!message || !PHONES_AUTORIZADOS.includes(phone)) {
    console.log('[WEBHOOK-WHATS][LOOP PROTECTION] Ignorando mensagem automática ou número não autorizado:', { phone, message });
    return res.json({ status: 'ignorado', motivo: 'mensagem automática ou número não autorizado', phone, message });
  }
  console.log('[WEBHOOK-WHATS] phone:', phone);
  console.log('[WEBHOOK-WHATS] message:', message);
  // --- Early trial check: bloquear qualquer interação se o trial expirou (>=30 dias) e usuário não é assinante ---
  try {
    const earlyUser = await User.findOne({ where: { phone: phone } });
    if (earlyUser && !earlyUser.is_subscribed && earlyUser.free_trial_started_at) {
      const started = new Date(earlyUser.free_trial_started_at);
      const diffDays = Math.floor((new Date() - started) / (1000 * 60 * 60 * 24));
      if (diffDays >= 30) {
        const mensagemAviso = 'Seu período de 30 dias grátis terminou. Para continuar usando o assistente financeiro por WhatsApp, assine o Anota Grana em https://app.anotagrana.com.br/assinatura';
        try {
          const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
          const payload = { phone, message: mensagemAviso };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
          console.log('[WEBHOOK-WHATS][TRIAL] Enviando aviso de trial expirado para', phone);
          await axios.post(url, payload, { headers });
        } catch (e) {
          console.error('[WEBHOOK-WHATS][TRIAL][ERRO] ao enviar aviso:', e.message || e);
        }
        return res.json({ status: 'bloqueado', motivo: 'trial_expirado', mensagem: mensagemAviso });
      }
    }
  } catch (e) {
    console.error('[WEBHOOK-WHATS][TRIAL][ERRO EARLY]', e.message || e);
  }
  // Função para consultar cotação do dólar
  async function getDollarRate() {
    try {
      const response = await axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      return response.data.USDBRL.bid;
    } catch (e) {
      return null;
    }
  }

  // Função para consultar cotação de várias moedas
  async function getCurrencyRate(moeda) {
    const map = {
      'dolar': 'USD', 'dólar': 'USD', 'usd': 'USD',
      'euro': 'EUR', 'eur': 'EUR',
      'libra': 'GBP', 'gbp': 'GBP',
      'iene': 'JPY', 'jpy': 'JPY',
      'franco': 'CHF', 'franco suiço': 'CHF', 'franco suíço': 'CHF', 'chf': 'CHF',
      'dolar canadense': 'CAD', 'dólar canadense': 'CAD', 'cad': 'CAD',
      'dolar australiano': 'AUD', 'dólar australiano': 'AUD', 'aud': 'AUD',
      'peso': 'ARS', 'peso argentino': 'ARS', 'ars': 'ARS',
      'bitcoin': 'BTC', 'btc': 'BTC',
      'ethereum': 'ETH', 'eth': 'ETH',
      'dogecoin': 'DOGE', 'doge': 'DOGE',
      'real': 'BRL', 'brl': 'BRL'
    };
    moeda = moeda.toLowerCase();
    let code = map[moeda];
    if (!code) {
      // tenta pegar só a palavra principal
      const palavra = moeda.split(' ')[0];
      code = map[palavra];
    }
    if (!code) return null;
    try {
      const response = await axios.get(`https://economia.awesomeapi.com.br/json/last/${code}-BRL`);
      const key = code + 'BRL';
      return { code, value: response.data[key]?.bid };
    } catch (e) {
      return null;
    }
  }

  // Normaliza a mensagem para minúsculas e sem acentos
  const msgLower = (message || '').toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '');

  // Detecta pedidos de link da plataforma e responde imediatamente (deve ser o PRIMEIRO bloco de interceptação)
  const padroesLink = [
    'link da plataforma',
    'link do dashboard',
    'link do sistema',
    'link para acessar',
    'link para acessar o anota grana',
    'link do anota grana',
    'acessar o anota grana',
    'acessar a plataforma',
    'acessar o sistema',
    'acessar o dashboard',
    'me envie o link',
    'me manda o link',
    'como acesso o sistema',
    'como acesso a plataforma',
    'como acessar o dashboard',
    'como acessar o anota grana',
    'como acessar a plataforma',
    'como acessar o sistema',
    'como acessar o dashboard',
    'acessar plataforma',
    'acessar sistema',
    'acessar dashboard',
    'acessar anota grana',
    'link para login',
    'link de login',
    'login do anota grana',
    'login da plataforma',
    'login do sistema',
    'link para acessar o dashboard',
    'link para acessar o sistema',
    'link para acessar a plataforma',
    'link para acessar o login',
    'link para acessar o painel',
    'painel de controle',
    'painel do anota grana',
    'painel',
    'dashboard',
    'plataforma',
    'sistema'
  ];
  for (const padrao of padroesLink) {
    if (msgLower.includes(padrao)) {
      const respostaFinal = 'Para acessar o Anota Grana, utilize este link: https://app.anotagrana.com.br/login';
      try {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = {
          phone,
          message: respostaFinal
        };
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOKEN}`,
        };
        console.log('[WEBHOOK-WHATS][DEBUG] Enviando resposta para WhatsApp:', { url, payload, headers });
        const resp = await axios.post(url, payload, { headers });
        console.log('[WEBHOOK-WHATS][DEBUG] Resposta da API WhatsApp:', resp.data);
      } catch (err) {
        if (err.response) {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
        } else {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message);
        }
      }
      return res.json({ status: 'sucesso', resposta: respostaFinal });
    }
  }

  // Detecta perguntas sobre moedas famosas e responde imediatamente
  const moedasFamosas = [
    'dolar', 'dólar', 'usd', 'euro', 'eur', 'libra', 'gbp', 'iene', 'jpy', 'franco', 'franco suiço', 'franco suíço', 'chf',
    'dolar canadense', 'dólar canadense', 'cad', 'dolar australiano', 'dólar australiano', 'aud',
    'peso', 'peso argentino', 'ars', 'bitcoin', 'btc', 'ethereum', 'eth', 'dogecoin', 'doge'
  ];
  for (const moeda of moedasFamosas) {
    if (msgLower.includes(moeda)) {
      const cotacao = await getCurrencyRate(moeda);
      let respostaFinal = '';
      if (cotacao && cotacao.value) {
        respostaFinal = `A cotação atual de ${moeda.charAt(0).toUpperCase() + moeda.slice(1)} é R$ ${Number(cotacao.value).toFixed(2)}`;
      } else {
        respostaFinal = `Não foi possível obter a cotação de ${moeda.charAt(0).toUpperCase() + moeda.slice(1)} no momento.`;
      }
      try {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = {
          phone,
          message: respostaFinal
        };
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOKEN}`,
        };
        console.log('[WEBHOOK-WHATS][DEBUG] Enviando resposta para WhatsApp:', { url, payload, headers });
        const resp = await axios.post(url, payload, { headers });
        console.log('[WEBHOOK-WHATS][DEBUG] Resposta da API WhatsApp:', resp.data);
      } catch (err) {
        if (err.response) {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
        } else {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message);
        }
      }
      return res.json({ status: 'sucesso', resposta: respostaFinal });
    }
  }

  // Detecta perguntas sobre empresas americanas famosas e responde com dados da Finnhub
  const empresasUSA = {
    'apple': 'AAPL',
    'aapl': 'AAPL',
    'microsoft': 'MSFT', // Updated to ensure consistency
    'msft': 'MSFT',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'googl': 'GOOGL',
    'amazon': 'AMZN',
    'amzn': 'AMZN',
    'meta': 'META',
    'facebook': 'META',
    'tesla': 'TSLA',
    'tsla': 'TSLA',
    'nvidia': 'NVDA',
    'nvda': 'NVDA',
    'netflix': 'NFLX',
    'nflx': 'NFLX',
    'paypal': 'PYPL',
    'pypl': 'PYPL',
    'adobe': 'ADBE',
    'adbe': 'ADBE',
    'intel': 'INTC',
    'intc': 'INTC',
    'coca cola': 'KO',
    'coca-cola': 'KO',
    'ko': 'KO',
    'pepsico': 'PEP',
    'pep': 'PEP',
    'starbucks': 'SBUX',
    'sbux': 'SBUX',
    'disney': 'DIS',
    'dis': 'DIS',
    'mcdonalds': 'MCD',
    'mcd': 'MCD',
    'boeing': 'BA',
    'ba': 'BA',
    'exxon': 'XOM',
    'exxonmobil': 'XOM',
    'xom': 'XOM',
    'chevron': 'CVX',
    'cvx': 'CVX',
    'pfizer': 'PFE',
    'pfe': 'PFE',
    'johnson & johnson': 'JNJ',
    'johnson and johnson': 'JNJ',
    'jnj': 'JNJ',
    'walmart': 'WMT',
    'wmt': 'WMT',
    'procter & gamble': 'PG',
    'procter and gamble': 'PG',
    'pg': 'PG',
    'visa': 'V',
    'v': 'V',
    'mastercard': 'MA',
    'ma': 'MA',
    'ibm': 'IBM',
    'oracle': 'ORCL',
    'orcl': 'ORCL',
    'uber': 'UBER',
    'lyft': 'LYFT',
    'lyft': 'LYFT',
    'snap': 'SNAP',
    'snapchat': 'SNAP',
    'twitter': 'TWTR',
    'twtr': 'TWTR',
    'at&t': 'T',
    'att': 'T',
    't': 'T',
    'ford': 'F',
    'f': 'F',
    'general motors': 'GM',
    'gm': 'GM',
    'cisco': 'CSCO',
    'csco': 'CSCO',
    'qualcomm': 'QCOM',
    'qcom': 'QCOM',
    'amd': 'AMD',
    'advanced micro devices': 'AMD',
    'booking': 'BKNG',
    'bkng': 'BKNG',
    'airbnb': 'ABNB',
    'abnb': 'ABNB',
    'shopify': 'SHOP',
    'shop': 'SHOP',
    'block': 'SQ',
    'sq': 'SQ',
    'paypal': 'PYPL',
    'pypl': 'PYPL',
    'ebay': 'EBAY',
    'ebay': 'EBAY',
    'zoom': 'ZM',
    'zm': 'ZM',
    'sp500': '^GSPC',
    's&p500': '^GSPC',
    's&p 500': '^GSPC',
    'dow jones': '^DJI',
    'nasdaq': '^IXIC'
  };
  for (const nome in empresasUSA) {
    // Regex para palavra inteira (\b) e case-insensitive
    const regex = new RegExp(`\\b${nome.replace(/[-&]/g, "\\$&")}\\b`, 'i');
    if (regex.test(msgLower)) {
      const symbol = empresasUSA[nome];
      const apiKey = process.env.FINNHUB_KEY;
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      console.log('[FINNHUB][DEBUG][USA] Consultando empresa:', nome, '| Symbol:', symbol, '| API_KEY:', apiKey, '| URL:', url);
      try {
        const resUSA = await axios.get(url);
        const data = resUSA.data;
        if (data && data.c) {
          const respostaFinal = `${nome.charAt(0).toUpperCase() + nome.slice(1)} (${symbol}): US$ ${Number(data.c).toFixed(2)}. Variação do dia: ${data.dp ? data.dp.toFixed(2) : '0.00'}%. Último fechamento: US$ ${Number(data.pc).toFixed(2)}.`;
          const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
          const payload = { phone, message: respostaFinal };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
          await axios.post(urlW, payload, { headers });
          return res.json({ status: 'sucesso', resposta: respostaFinal });
        } else {
          const respostaFinal = `Não foi possível obter informações atualizadas sobre ${nome}.`;
          const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
          const payload = { phone, message: respostaFinal };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
          await axios.post(urlW, payload, { headers });
          return res.json({ status: 'erro', resposta: respostaFinal });
        }
      } catch (err) {
        if (err.response) {
          console.error('[FINNHUB][ERRO][USA]', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
        } else {
          console.error('[FINNHUB][ERRO][USA]', err.message);
        }
        const respostaFinal = `Erro ao consultar dados da empresa ${nome}.`;
        const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: respostaFinal };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(urlW, payload, { headers });
        return res.json({ status: 'erro', resposta: respostaFinal });
      }
    }
  }

  // Detecta perguntas sobre empresas da bolsa BR e responde com dados da Finnhub
  const empresasB3 = {
    'petrobras': 'PETR4.SA',
    'vale': 'VALE3.SA',
    'itau': 'ITUB4.SA',
    'bradesco': 'BBDC4.SA',
    'magalu': 'MGLU3.SA',
    'magazineluiza': 'MGLU3.SA',
    'magazine luiza': 'MGLU3.SA',
    'b3': 'B3SA3.SA',
    'ambev': 'ABEV3.SA',
    'weg': 'WEGE3.SA',
    'suzano': 'SUZB3.SA',
    'gerdau': 'GGBR4.SA',
    'banco do brasil': 'BBAS3.SA',
    'bancointer': 'BIDI11.SA',
    'inter': 'BIDI11.SA',
    'santander': 'SANB11.SA',
    'localiza': 'RENT3.SA',
    'renner': 'LREN3.SA',
    'nubank': 'NU',
    'pagseguro': 'PAGS',
    'stone': 'STNE',
    'xp': 'XP',
    'cvc': 'CVCB3.SA',
    'azul': 'AZUL4.SA',
    'gol': 'GOLL4.SA',
    'prio': 'PRIO3.SA',
    'priner': 'PRNR3.SA',
    'alpargatas': 'ALPA4.SA',
    'totvs': 'TOTS3.SA',
    'petz': 'PETZ3.SA',
    'cielo': 'CIEL3.SA',
    'via': 'VIIA3.SA',
    'americanas': 'AMER3.SA',
    'cogna': 'COGN3.SA',
    'yduqs': 'YDUQ3.SA',
    'soma': 'SOMA3.SA',
    'multiplan': 'MULT3.SA',
    'iguatemi': 'IGTI11.SA',
    'brf': 'BRFS3.SA',
    'marfrig': 'MRFG3.SA',
    'jbs': 'JBSS3.SA',
    'marisa': 'AMAR3.SA',
    'irb': 'IRBR3.SA',
    'sulamerica': 'SULA11.SA',
    'sul américa': 'SULA11.SA',
    'sul américa': 'SULA11.SA',
    'banco pan': 'BPAN4.SA',
    'pan': 'BPAN4.SA',
    'movida': 'MOVI3.SA',
    'alpargatas': 'ALPA4.SA',
    'raizen': 'RAIZ4.SA',
    'petro rio': 'PRIO3.SA',
    'petrobras distribuidora': 'BRDT3.SA',
    'braskem': 'BRKM5.SA',
    'cosan': 'CSAN3.SA',
    'eletrobras': 'ELET3.SA',
    'cpfl': 'CPFE3.SA',
    'energisa': 'ENGI11.SA',
    'taesa': 'TAEE11.SA',
    'cemig': 'CMIG4.SA',
    'sabesp': 'SBSP3.SA',
    'sanepar': 'SAPR11.SA',
    'copel': 'CPLE6.SA',
    'light': 'LIGT3.SA',
    'equatorial': 'EQTL3.SA',
    'enel': 'ENBR3.SA',
    'transmissao paulista': 'TRPL4.SA',
    'transmissão paulista': 'TRPL4.SA',
    'banco safra': 'BSLI11.SA',
    'banco original': 'ORIG3.SA',
    'banco mercantil': 'BMEB4.SA',
    'banco abc': 'ABCB4.SA',
    'banco modal': 'MODL11.SA',
    'banco bmg': 'BMGB4.SA',
    'banco pactual': 'BPAC11.SA',
    'banco btg': 'BPAC11.SA',
    'banco btg pactual': 'BPAC11.SA',
    'banco daycoval': 'DAYC4.SA',
    'banco indusval': 'IDVL4.SA',
    'banco paulista': 'PLAS3.SA',
    'banco voiter': 'VOIT4.SA',
    'banco banrisul': 'BRSR6.SA',
    'banrisul': 'BRSR6.SA',
    'banco do nordeste': 'BNBR3.SA',
    'banco do estado do pará': 'BPAR3.SA',
    'banco do estado de sergipe': 'BGIP4.SA',
    'banco do estado do espírito santo': 'BEES3.SA',
    'banco do estado de minas gerais': 'BMEB4.SA',
    'banco do estado do rio grande do sul': 'BRSR6.SA',
    'banco do estado de santa catarina': 'BESC4.SA',
    'banco do estado do mato grosso': 'BMTG11.SA',
    'banco do estado do amazonas': 'BAMG3.SA',
    'banco do estado do acre': 'BANE3.SA',
    'banco do estado do amapá': 'BMAP3.SA',
    'banco do estado do ceará': 'BNCA3.SA',
    'banco do estado do maranhão': 'BMAO3.SA',
    'banco do estado do pará': 'BPAR3.SA',
    'banco do estado do piauí': 'BEPI3.SA',
    'banco do estado do rio de janeiro': 'BERJ3.SA',
    'banco do estado do tocantins': 'BTOC3.SA',
    'banco do estado de rondônia': 'BROD3.SA',
    'banco do estado de roraima': 'BROR3.SA',
    'banco do estado de alagoas': 'BNAL3.SA',
    'banco do estado de goiás': 'BGOS3.SA',
    'banco do estado de mato grosso do sul': 'BMSU3.SA',
    'banco do estado de pernambuco': 'BPEP3.SA',
    'banco do estado de paraíba': 'BPAR3.SA',
    'banco do estado de sergipe': 'BGIP4.SA',
    'banco do estado do espírito santo': 'BEES3.SA',
    'banco do estado de minas gerais': 'BMEB4.SA',
    'banco do estado do rio grande do sul': 'BRSR6.SA',
    'banco do estado de santa catarina': 'BESC4.SA',
    'banco do estado do mato grosso': 'BMTG11.SA',
    'banco do estado do amazonas': 'BAMG3.SA',
    'banco do estado do acre': 'BANE3.SA',
    'banco do estado do amapá': 'BMAP3.SA',
    'banco do estado do ceará': 'BNCA3.SA',
    'banco do estado do maranhão': 'BMAO3.SA',
    'banco do estado do pará': 'BPAR3.SA',
    'banco do estado do piauí': 'BEPI3.SA',
    'banco do estado do rio de janeiro': 'BERJ3.SA',
    'banco do estado do tocantins': 'BTOC3.SA',
    'banco do estado de rondônia': 'BROD3.SA',
    'banco do estado de roraima': 'BROR3.SA',
    'banco do estado de alagoas': 'BNAL3.SA',
    'banco do estado de goiás': 'BGOS3.SA',
    'banco do estado de mato grosso do sul': 'BMSU3.SA',
    'banco do estado de pernambuco': 'BPEP3.SA',
    'banco do estado de paraíba': 'BPAR3.SA'
  };
  for (const nome in empresasB3) {
    if (msgLower.includes(nome)) {
      const symbol = empresasB3[nome];
      const apiKey = process.env.FINNHUB_KEY;
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      console.log('[FINNHUB][DEBUG] Consultando empresa:', nome, '| Symbol:', symbol, '| API_KEY:', apiKey, '| URL:', url);
      try {
        const res = await axios.get(url);
        const data = res.data;
        if (data && data.c) {
          const respostaFinal = `${nome.charAt(0).toUpperCase() + nome.slice(1)} (${symbol}): R$ ${Number(data.c).toFixed(2)}. Variação do dia: ${data.dp ? data.dp.toFixed(2) : '0.00'}%. Último fechamento: R$ ${Number(data.pc).toFixed(2)}.`;
          const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
          const payload = { phone, message: respostaFinal };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
          await axios.post(urlW, payload, { headers });
          return res.json({ status: 'sucesso', resposta: respostaFinal });
        } else {
          const respostaFinal = `Não foi possível obter informações atualizadas sobre ${nome}.`;
          const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
          const payload = { phone, message: respostaFinal };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
          await axios.post(urlW, payload, { headers });
          return res.json({ status: 'erro', resposta: respostaFinal });
        }
      } catch (err) {
        if (err.response) {
          console.error('[FINNHUB][ERRO]', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
        } else {
          console.error('[FINNHUB][ERRO]', err.message);
        }
        const respostaFinal = `Erro ao consultar dados da empresa ${nome}.`;
        const urlW = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: respostaFinal };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(urlW, payload, { headers });
        return res.json({ status: 'erro', resposta: respostaFinal });
      }
    }
  }

  let resposta = '';
  // Detecta saudações e responde imediatamente
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'eai', 'opa', 'salve'];
  for (const saudacao of saudacoes) {
    if (msgLower.startsWith(saudacao)) {
      const respostaFinal = 'Olá! Como posso te ajudar com suas finanças hoje?';
      try {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = {
          phone,
          message: respostaFinal
        };
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOKEN}`,
        };
        console.log('[WEBHOOK-WHATS][DEBUG] Enviando resposta para WhatsApp:', { url, payload, headers });
        const resp = await axios.post(url, payload, { headers });
        console.log('[WEBHOOK-WHATS][DEBUG] Resposta da API WhatsApp:', resp.data);
      } catch (err) {
        if (err.response) {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
        } else {
          console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message);
        }
      }
      return res.json({ status: 'sucesso', resposta: respostaFinal });
    }
  }

  async function interpretarMensagemComIA(msg) {
    try {
      const categoriasFixas = [
        'alimentacao', 'moradia', 'transporte', 'lazer', 'assinaturas', 'saude', 'educacao', 'outros'
      ];
      const exemplos = `Exemplos de classificação:
        "café", "café da manhã", "pizza", "almoço", "jantar", "restaurante", "mercado" → alimentacao
    - "aluguel", "água", "energia", "luz", "condomínio", "internet" → moradia
    - "ônibus", "uber", "gasolina", "metrô", "transporte" → transporte
    - "viagem", "cinema", "show", "passeio" → lazer
    - "netflix", "spotify", "prime video", "assinatura" → assinaturas
    - "remédio", "consulta", "exame", "farmácia" → saude
    - "curso", "faculdade", "escola", "livro" → educacao
    - Se não souber, classifique como "outros".
    Nunca crie novas categorias além dessas: ${categoriasFixas.join(', ')}.`;
      const prompt = `Você é um assistente financeiro. Analise a frase do usuário e responda APENAS em JSON, sem explicações.\n\nRegras:\n- Sempre classifique a categoria APENAS em uma das opções: ${categoriasFixas.join(', ')}.\n- Se não souber, use "outros".\n- Sempre extraia o valor exato mencionado, mesmo que seja '500 reais', 'R$ 500', 'cinco mil', etc.\n- Se o valor estiver escrito por extenso, converta para número.\n- Extraia a data mencionada (ex: "dia 03", "ontem", "hoje", "dia 15/04", etc) no campo "data" no formato YYYY-MM-DD. Se não houver data, deixe em branco ou use a data de hoje.\n- Não arredonde, não invente valores.\n- Se o usuário mencionar salário, recebimento, faturamento, entrada de dinheiro, pagamento, dinheiro pingando, dinheiro caiu, dinheiro entrou, qualquer frase sobre dinheiro entrando, sempre responda com uma das intenções: registrar_receita, registrar_recebimento, receber_salario, entrada_dinheiro, faturamento, receber_pagamento, receber_comissao, receber_bonus, receber_rendimento, receber_valor. Nunca apenas com saudação.\n- Se o usuário mencionar o nome de uma conta (ex: 'na conta Banco do Brasil', 'na conta Bradesco', 'lance na conta X'), extraia o nome da conta no campo 'conta'.\n- Se o usuário perguntar saldo de uma conta específica, extraia o nome da conta no campo 'conta'.\n- Se o usuário perguntar quantas contas tem ou quais contas tem, responda com {\"intencao\":\"consulta_contas\"}.\n- Se o usuário perguntar quanto gastou esse mês, quanto foi gasto esse mês, ou variações, responda com {\"intencao\":\"consulta_gastos_mes\"}.\n- Se o usuário perguntar \"com o que mais gastei?\", \"qual categoria mais gastei?\" ou variações, responda com {\"intencao\":\"consulta_categoria_mais_gasta_mes\"}.\n- Se o usuário perguntar quanto faturei esse mês, quanto ganhei esse mês, quanto entrou esse mês, quanto pingou esse mês, quanto recebi esse mês, ou variações, responda com {\"intencao\":\"consulta_faturamento_mes\"}.\n\n${exemplos}\nUsuário: ${msg}\nResposta:`;
      const openaiRes = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'Responda sempre apenas com um JSON válido, sem explicações.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 150
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
          },
        }
      );
      const resposta = openaiRes.data.choices[0].message.content.trim();
      console.log('[WHATSAPP][IA][RAW]', resposta);
      try {
        // Forçar categoria para as fixas
        const parsed = JSON.parse(resposta);
        if (parsed && parsed.categoria) {
          const cat = parsed.categoria.toLowerCase();
          if (!categoriasFixas.includes(cat)) {
            parsed.categoria = 'outros';
          } else {
            parsed.categoria = cat;
          }
        }
        return parsed;
      } catch (e) {
        console.log('[WHATSAPP][IA][ERRO PARSE]', e.message);
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  // Array de intenções de receita
  const intencaoReceita = [
    'registrar_receita',
    'registrar_recebimento',
    'receber_salario',
    'entrada_dinheiro',
    'faturamento',
    'receber_pagamento',
    'receber_comissao',
    'receber_bonus',
    'receber_rendimento',
    'receber_valor',
  ];

  function parseConsulta(msg) {
    if (/quanto (tenho|tem) (na|em) (minha )?conta/i.test(msg)) return 'saldo';
    if (/quanto (gastei|foi gasto|gastei esse mês|gastei no mês)/i.test(msg)) return 'gastos_mes';
    if (/caixinhas|objetivos|poupan(ça|ca)/i.test(msg)) return 'caixinhas';
    if (/contas? a pagar|contas do mês|contas pendentes/i.test(msg)) return 'contas_pagar';
    return null;
  }

  // --- LÓGICA DO WEBHOOK ---
  const intent = await interpretarMensagemComIA(message);
  console.log('[WEBHOOK-WHATS] Intenção identificada pela IA:', intent);
  // Log intent completo para debug
  if (intent) {
    // Saudação simpática
    if (intent.intencao === 'saudacao') {
      resposta = { tipo: 'saudacao' };
    }
    const User = require('../models/User');
    // Buscar usuário pelo telefone
    const user = await User.findOne({ where: { phone: phone } });
    if (!user) {
      console.log('[WEBHOOK-WHATS] Usuário não encontrado para telefone:', phone);
      return res.json({ status: 'erro', motivo: 'usuário não encontrado', phone });
    }
    console.log('[WEBHOOK-WHATS] Usuário encontrado:', user.id);

    // Antes de processar intenções financeiras, verifica estado do trial/assinatura
    const now = new Date();
    let trialExpired = false;
    if (!user.is_subscribed && user.free_trial_started_at) {
      const started = new Date(user.free_trial_started_at);
      const diffMs = now - started;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= 30) {
        trialExpired = true;
      }
    }
    // Se trial expirou e não é assinante, bloqueia intenções financeiras
    const financialIntents = [...intencaoReceita, 'registrar_gasto', 'consulta_contas', 'consulta_despesas', 'consulta_saldo', 'consulta_gastos_mes', 'consulta_faturamento_mes'];
    if (trialExpired && !user.is_subscribed && intent && financialIntents.includes(intent.intencao)) {
      const mensagemAviso = 'Seu período de 30 dias grátis terminou. Para continuar usando o assistente financeiro por WhatsApp, assine o Anota Grana em https://app.anotagrana.com.br/assinatura';
      try {
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone, message: mensagemAviso };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(url, payload, { headers });
      } catch (e) {
        console.error('[WEBHOOK-WHATS][ERRO] Falha ao enviar aviso de expiração de trial:', e.message);
      }
      return res.json({ status: 'bloqueado', motivo: 'trial_expirado', mensagem: mensagemAviso });
    }

    // --- REGISTRAR RECEITA ---
    if (intencaoReceita.includes(intent.intencao)) {
      let conta = null;
      let avisarContaPadrao = false;
      if (intent.conta) {
        conta = await Account.findOne({ where: { user_id: user.id, name: intent.conta } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
          if (!conta) {
            conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
          }
          avisarContaPadrao = true;
        }
      } else {
        conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        avisarContaPadrao = true;
      }
      if (conta && typeof intent.valor === 'number' && !isNaN(intent.valor)) {
        // Forçar categoria fixa
        const categoriasFixas = [
          'alimentacao', 'moradia', 'transporte', 'lazer', 'assinaturas', 'saude', 'educacao', 'outros'
        ];
        let categoriaFinal = (intent.categoria || '').toLowerCase();
        if (!categoriasFixas.includes(categoriaFinal)) {
          categoriaFinal = 'outros';
        }
        // Processar data extraída pela IA e tratar datas relativas
        let dataTransacao = new Date();
        const msgOriginal = (message || '').toLowerCase();
        const hoje = new Date();
        let usarDataRelativa = false;
        if (msgOriginal.includes('ontem')) {
          dataTransacao = new Date(hoje);
          dataTransacao.setDate(hoje.getDate() - 1);
          usarDataRelativa = true;
        } else if (msgOriginal.includes('hoje')) {
          dataTransacao = new Date(hoje);
          usarDataRelativa = true;
        } else if (msgOriginal.includes('amanha') || msgOriginal.includes('amanhã')) {
          dataTransacao = new Date(hoje);
          dataTransacao.setDate(hoje.getDate() + 1);
          usarDataRelativa = true;
        }
        if (!usarDataRelativa && intent.data) {
          // Só usa a data da IA se não for relativa
          const dataFormatada = new Date(intent.data);
          if (!isNaN(dataFormatada)) {
            dataTransacao = dataFormatada;
          }
        }
        console.log('[TRANSACTION][CREATE][INCOME] Dados:', {
          user_id: user.id,
          accountId: conta.id,
          type: 'income',
          amount: intent.valor,
          category: categoriaFinal || 'receita',
          account_name: conta.name,
          date: dataTransacao,
          description: message
        });
        try {
          await Transaction.create({
            user_id: user.id,
            accountId: conta.id,
            type: 'income',
            amount: intent.valor,
            category: categoriaFinal || 'receita',
            account_name: conta.name,
            date: dataTransacao,
            description: message
          });
          console.log('[TRANSACTION][CREATE][INCOME] Sucesso!');
        } catch (err) {
          console.error('[TRANSACTION][CREATE][INCOME][ERRO]', err);
        }
        conta.balance = (conta.balance || 0) + Number(intent.valor);
        await conta.save();
        resposta = {
          tipo: 'registrar_receita',
          valor: intent.valor,
          categoria: categoriaFinal || 'receita',
          conta: conta.name,
          saldo: conta.balance
        };
      } else {
        resposta = { tipo: 'erro', motivo: 'Não foi possível registrar a receita. Conta não encontrada ou valor inválido.' };
      }

      // --- REGISTRAR DESPESA (GASTO) ---
    } else if (
      intent.intencao === 'registrar_gasto' ||
      (
        // Permitir salvar se vier categoria e valor, mesmo sem intencao explícita
        intent.categoria && typeof intent.valor === 'number' && !isNaN(intent.valor)
      )
    ) {
      let conta = null;
      let avisarContaPadrao = false;
      if (intent.conta) {
        conta = await Account.findOne({ where: { user_id: user.id, name: intent.conta } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
          if (!conta) {
            conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
          }
          avisarContaPadrao = true;
        }
      } else {
        conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        avisarContaPadrao = true;
      }
      if (conta && typeof intent.valor === 'number' && !isNaN(intent.valor)) {
        // Forçar categoria fixa
        const categoriasFixas = [
          'alimentacao', 'moradia', 'transporte', 'lazer', 'assinaturas', 'saude', 'educacao', 'outros'
        ];
        let categoriaFinal = (intent.categoria || '').toLowerCase();
        if (!categoriasFixas.includes(categoriaFinal)) {
          categoriaFinal = 'outros';
        }
        // Processar data extraída pela IA e tratar datas relativas
        let dataTransacao = new Date();
        const msgOriginal = (message || '').toLowerCase();
        const hoje = new Date();
        let usarDataRelativa = false;
        if (msgOriginal.includes('ontem')) {
          dataTransacao = new Date(hoje);
          dataTransacao.setDate(hoje.getDate() - 1);
          usarDataRelativa = true;
        } else if (msgOriginal.includes('hoje')) {
          dataTransacao = new Date(hoje);
          usarDataRelativa = true;
        } else if (msgOriginal.includes('amanha') || msgOriginal.includes('amanhã')) {
          dataTransacao = new Date(hoje);
          dataTransacao.setDate(hoje.getDate() + 1);
          usarDataRelativa = true;
        }
        if (!usarDataRelativa && intent.data) {
          // Só usa a data da IA se não for relativa
          const dataFormatada = new Date(intent.data);
          if (!isNaN(dataFormatada)) {
            dataTransacao = dataFormatada;
          }
        }
        console.log('[TRANSACTION][CREATE][EXPENSE] Dados:', {
          user_id: user.id,
          accountId: conta.id,
          type: 'expense',
          amount: intent.valor,
          category: categoriaFinal || 'despesa',
          account_name: conta.name,
          date: dataTransacao,
          description: message
        });
        try {
          await Transaction.create({
            user_id: user.id,
            accountId: conta.id,
            type: 'expense',
            amount: intent.valor,
            category: categoriaFinal || 'despesa',
            account_name: conta.name,
            date: dataTransacao,
            description: message
          });
          console.log('[TRANSACTION][CREATE][EXPENSE] Sucesso!');
        } catch (err) {
          console.error('[TRANSACTION][CREATE][EXPENSE][ERRO]', err);
        }
        conta.balance = (conta.balance || 0) - Number(intent.valor);
        await conta.save();
        resposta = {
          tipo: 'registrar_gasto',
          valor: intent.valor,
          categoria: categoriaFinal || 'despesa',
          conta: conta.name,
          saldo: conta.balance
        };
      } else {
        resposta = { tipo: 'erro', motivo: 'Não foi possível registrar a despesa. Conta não encontrada ou valor inválido.' };
      }

    } else if (intent.intencao === 'consulta_contas') {
      // Verifica se a mensagem é sobre contas a pagar
      const msgLower = (message || '').toLowerCase();
      if (
        msgLower.includes('conta a pagar') ||
        msgLower.includes('contas a pagar') ||
        msgLower.includes('contas pendentes') ||
        msgLower.includes('conta pendente') ||
        msgLower.includes('tenho alguma conta') ||
        msgLower.includes('tenho contas para pagar')
      ) {
        // Busca contas a pagar (Bills) pendentes
        const contasPagar = await Bill.findAll({ where: { user_id: user.id, status: 'pending' } });
        resposta = {
          tipo: 'consulta_contas_pagar',
          contas: contasPagar.map(b => ({
            descricao: b.description,
            valor: b.amount,
            vencimento: b.dueDate,
            categoria: b.category,
            status: b.status
          }))
        };
      } else if (intent.conta) {
        // Se especificou uma conta, retorna saldo dessa conta
        const conta = await Account.findOne({ where: { user_id: user.id, name: intent.conta } });
        if (conta) {
          resposta = { tipo: 'consulta_contas', contas: [{ conta: conta.name, saldo: conta.balance }] };
        } else {
          resposta = { tipo: 'consulta_contas', contas: [] };
        }
      } else {
        // Se não especificou, retorna todas as contas com saldo
        const contas = await Account.findAll({ where: { user_id: user.id } });
        resposta = { tipo: 'consulta_contas', contas: contas.map(c => ({ conta: c.name, saldo: c.balance })) };
      }
    } else if (
      intent.intencao === 'consulta_despesas' ||
      intent.intencao === 'consulta_despesa' ||
      intent.intencao === 'consulta_gastos' ||
      intent.intencao === 'consulta_gasto'
    ) {
      // Consulta despesas totais do usuário
      const totalDespesas = await Transaction.sum('amount', { where: { user_id: user.id, type: 'expense' } });
      const despesas = await Transaction.findAll({ where: { user_id: user.id, type: 'expense' }, order: [['date', 'DESC']] });
      resposta = {
        tipo: 'consulta_despesas',
        total: totalDespesas || 0,
        despesas: despesas.map(d => ({ valor: d.amount, categoria: d.category, conta: d.account_name, data: d.date }))
      };
    } else if (intent.intencao === 'consulta_saldo') {
      let conta = null;
      if (intent.conta) {
        conta = await Account.findOne({ where: { user_id: user.id, name: intent.conta } });
      }
      if (!conta) {
        // Se não especificou conta, retorna todas as contas do usuário com saldo
        const contas = await Account.findAll({ where: { user_id: user.id } });
        resposta = { tipo: 'consulta_saldo', contas: contas.map(c => ({ conta: c.name, saldo: c.balance })) };
      } else {
        resposta = { tipo: 'consulta_saldo', conta: conta.name, saldo: conta.balance };
      }
    } else if (intent.intencao === 'consulta_gastos_mes') {
      const gastos = await Transaction.findAll({ where: { user_id: user.id, type: 'expense', date: { [Op.gte]: literal("DATE_FORMAT(NOW(), '%Y-%m-01')") } } });
      resposta = { tipo: 'consulta_gastos_mes', gastos: gastos.map(g => ({ valor: g.amount, categoria: g.category })) };
    } else if (intent.intencao === 'consulta_faturamento_mes') {
      const faturamento = await Transaction.findAll({ where: { user_id: user.id, type: 'income', date: { [Op.gte]: literal("DATE_FORMAT(NOW(), '%Y-%m-01')") } } });
      resposta = { tipo: 'consulta_faturamento_mes', receitas: faturamento.map(f => ({ valor: f.amount, categoria: f.category })) };
    } else {
      // Se não reconheceu intenção financeira, envie só a mensagem original para a IA
      resposta = null;
    }
  } else {
    // Se não reconheceu intenção financeira, envie só a mensagem original para a IA
    resposta = null;
  }


  // Enviar resposta de volta pelo WhatsApp (usando a W-API)
  // Se a resposta for cotação do dólar, envie diretamente
  if (resposta && resposta.tipo === 'cotacao_dolar') {
    let respostaFinal = '';
    if (resposta.cotacao) {
      respostaFinal = `A cotação atual do dólar é R$ ${Number(resposta.cotacao).toFixed(2)}`;
    } else {
      respostaFinal = resposta.erro || 'Não foi possível obter a cotação do dólar no momento.';
    }
    try {
      const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
      const payload = {
        phone,
        message: respostaFinal
      };
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOKEN}`,
      };
      console.log('[WEBHOOK-WHATS][DEBUG] Enviando resposta para WhatsApp:', { url, payload, headers });
      const resp = await axios.post(url, payload, { headers });
      console.log('[WEBHOOK-WHATS][DEBUG] Resposta da API WhatsApp:', resp.data);
    } catch (err) {
      if (err.response) {
        console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
      } else {
        console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message);
      }
    }
    return res.json({ status: 'sucesso', resposta: respostaFinal });
  }

  // Chamar a IA para montar a resposta final
  let respostaFinal = '';
  try {
    let prompt = '';
    const categoriasFixas = [
      'alimentacao', 'moradia', 'transporte', 'lazer', 'assinaturas', 'saude', 'educacao', 'outros'
    ];
    const exemplos = `Exemplos de classificação:
    - "café", "café da manhã", "pizza", "almoço", "jantar", "restaurante", "mercado" → alimentacao
    - "aluguel", "água", "energia", "luz", "condomínio", "internet" → moradia
    - "ônibus", "uber", "gasolina", "metrô", "transporte" → transporte
    - "viagem", "cinema", "show", "passeio" → lazer
    - "netflix", "spotify", "prime video", "assinatura" → assinaturas
    - "remédio", "consulta", "exame", "farmácia" → saude
    - "curso", "faculdade", "escola", "livro" → educacao
    - Se não souber, classifique como "outros".
    Nunca crie novas categorias além dessas: ${categoriasFixas.join(', ')}.`;
    if (resposta) {
      prompt = `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Só se apresente como Thayná, assistente financeira do sistema Anota Grana, se for a primeira interação, se o usuário pedir, ou se for relevante para a resposta. Evite repetir seu nome ou apresentação em toda resposta. Nunca inicie a resposta com 'Olá', 'Oi', 'Bom dia', 'Boa tarde', 'Boa noite' ou qualquer saudação. Seja direto e objetivo, sem cumprimentos. Sempre classifique despesas em uma das categorias fixas: ${categoriasFixas.join(', ')}. ${exemplos} Com base nos dados abaixo e na mensagem do usuário, responda de forma clara, útil, personalizada e natural. Se for erro, explique de forma amigável. Dados: ${JSON.stringify(resposta)}. Mensagem do usuário: ${message}`;
    } else {
      prompt = `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Só se apresente como Thayná, assistente financeira do sistema Anota Grana, se for a primeira interação, se o usuário pedir, ou se for relevante para a resposta. Evite repetir seu nome ou apresentação em toda resposta. Nunca inicie a resposta com 'Olá', 'Oi', 'Bom dia', 'Boa tarde', 'Boa noite' ou qualquer saudação. Seja direto e objetivo, sem cumprimentos. Sempre classifique despesas em uma das categorias fixas: ${categoriasFixas.join(', ')}. ${exemplos} Se a pergunta não for sobre finanças, responda normalmente como uma IA simpática e útil, mas sem cumprimentos. Mensagem do usuário: ${message}`;
    }
    respostaFinal = await callOpenAI({
      messages: [
        { role: 'system', content: prompt }
      ],
      max_tokens: 200,
      apiKey: OPENAI_KEY
    });
    const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
    const payload = {
      phone,
      message: respostaFinal
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TOKEN}`,
    };
    console.log('[WEBHOOK-WHATS][DEBUG] Enviando resposta para WhatsApp:', { url, payload, headers });
    const resp = await axios.post(url, payload, { headers });
    console.log('[WEBHOOK-WHATS][DEBUG] Resposta da API WhatsApp:', resp.data);
  } catch (err) {
    if (err.response) {
      console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message, '| Status:', err.response.status, '| Data:', err.response.data);
    } else {
      console.error('[WEBHOOK-WHATS][ERRO] Erro ao enviar resposta:', err.message);
    }
    respostaFinal = 'Desculpe, não consegui gerar uma resposta no momento.';
  }

  res.json({ status: 'sucesso', resposta: respostaFinal });
});

// Aqui você pode adicionar outras rotas relacionadas ao WhatsApp/IA

module.exports = router;
