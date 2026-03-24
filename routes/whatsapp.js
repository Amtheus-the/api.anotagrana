console.log('[DEBUG] OPENAI_KEY:', process.env.OPENAI_KEY);
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { callOpenAI } = require('../services/openai');

const router = express.Router();

const INSTANCE_ID = process.env.INSTANCE_ID;
const TOKEN = process.env.TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// Endpoint para conversar com a IA (OpenAI) diretamente
router.post('/enviar-whats', async (req, res) => {
  console.log('[ROUTE][DEBUG] /enviar-whats chamada', JSON.stringify(req.body));
  const { phone, message } = req.body;
  try {
    const resposta = await callOpenAI({
      messages: [
        { role: 'system', content: 'Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Sempre se apresente como Thayná, assistente financeira do sistema Anota grana. Responda de forma clara, útil e personalizada.' },
        { role: 'user', content: message }
      ],
      max_tokens: 200,
      apiKey: OPENAI_KEY
    });
    res.json({ message: resposta });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  // Extrair phone e message do payload ANTES do filtro
  if (body.sender && body.sender.id) {
    phone = body.sender.id;
  } else if (body.chat && body.chat.id) {
    phone = body.chat.id;
  }
  if (body.msgContent) {
    if (body.msgContent.conversation) {
      message = body.msgContent.conversation;
    } else if (body.msgContent.extendedTextMessage && body.msgContent.extendedTextMessage.text) {
      message = body.msgContent.extendedTextMessage.text;
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
  let resposta = '';

  // Fallback para saudações simples ANTES de chamar a IA
  const msgLower = (message || '').toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '');
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'eai', 'opa', 'salve'];
  if (saudacoes.some(s => msgLower.startsWith(s))) {
    resposta = { tipo: 'saudacao' };
  }

  async function interpretarMensagemComIA(msg) {
    try {
  const prompt = `Você é um assistente financeiro. Analise a frase do usuário e responda APENAS em JSON, sem explicações.\n\nRegras:\n- Sempre extraia o valor exato mencionado, mesmo que seja '500 reais', 'R$ 500', 'cinco mil', etc.\n- Se o valor estiver escrito por extenso, converta para número.\n- Não arredonde, não invente valores.\n- Se o usuário mencionar salário, recebimento, faturamento, entrada de dinheiro, pagamento, dinheiro pingando, dinheiro caiu, dinheiro entrou, qualquer frase sobre dinheiro entrando, sempre responda com uma das intenções: registrar_receita, registrar_recebimento, receber_salario, entrada_dinheiro, faturamento, receber_pagamento, receber_comissao, receber_bonus, receber_rendimento, receber_valor. Nunca apenas com saudação.\n- Se o usuário mencionar o nome de uma conta (ex: 'na conta Banco do Brasil', 'na conta Bradesco', 'lance na conta X'), extraia o nome da conta no campo 'conta'.\n- Se o usuário perguntar saldo de uma conta específica, extraia o nome da conta no campo 'conta'.\n- Se o usuário perguntar quantas contas tem ou quais contas tem, responda com {\"intencao\":\"consulta_contas\"}.\n- Se o usuário perguntar quanto gastou esse mês, quanto foi gasto esse mês, ou variações, responda com {\"intencao\":\"consulta_gastos_mes\"}.\n- Se o usuário perguntar \"com o que mais gastei?\", \"qual categoria mais gastei?\" ou variações, responda com {\"intencao\":\"consulta_categoria_mais_gasta_mes\"}.\n- Se o usuário perguntar quanto faturei esse mês, quanto ganhei esse mês, quanto entrou esse mês, quanto pingou esse mês, quanto recebi esse mês, ou variações, responda com {\"intencao\":\"consulta_faturamento_mes\"}.\n\nExemplos:\nUsuário: Meu salário caiu hoje\nResposta: {\"intencao\":\"receber_salario\",\"valor\":3000,\"categoria\":\"salário\"}\nUsuário: Recebi 5000 de comissão\nResposta: {\"intencao\":\"receber_comissao\",\"valor\":5000,\"categoria\":\"comissão\"}\nUsuário: Entrou 200 reais na minha conta\nResposta: {\"intencao\":\"entrada_dinheiro\",\"valor\":200}\nUsuário: Faturei 10 mil esse mês\nResposta: {\"intencao\":\"faturamento\",\"valor\":10000,\"categoria\":\"faturamento\"}\nUsuário: Dinheiro pingou na conta\nResposta: {\"intencao\":\"entrada_dinheiro\",\"valor\":3000}\nUsuário: Gastei 30 reais no mercado\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":30,\"categoria\":\"mercado\"}\nUsuário: Recebi 1000 de salário\nResposta: {\"intencao\":\"receber_salario\",\"valor\":1000,\"categoria\":\"salário\"}\nUsuário: Acabei de tomar um café de 500 reais\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":500,\"categoria\":\"café\"}\nUsuário: Paguei cinco mil de aluguel\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":5000,\"categoria\":\"aluguel\"}\nUsuário: Meu salário de 3 mil caiu na conta Bradesco\nResposta: {\"intencao\":\"receber_salario\",\"valor\":3000,\"categoria\":\"salário\",\"conta\":\"Bradesco\"}\nUsuário: Lance meu salário na conta Banco do Brasil\nResposta: {\"intencao\":\"receber_salario\",\"valor\":3000,\"categoria\":\"salário\",\"conta\":\"Banco do Brasil\"}\nUsuário: Acabei de gastar 80 reais em gasolina\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":80,\"categoria\":\"gasolina\"}\nUsuário: Quais caixinhas eu tenho?\nResposta: {\"intencao\":\"consulta_caixinhas\"}\nUsuário: ${msg}\nResposta:`;
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
        return JSON.parse(resposta);
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
        await Transaction.create({
          user_id: user.id,
          accountId: conta.id,
          type: 'income',
          amount: intent.valor,
          category: intent.categoria || 'receita',
          account_name: conta.name,
          date: new Date(),
          description: message
        });
        conta.balance = (conta.balance || 0) + Number(intent.valor);
        await conta.save();
        resposta = {
          tipo: 'registrar_receita',
          valor: intent.valor,
          categoria: intent.categoria || 'receita',
          conta: conta.name,
          saldo: conta.balance
        };
      } else {
        resposta = { tipo: 'erro', motivo: 'Não foi possível registrar a receita. Conta não encontrada ou valor inválido.' };
      }

    // --- REGISTRAR DESPESA (GASTO) ---
    } else if (intent.intencao === 'registrar_gasto') {
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
        await Transaction.create({
          user_id: user.id,
          accountId: conta.id,
          type: 'expense',
          amount: intent.valor,
          category: intent.categoria || 'despesa',
          account_name: conta.name,
          date: new Date(),
          description: message
        });
        conta.balance = (conta.balance || 0) - Number(intent.valor);
        await conta.save();
        resposta = {
          tipo: 'registrar_gasto',
          valor: intent.valor,
          categoria: intent.categoria || 'despesa',
          conta: conta.name,
          saldo: conta.balance
        };
      } else {
        resposta = { tipo: 'erro', motivo: 'Não foi possível registrar a despesa. Conta não encontrada ou valor inválido.' };
      }

    } else if (intent.intencao === 'consulta_contas') {
      if (intent.conta) {
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
  // Chamar a IA para montar a resposta final
  let respostaFinal = '';
  try {
    let prompt = '';
    if (resposta) {
      prompt = `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Só se apresente como Thayná, assistente financeira do sistema Anota Grana, se for a primeira interação, se o usuário pedir, ou se for relevante para a resposta. Evite repetir seu nome ou apresentação em toda resposta. Com base nos dados abaixo e na mensagem do usuário, responda de forma clara, útil, personalizada e natural. Se for saudação, cumprimente o usuário. Se for erro, explique de forma amigável. Dados: ${JSON.stringify(resposta)}. Mensagem do usuário: ${message}`;
    } else {
      prompt = `Você é Thayná, uma assistente financeira simpática, objetiva e profissional. Só se apresente como Thayná, assistente financeira do sistema Anota Grana, se for a primeira interação, se o usuário pedir, ou se for relevante para a resposta. Evite repetir seu nome ou apresentação em toda resposta. Se a pergunta não for sobre finanças, responda normalmente como uma IA simpática e útil. Mensagem do usuário: ${message}`;
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
