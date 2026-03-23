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
  // Filtro para evitar loop: só processa mensagens com texto e phone igual ao autorizado (sem sufixos)
  const PHONES_AUTORIZADOS = ['11986387651', '5511986387651'];
  if (!message || !PHONES_AUTORIZADOS.includes(phone)) {
    console.log('[WEBHOOK-WHATS][LOOP PROTECTION] Ignorando mensagem automática ou número não autorizado:', { phone, message });
    return res.json({ status: 'ignorado', motivo: 'mensagem automática ou número não autorizado', phone, message });
  }
  console.log('[WEBHOOK-WHATS] phone:', phone);
  console.log('[WEBHOOK-WHATS] message:', message);
  if (phone !== '11986387651' && phone !== '5511986387651') {
    console.log('[WEBHOOK-WHATS] Ignorando mensagem de número não autorizado:', phone);
    return res.json({ status: 'ignorado', motivo: 'número não autorizado', phone });
  }
  let resposta = '';

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
    const User = require('../models/User');
    // Buscar usuário pelo telefone
    const user = await User.findOne({ where: { phone: phone } });
    if (!user) {
      console.log('[WEBHOOK-WHATS] Usuário não encontrado para telefone:', phone);
      return res.json({ status: 'erro', motivo: 'usuário não encontrado', phone });
    }
    console.log('[WEBHOOK-WHATS] Usuário encontrado:', user.id);
    if (intencaoReceita.includes(intent.intencao)) {
      // Se especificou conta, busca pelo nome; senão, pega a conta principal (isMain) ou a primeira conta
      let conta = null;
      let avisarContaPadrao = false;
      if (intent.conta) {
        conta = await Account.findOne({ where: { user_id: user.id, name: intent.conta } });
        if (!conta) {
          console.log('[WHATSAPP][DEBUG] Conta informada não encontrada:', intent.conta);
          conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
          if (!conta) {
            console.log('[WHATSAPP][DEBUG] Conta principal não encontrada, buscando primeira conta cadastrada');
            conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
          } else {
            console.log('[WHATSAPP][DEBUG] Conta principal encontrada:', conta.name);
          }
          avisarContaPadrao = true;
        }
      } else {
        conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          console.log('[WHATSAPP][DEBUG] Conta principal não encontrada, buscando primeira conta cadastrada');
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        } else {
          console.log('[WHATSAPP][DEBUG] Conta principal encontrada:', conta.name);
        }
        avisarContaPadrao = true;
      }
      console.log('[WEBHOOK-WHATS] Conta selecionada:', conta ? conta.name : 'Nenhuma', '| isMain:', conta ? conta.isMain : 'N/A');
      if (conta) {
        console.log('[DEBUG] Antes de criar transação:', {
          userId: user.id,
          accountId: conta.id,
          valor: intent.valor,
          saldoAtual: conta.balance,
          nomeConta: conta.name
        });
        await Transaction.create({
          userId: user.id,
          accountId: conta.id,
          type: 'income',
          amount: intent.valor,
          category: intent.categoria || 'receita',
          account_name: conta.name,
          date: new Date(),
          description: message
        });
        console.log('[DEBUG] Transação criada. Atualizando saldo...');
        const saldoAntes = conta.balance;
        conta.balance = (conta.balance || 0) + Number(intent.valor);
        console.log('[DEBUG] Saldo antes:', saldoAntes, '| Valor:', intent.valor, '| Saldo depois:', conta.balance);
        await conta.save();
        console.log('[DEBUG] Conta salva:', {
          id: conta.id,
          saldoFinal: conta.balance
        });
        resposta = `Receita de R$ ${intent.valor} registrada na conta ${conta.name}. Saldo atualizado.`;
        if (avisarContaPadrao) {
          resposta += ' (Lançado na conta principal. Se quiser lançar em outra, informe o nome da conta na mensagem)';
        }
      } else {
        resposta = 'Não foi possível identificar uma conta para registrar a receita.';
      }
    } else if (intent.intencao === 'consulta_contas') {
      const contas = await Account.findAll({ where: { userId: user.id } });
      resposta = `Suas contas cadastradas: ${contas.map(c => c.name).join(', ')}.`;
    } else if (intent.intencao === 'consulta_saldo') {
      const conta = intent.conta ? await Account.findOne({ where: { userId: user.id, name: intent.conta } }) : null;
      if (conta) {
        resposta = `O saldo da sua conta ${conta.name} é ${conta.saldo}.`;
      } else {
        resposta = `Seu saldo é ${user.saldo}.`;
      }
    } else if (intent.intencao === 'consulta_gastos_mes') {
      const gastos = await Transaction.findAll({ where: { userId: user.id, type: 'expense', createdAt: { [Op.gte]: literal('DATE_TRUNC(\'month\', NOW())') } } });
      resposta = `Seus gastos este mês foram: ${gastos.map(g => `${g.valor} (${g.category})`).join(', ')}.`;
    } else if (intent.intencao === 'consulta_categoria_mais_gasta_mes') {
      const categoria = await Transaction.findOne({ where: { userId: user.id, type: 'expense', createdAt: { [Op.gte]: literal('DATE_TRUNC(\'month\', NOW())') } }, attributes: ['category', [sequelize.fn('sum', sequelize.col('valor')), 'total']], group: ['category'], order: [[sequelize.fn('sum', sequelize.col('valor')), 'DESC']], limit: 1 });
      resposta = `A categoria que você mais gastou esse mês foi ${categoria.category} (${categoria.total}).`;
    } else if (intent.intencao === 'consulta_faturamento_mes') {
      const faturamento = await Transaction.findAll({ where: { userId: user.id, type: 'income', createdAt: { [Op.gte]: literal('DATE_TRUNC(\'month\', NOW())') } } });
      resposta = `Seu faturamento este mês foi: ${faturamento.map(f => `${f.valor} (${f.category})`).join(', ')}.`;
    } else {
      resposta = 'Desculpe, não consegui entender sua solicitação.';
    }
  } else {
    resposta = 'Desculpe, não consegui entender sua solicitação.';
  }


  // Enviar resposta de volta pelo WhatsApp (usando a W-API)
  try {
    const url = `https://api.w-api.app/v1/message/send-text?instanceId=${process.env.INSTANCE_ID}`;
    const payload = {
      phone,
      message: resposta
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

  res.json({ status: 'sucesso', resposta });
});

// Aqui você pode adicionar outras rotas relacionadas ao WhatsApp/IA

module.exports = router;
