const express = require('express');
const axios = require('axios');
const router = express.Router();
const asaas = require('../services/asaas');
const { User, SubscriptionEvent } = require('../models');

// Criar cliente
router.post('/clientes', async (req, res) => {
  const { name, cpfCnpj, email, mobilePhone } = req.body;
  // sanitize phone: keep only digits and ensure country code (55) if missing
  let sanitizedPhone = (mobilePhone || '').toString().replace(/\D/g, '');
  if (sanitizedPhone && !sanitizedPhone.startsWith('55')) {
    // If local number (10 or 11 digits), prefix with country code 55
    if (sanitizedPhone.length === 10 || sanitizedPhone.length === 11) {
      sanitizedPhone = '55' + sanitizedPhone;
    }
  }
  // if sanitizedPhone is empty, keep as undefined
  const mobilePhoneForAsaas = sanitizedPhone || undefined;
  // Tenta encontrar um usuário local pelo email ou telefone para usar como externalReference
  let externalReference = null;
  try {
    // Se já existe usuário local com asaas_customer_id, retorne ele sem criar duplicado no Asaas
    if (email) {
      const u = await User.findOne({ where: { email } });
      if (u) {
        if (u.asaas_customer_id) return res.json({ id: u.asaas_customer_id, message: 'existing_customer' });
        externalReference = String(u.id);
      }
    }
    if (!externalReference && mobilePhone) {
      const u2 = await User.findOne({ where: { phone: mobilePhone } });
      if (u2) {
        if (u2.asaas_customer_id) return res.json({ id: u2.asaas_customer_id, message: 'existing_customer' });
        externalReference = String(u2.id);
      }
    }
  } catch (e) {
    console.error('[ASAAS][CREATE_CLIENT][USER_LOOKUP_ERR]', e.message || e);
  }

  const result = await asaas.criarCliente({ name, cpfCnpj, email, mobilePhone: mobilePhoneForAsaas, externalReference });
  if (result.error) return res.status(result.status || 500).json(result);
  // Se criou o cliente no Asaas e retornou id, salve no usuário local (se mapeado)
  try {
    if (result.id && externalReference) {
      const user = await User.findByPk(Number(externalReference));
      if (user) {
        user.asaas_customer_id = result.id;
        await user.save();
      }
    }
  } catch (e) {
    console.error('[ASAAS][CREATE_CLIENT][SAVE_ERR]', e.message || e);
  }
  res.json(result);
});

// Criar cobrança Pix (resposta resumida)
router.post('/cobrancas/pix', async (req, res) => {
  let { customer, value, dueDate, description, externalReference } = req.body;
  // Se o cliente for um email ou telefone, tente mapear para user.id
  try {
    if (!externalReference && customer) {
      // tenta achar user por email
      let u = await User.findOne({ where: { email: customer } });
      if (!u) u = await User.findOne({ where: { phone: customer } });
      if (u) externalReference = String(u.id);
    }
  } catch (e) {
    console.error('[ASAAS][CREATE_CHARGE_PIX][USER_LOOKUP_ERR]', e.message || e);
  }
  const result = await asaas.criarCobrancaPixResumida({ customer, value, dueDate, description, externalReference });
  if (result.error) return res.status(result.status || 500).json(result);
  res.json(result);
});

// Criar cobrança cartão (resposta resumida)
router.post('/cobrancas/cartao', async (req, res) => {
  let { customer, value, dueDate, description, externalReference, creditCard, creditCardHolderInfo, remoteIp } = req.body;
  try {
    if (!externalReference && customer) {
      let u = await User.findOne({ where: { email: customer } });
      if (!u) u = await User.findOne({ where: { phone: customer } });
      if (u) externalReference = String(u.id);
    }
  } catch (e) {
    console.error('[ASAAS][CREATE_CHARGE_CARD][USER_LOOKUP_ERR]', e.message || e);
  }
  const result = await asaas.criarCobrancaCartaoResumida({ customer, value, dueDate, description, externalReference, creditCard, creditCardHolderInfo, remoteIp });
  if (result.error) return res.status(result.status || 500).json(result);
  res.json(result);
});

