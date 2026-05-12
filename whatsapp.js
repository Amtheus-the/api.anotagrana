console.log('[DEBUG] OPENAI_KEY:', process.env.OPENAI_KEY);
const express = require('express');
const axios = require('axios');
const { Op } = require('sequelize');
const { User, Transaction, Bill } = require('./models');
const app = express();

app.use(express.json());

// Dados da instância WhatsApp
const INSTANCE_ID = process.env.INSTANCE_ID;
const TOKEN = process.env.TOKEN;

// Token da OpenAI
const OPENAI_KEY = process.env.OPENAI_KEY;

// Endpoint para enviar mensagem manualmente
app.post('/enviar-whats', async (req, res) => {
  const { phone, message } = req.body;
  try {
    const response = await axios.post(
      `https://api.w-api.app/v1/message/send-text?instanceId=${INSTANCE_ID}`,
      { phone, message },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`,
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Webhook para receber mensagens do WhatsApp (configure na W-API)
app.post('/webhook-whats', async (req, res) => {
  // Log para debug
  console.log('[WEBHOOK-WHATS][DEBUG][PAYLOAD RECEBIDO]', JSON.stringify(req.body));

  // Extrai o número e a mensagem de diferentes formatos possíveis
  let phone = req.body.phone || (req.body.sender && req.body.sender.id) || (req.body.chat && req.body.chat.id) || null;
  let message = req.body.message || (req.body.msgContent && req.body.msgContent.conversation) || null;
  const cleanPhone = (phone || '').replace(/@.*/, '');
  console.log('[WHATSAPP][WEBHOOK] Mensagem recebida:', phone, message);
  // Lista de telefones autorizados (adicione outros se necessário)
  const PHONES_AUTORIZADOS = ['11986387651', '5511986387651'];
  if (!message || !PHONES_AUTORIZADOS.includes(cleanPhone)) {
    console.log('[WHATSAPP][WEBHOOK] Ignorando mensagem automática ou número não autorizado:', { phone, message });
    return res.json({ status: 'ignorado', motivo: 'mensagem automática ou número não autorizado', phone, message });
  }
  let resposta = '';
  if (message) {
    // Busca usuário pelo telefone limpo
    const user = await User.findOne({ where: { phone: cleanPhone } });
    if (!user) {
      resposta = 'Usuário não encontrado.';
    } else {
      // Checagem de trial: se já passaram 30 dias do início do trial e não está inscrito,
      // responder com mensagem fixa e NÃO chamar a OpenAI.
      if (user.free_trial_started_at && !user.is_subscribed) {
        try {
          const trialStart = new Date(user.free_trial_started_at);
          const now = new Date();
          const diffDays = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
          if (diffDays >= 30) {
            resposta = 'Seu período de teste gratuito de 30 dias expirou. Para continuar conversando com a assistente Thayná, por favor assine um plano para ativar o acesso.';
            // Tenta enviar a mensagem via W-API (não falha a rota se der erro no envio)
            try {
              await axios.post(
                `https://api.w-api.app/v1/message/send-text?instanceId=${INSTANCE_ID}`,
                { phone, message: resposta },
                { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` } }
              );
            } catch (e) {
              console.error('[WHATSAPP][SEND][TRIAL_EXPIRED][ERRO]', e.message || e);
            }
            return res.json({ status: 'trial_expired', message: resposta });
          }
        } catch (e) {
          console.error('[WHATSAPP][TRIAL][ERRO]', e.message || e);
        }
      }

      // 1. IA interpreta intenção e dados (sempre responde em JSON)
      let iaJson = null;
      let iaText = '';
    try {
  const prompt = `Você é uma assistente financeira chamada Thayná, do sistema Anota Grana. É proibido mentir, inventar informações ou responder algo que não saiba. Se não souber a resposta, diga claramente: \"Desculpe, não sei responder isso.\" Nunca tente adivinhar ou criar informações. Seja sempre honesta, objetiva e transparente. Analise a frase do usuário e responda APENAS em JSON válido, sem explicações. Sempre que possível, extraia valor, categoria, conta, período, etc. Se o usuário mencionar mais de um lançamento na mesma frase, responda com uma lista no campo "lancamentos" e use a intenção "registrar_multiplos_gastos". Se o usuário perguntar qual o modelo para múltiplos lançamentos, explique que ele deve enviar assim: {\"intencao\":\"registrar_multiplos_gastos\",\"lancamentos\":[{\"valor\":50,\"categoria\":\"mercado\"},{\"valor\":30,\"categoria\":\"farmácia\"}]}. Exemplos:\nUsuário: Acabei de gastar 80 reais em unha\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":80,\"categoria\":\"unha\"}\nUsuário: Gastei 30 reais no restaurante\nResposta: {\"intencao\":\"registrar_gasto\",\"valor\":30,\"categoria\":\"restaurante\"}\nUsuário: Gastei 50 no mercado e 30 na farmácia\nResposta: {\"intencao\":\"registrar_multiplos_gastos\",\"lancamentos\":[{\"valor\":50,\"categoria\":\"mercado\"},{\"valor\":30,\"categoria\":\"farmácia\"}]}\nUsuário: Qual o modelo para múltiplos lançamentos?\nResposta: {\"modelo\":{\"intencao\":\"registrar_multiplos_gastos\",\"lancamentos\":[{\"valor\":50,\"categoria\":\"mercado\"},{\"valor\":30,\"categoria\":\"farmácia\"}]}}\nUsuário: Quanto gastei esse mês?\nResposta: {\"intencao\":\"consulta_gastos_mes\"}\nUsuário: Quanto tenho na minha conta Nubank?\nResposta: {\"intencao\":\"consulta_saldo\",\"conta\":\"Nubank\"}\nUsuário: Quais contas tenho a pagar esse mês?\nResposta: {\"intencao\":\"consulta_contas_a_pagar_mes\"}\nUsuário: Oi\nResposta: {\"intencao\":\"saudacao\"}\nUsuário: Olá\nResposta: {\"intencao\":\"saudacao\"}\nUsuário: Bom dia\nResposta: {\"intencao\":\"saudacao\"}\nUsuário: Boa tarde\nResposta: {\"intencao\":\"saudacao\"}\nUsuário: Boa noite\nResposta: {\"intencao\":\"saudacao\"}\nUsuário: ${message}\nResposta:`;
        console.log('[WHATSAPP][IA][REQUEST]', prompt);
        const iaRes = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Responda sempre apenas com um JSON válido, sem explicações.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 200
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_KEY}`,
            },
          }
        );
        console.log('[WHATSAPP][IA][RAW RESPONSE DATA]', iaRes.data);
        iaText = iaRes.data.choices[0].message.content.trim();
        console.log('[WHATSAPP][IA][RESPONSE]', iaText);
        try {
          iaJson = JSON.parse(iaText);
        } catch (e) {
          iaJson = null;
        }
        console.log('[WHATSAPP][IA][JSON PARSED]', iaJson);

        // Validação: se a intenção for múltiplos lançamentos, mas não vier no formato esperado, envia o modelo correto
        const modeloMultiplos = {
          "modelo": {
            "intencao": "registrar_multiplos_gastos",
            "lancamentos": [
              { "valor": 50, "categoria": "mercado" },
              { "valor": 30, "categoria": "farmácia" }
            ]
          }
        };
        if (
          message &&
          /mais de um|múltiplos|multiplos|vários|varios|lançamentos|lancamentos|como faço|como registrar/i.test(message) &&
          (!iaJson || !(
            (iaJson.intencao === 'registrar_multiplos_gastos' && Array.isArray(iaJson.lancamentos)) ||
            (iaJson.modelo && iaJson.modelo.intencao === 'registrar_multiplos_gastos' && Array.isArray(iaJson.modelo.lancamentos))
          ))
        ) {
          iaJson = { ...modeloMultiplos };
          iaText = JSON.stringify(modeloMultiplos, null, 2);
        }
      } catch (e) {
        console.error('[WHATSAPP][IA][ERRO PARSE OU REQUISIÇÃO]', e.message);
        if (e.response) {
          console.error('[WHATSAPP][IA][ERRO RESPONSE DATA]', e.response.data);
        }
        iaJson = null;
      }
      // 2. Executa ação real conforme intenção
      if (iaJson && iaJson.intencao === 'registrar_multiplas_receitas' && Array.isArray(iaJson.lancamentos) && iaJson.lancamentos.length > 0) {
        // Múltiplos lançamentos de receitas
        const Account = require('./models/Account');
        let conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        if (!conta) {
          resposta = 'Não foi possível lançar porque você não tem nenhuma conta cadastrada. Cadastre uma conta primeiro.';
        } else {
          let total = 0;
          let detalhes = [];
          for (const lanc of iaJson.lancamentos) {
            if (lanc.valor) {
              await Transaction.create({
                user_id: user.id,
                accountId: conta.id,
                amount: lanc.valor,
                type: 'income',
                category: lanc.categoria || 'Outros',
                account_name: conta.name,
                date: new Date(), // Sempre data atual
                description: lanc.categoria || 'Lançamento múltiplo'
              });
              conta.balance = (conta.balance || 0) + Number(lanc.valor);
              total += Number(lanc.valor);
              detalhes.push(`R$ ${lanc.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em "${lanc.categoria || 'outros'}"`);
            }
          }
          await conta.save();
          resposta = `Registrado! Suas receitas (${detalhes.join('; ')}) foram adicionadas e somadas à conta principal.`;
        }
      } else 
      if (iaJson && iaJson.intencao === 'registrar_multiplos_gastos' && Array.isArray(iaJson.lancamentos) && iaJson.lancamentos.length > 0) {
        // Múltiplos lançamentos de gastos
        const Account = require('./models/Account');
        let conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        if (!conta) {
          resposta = 'Não foi possível lançar porque você não tem nenhuma conta cadastrada. Cadastre uma conta primeiro.';
        } else {
          let total = 0;
          let detalhes = [];
          for (const lanc of iaJson.lancamentos) {
            if (lanc.valor) {
              await Transaction.create({
                user_id: user.id,
                accountId: conta.id,
                amount: lanc.valor,
                type: 'expense',
                category: lanc.categoria || 'Outros',
                account_name: conta.name,
                date: new Date(), // Sempre data atual
                description: lanc.categoria || 'Lançamento múltiplo'
              });
              conta.balance = (conta.balance || 0) - Number(lanc.valor);
              total += Number(lanc.valor);
              detalhes.push(`R$ ${lanc.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em "${lanc.categoria || 'outros'}"`);
            }
          }
          await conta.save();
          resposta = `Registrado! Suas despesas (${detalhes.join('; ')}) foram adicionadas e descontadas da conta principal.`;
        }
      } else if (iaJson && iaJson.intencao === 'registrar_gasto' && iaJson.valor) {
        // Registrar gasto único
        const Account = require('./models/Account');
        let conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        if (!conta) {
          resposta = 'Não foi possível lançar porque você não tem nenhuma conta cadastrada. Cadastre uma conta primeiro.';
        } else {
          await Transaction.create({
            user_id: user.id,
            accountId: conta.id,
            amount: iaJson.valor,
            type: 'expense',
            category: iaJson.categoria || 'Outros',
            account_name: conta.name,
            date: new Date(), // Sempre data atual
            description: message
          });
          conta.balance = (conta.balance || 0) - Number(iaJson.valor);
          await conta.save();
          resposta = `Registrado! Sua despesa de R$ ${iaJson.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com "${iaJson.categoria || 'outros'}" foi adicionada e descontada da conta principal.`;
        }
      } else if (iaJson && iaJson.intencao === 'saudacao') {
  // Responder com o texto original da IA para saudação
  resposta = iaText;
      } else if (iaJson && iaJson.intencao === 'registrar_receita' && iaJson.valor) {
        // Registrar receita
        const Account = require('./models/Account');
        // Busca conta principal (isMain: 1), se não houver pega a primeira
        let conta = await Account.findOne({ where: { user_id: user.id, isMain: 1 } });
        if (!conta) {
          conta = await Account.findOne({ where: { user_id: user.id }, order: [['id', 'ASC']] });
        }
        if (!conta) {
          resposta = 'Não foi possível lançar porque você não tem nenhuma conta cadastrada. Cadastre uma conta primeiro.';
        } else {
          await Transaction.create({
            user_id: user.id,
            accountId: conta.id,
            amount: iaJson.valor,
            type: 'income',
            category: iaJson.categoria || 'Outros',
            account_name: conta.name,
            date: new Date(), // Sempre data atual
            description: message
          });
          // Atualiza saldo da conta
          conta.balance = (conta.balance || 0) + Number(iaJson.valor);
          await conta.save();
          resposta = `Receita de R$ ${iaJson.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrada na categoria "${iaJson.categoria || 'outros'}".`;
        }
      } else if (iaJson && iaJson.intencao === 'consulta_gastos_mes') {
        // Consulta gastos do mês
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const total = await Transaction.sum('amount', {
          where: {
            user_id: user.id,
            type: 'expense',
            date: { [Op.between]: [start, end] }
          }
        });
        resposta = `Este mês, você gastou um total de R$ ${(total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
      } else if (iaJson && iaJson.intencao === 'consulta_faturamento_mes') {
        // Consulta receitas do mês
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const total = await Transaction.sum('amount', {
          where: {
            user_id: user.id,
            type: 'income',
            date: { [Op.between]: [start, end] }
          }
        });
        resposta = `Este mês, você recebeu um total de R$ ${(total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
      } else if (iaJson && iaJson.intencao === 'consulta_saldo') {
        // Consulta saldo de conta
        const Account = require('./models/Account');
        let conta = null;
        if (iaJson.conta) {
          conta = await Account.findOne({ where: { user_id: user.id, name: { [Op.like]: `%${iaJson.conta}%` } } });
        } else {
          conta = await Account.findOne({ where: { user_id: user.id } });
        }
        if (!conta) {
          resposta = 'Conta não encontrada.';
        } else {
          resposta = `Na sua conta ${conta.name}, você tem R$ ${(conta.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
        }
      } else if (iaJson && iaJson.intencao === 'consulta_contas_a_pagar_mes') {
        // Consulta contas a pagar do mês
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStart = new Date(yyyy, now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const bills = await Bill.findAll({
          where: {
            user_id: user.id,
            status: { [Op.ne]: 'paid' },
            dueDate: { [Op.gte]: todayStart }
          },
          order: [['dueDate', 'ASC']]
        });
        if (bills.length === 0) {
          resposta = 'Você não tem contas a pagar pendentes!';
        } else {
          const lista = bills.map(b => `${b.description} (R$ ${b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) vence em ${b.dueDate.toLocaleDateString('pt-BR')}`).join('\n');
          resposta = `Suas próximas contas a pagar:\n${lista}`;
        }
      } else if (iaJson && iaJson.intencao === 'consulta_maior_gasto_mes') {
        // Consulta maior gasto do mês
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const maior = await Transaction.findOne({
          where: {
            user_id: user.id,
            type: 'expense',
            date: { [Op.between]: [start, end] }
          },
          order: [['amount', 'DESC']]
        });
        if (!maior) {
          resposta = 'Você ainda não teve nenhum gasto registrado neste mês!';
        } else {
          resposta = `Seu maior gasto do mês foi de R$ ${maior.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em "${maior.category || maior.description || 'sem categoria'}".`;
        }
      } else if (
        iaJson && (
          iaJson.intencao === 'consulta_relatorio_mensal' ||
          iaJson.intencao === 'enviar_relatorio_mensal' ||
          iaJson.intencao === 'relatorio_mensal'
        )
      ) {
        // Relatório mensal detalhado
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        // Totais gerais
        const totalReceitas = await Transaction.sum('amount', {
          where: {
            user_id: user.id,
            type: 'income',
            date: { [Op.between]: [start, end] }
          }
        }) || 0;
        const totalDespesas = await Transaction.sum('amount', {
          where: {
            user_id: user.id,
            type: 'expense',
            date: { [Op.between]: [start, end] }
          }
        }) || 0;
        const saldoLiquido = totalReceitas - totalDespesas;
        // Receitas por categoria
        const receitasPorCat = await Transaction.findAll({
          where: {
            user_id: user.id,
            type: 'income',
            date: { [Op.between]: [start, end] }
          },
          attributes: ['category', [app.get('sequelize').fn('SUM', app.get('sequelize').col('amount')), 'total']],
          group: ['category']
        });
        // Despesas por categoria
        const despesasPorCat = await Transaction.findAll({
          where: {
            user_id: user.id,
            type: 'expense',
            date: { [Op.between]: [start, end] }
          },
          attributes: ['category', [app.get('sequelize').fn('SUM', app.get('sequelize').col('amount')), 'total']],
          group: ['category']
        });
        // Formatar resposta
        let respostaRelatorio = `Olá! Aqui está seu relatório mensal até agora (${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}):\n\n`;
        respostaRelatorio += `*Visão Geral:*\n`;
        respostaRelatorio += `  • Total de Receitas: R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
        respostaRelatorio += `  • Total de Despesas: R$ ${totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
        respostaRelatorio += `  • Saldo Líquido: R$ ${saldoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
        respostaRelatorio += `*Receitas por Categoria:*\n`;
        if (receitasPorCat.length === 0) {
          respostaRelatorio += `  • Nenhuma receita registrada\n`;
        } else {
          receitasPorCat.forEach(r => {
            respostaRelatorio += `  • ${r.category || 'Outros'}: R$ ${parseFloat(r.dataValues.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
          });
        }
        respostaRelatorio += `\n*Despesas por Categoria:*\n`;
        if (despesasPorCat.length === 0) {
          respostaRelatorio += `  • Nenhuma despesa registrada\n`;
        } else {
          despesasPorCat.forEach(d => {
            respostaRelatorio += `  • ${d.category || 'Outros'}: R$ ${parseFloat(d.dataValues.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
          });
        }
        resposta = respostaRelatorio.trim();
      } else {
        // Se não for intenção financeira, responde como Thayná
        try {
          const chatRes = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: 'Seu nome é Thayná. Você é uma assistente virtual simpática, objetiva e divertida, criada para o sistema Anota Grana. Sempre que perguntarem seu nome, responda "Meu nome é Thayná, sou sua assistente do Anota Grana!". Se perguntarem o nome do sistema, responda "O nome do sistema é Anota Grana!". Converse normalmente sobre qualquer assunto, inclusive sobre finanças.' },
                { role: 'user', content: message }
              ],
              max_tokens: 200
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`,
              },
            }
          );
          resposta = chatRes.data.choices[0].message.content.trim();
        } catch (e) {
          resposta = 'Desculpe, houve um erro ao consultar a IA.';
        }
      }
    }
    // Envia resposta pelo WhatsApp
    await axios.post(
      `https://api.w-api.app/v1/message/send-text?instanceId=${INSTANCE_ID}`,
      { phone, message: resposta },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`,
        },
      }
    );
  }
  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  console.log('Servidor WhatsApp rodando na porta 3000');
});