// Criar assinatura (wrapper) - cria a cobrança inicial e registra assinatura local se retorno indicar
router.post('/subscriptions', async (req, res) => {
  const { userId, customer, value, description, billingCycle, dueDate, creditCard, creditCardHolderInfo, creditCardToken } = req.body;
  try {
    // Monta payload para Asaas
    const payload = {
      customer,
      billingType: 'CREDIT_CARD',
      value,
      dueDate,
      description
    };
    if (creditCardToken) payload.creditCardToken = creditCardToken;
    else if (creditCard) {
      payload.creditCard = creditCard;
      payload.creditCardHolderInfo = creditCardHolderInfo;
    }

    const result = await asaas.criarCobrancaCartaoResumida(payload);
    if (result.error) return res.status(result.status || 500).json(result);

    // Se retornar subscription info, salva no user local
    try {
      if (result.subscriptionId && userId) {
        const user = await User.findByPk(Number(userId));
        if (user) {
          user.asaas_subscription_id = result.subscriptionId;
          await user.save();
        }
      }
    } catch (e) {
      console.error('[ASAAS][CREATE_SUBSCRIPTION][SAVE_ERR]', e.message || e);
    }

    res.json(result);
  } catch (e) {
    console.error('[ASAAS][CREATE_SUBSCRIPTION][ERR]', e.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Criar assinatura diretamente no Asaas (POST /subscriptions)
router.post('/subscriptions/create', async (req, res) => {
  const { customer, billingType, nextDueDate, value, cycle, description, remoteIp, userId, creditCard, creditCardHolderInfo, creditCardToken } = req.body;
  try {
    const result = await asaas.criarAssinatura({ customer, billingType, nextDueDate, value, cycle, description, remoteIp, creditCard, creditCardHolderInfo, creditCardToken });
    if (result.error) return res.status(result.status || 500).json(result);
    // Salva subscription id no user local se possível
    try {
      if (result.id && userId) {
        const user = await User.findByPk(Number(userId));
        if (user) {
          user.asaas_subscription_id = result.id;
          await user.save();
        }
      }
    } catch (e) {
      console.error('[ASAAS][CREATE_ASSINATURA][SAVE_ERR]', e.message || e);
    }
    res.json(result);
  } catch (e) {
    console.error('[ASAAS][CREATE_ASSINATURA][ERR]', e.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Recuperar cobranças de uma assinatura
router.get('/subscriptions/:id/payments', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await asaas.getSubscriptionPayments(id);
    if (result.error) return res.status(result.status || 500).json(result);
    res.json(result);
  } catch (e) {
    console.error('[ASAAS][GET_SUBSCRIPTION_PAYMENTS][ERR]', e.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Obter QR Code Pix de uma cobrança
router.get('/cobrancas/:id/pixQrCode', async (req, res) => {
  const { id } = req.params;
  const result = await asaas.getPixQrCode(id);
  if (result.error) return res.status(result.status || 500).json(result);
  res.json(result);
});

// Listar recorrências Pix
router.get('/recorrencias/pix', async (req, res) => {
  const { offset, limit, status, value, searchText } = req.query;
  const result = await asaas.listarRecorrenciasPix({ offset, limit, status, value, searchText });
  if (result.error) return res.status(result.status || 500).json(result);
  res.json(result);
});

// Webhook para receber notificações do Asaas (pagamentos/cobrancas)
// Configure a URL no painel do Asaas apontando para: https://seu-dominio/asaas/webhook
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    // sanitize payload to avoid storing sensitive card data
    function sanitizePayload(obj) {
      try {
        const copy = JSON.parse(JSON.stringify(obj));
        function walk(o) {
          if (!o || typeof o !== 'object') return;
          for (const k of Object.keys(o)) {
            if (/card|creditCard|ccv|cvv|number/i.test(k)) {
              // remove sensitive fields
              delete o[k];
              continue;
            }
            // mask numbers inside strings (card numbers)
            if (typeof o[k] === 'string') {
              const s = o[k];
              const digits = s.replace(/\D/g, '');
              if (digits.length >= 12 && digits.length <= 19) {
                o[k] = '**** **** **** ' + digits.slice(-4);
                continue;
              }
            }
            walk(o[k]);
          }
        }
        walk(copy);
        return copy;
      } catch (e) {
        return {};
      }
    }
    // Tenta extrair o objeto de pagamento de formas diferentes (dependendo do tipo de webhook)
    const payment = body.payment || body.data || body;

    // Tenta extrair externalReference (pode vir como externalReference ou external_reference)
    const externalReference = payment && (payment.externalReference || payment.external_reference || (payment.customer && (payment.customer.externalReference || payment.customer.external_reference)));

    let user = null;
    if (externalReference) {
      // Se for id numérico, busca por PK
      if (/^\d+$/.test(String(externalReference))) {
        user = await User.findByPk(Number(externalReference));
      }
      // Se não encontrou, tenta por e-mail ou telefone
      if (!user) {
        user = await User.findOne({ where: { email: externalReference } });
      }
      if (!user) {
        user = await User.findOne({ where: { phone: externalReference } });
      }
    }

    // Se não há externalReference, tenta usar os dados do customer no payload
    if (!user && payment && payment.customer) {
      const cust = payment.customer;
      if (cust.email) user = await User.findOne({ where: { email: cust.email } });
      if (!user && cust.mobilePhone) user = await User.findOne({ where: { phone: cust.mobilePhone } });
      if (!user && cust.mobile_phone) user = await User.findOne({ where: { phone: cust.mobile_phone } });
    }

    if (!user) {
      console.log('[ASAAS][WEBHOOK] Usuário não encontrado para payload Asaas. externalReference:', externalReference);
      // Grava evento sem user_id para investigação (payload sanitizado)
      const safeBody = sanitizePayload(body);
      await SubscriptionEvent.create({
        user_id: null,
        asaas_event: payment.event || null,
        asaas_payment_id: payment.id || null,
        asaas_customer_id: (payment.customer && (payment.customer.id || payment.customer.customerId)) || null,
        status: payment.status || null,
        amount: payment.value || payment.amount || null,
        raw_payload: safeBody
      }).catch(e => console.error('[ASAAS][WEBHOOK][EVENT_SAVE_ERR]', e.message || e));
      // Responde 200 para evitar retries do Asaas
      return res.status(200).json({ ok: true, message: 'user_not_found' });
    }

    // Tenta determinar status a partir do payload
    let status = (payment && (payment.status || payment.paymentStatus || payment.statusTitle || payment.event)) || null;
    const paidStatuses = ['CONFIRMED', 'PAID', 'RECEIVED', 'RECEBIDO', 'CONFIRMED_AND_PROCESSING'];

    // Se houver um payment.id, confirme o status diretamente na API do Asaas para evitar falsos positivos
    try {
      const paymentId = payment && (payment.id || payment.paymentId || payment.asaasPaymentId);
      if (paymentId) {
        const remote = await asaas.getPayment(paymentId);
        if (!remote.error) {
          status = remote.status || status;
        }
      }
    } catch (err) {
      console.error('[ASAAS][WEBHOOK][VERIFY_PAYMENT_ERR]', err.message || err);
    }

    const statusUpper = status ? String(status).toUpperCase() : null;

    // Salva o evento recebido (raw)
    try {
      const safeBody = sanitizePayload(body);
      await SubscriptionEvent.create({
        user_id: user.id,
        asaas_event: payment.event || null,
        asaas_payment_id: payment.id || null,
        asaas_customer_id: (payment.customer && (payment.customer.id || payment.customer.customerId)) || null,
        status: payment.status || null,
        amount: payment.value || payment.amount || null,
        raw_payload: safeBody
      });
    } catch (e) {
      console.error('[ASAAS][WEBHOOK][EVENT_SAVE_ERR]', e.message || e);
    }

    if (statusUpper && paidStatuses.includes(statusUpper)) {
      // Marca usuário como assinante
      user.is_subscribed = true;
      await user.save();

      // Envia mensagem de confirmação via WhatsApp
      try {
        const mensagem = 'Obrigado! Sua assinatura foi ativada. A assistente financeira voltou a responder normalmente.';
        const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
        const payload = { phone: user.phone, message: mensagem };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` };
        await axios.post(url, payload, { headers });
      } catch (whatsErr) {
        console.error('[ASAAS][WEBHOOK][WHATSAPP][ERRO] ao enviar mensagem:', whatsErr.message || whatsErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ASAAS][WEBHOOK][ERRO]', err.message || err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

