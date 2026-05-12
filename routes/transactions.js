const express = require('express');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const AccountUser = require('../models/AccountUser');

const router = express.Router();


// Endpoint robusto: só filtra por contas associadas ao usuário, nunca por user_id na tabela de transações
router.get('/', async (req, res) => {
  const { user_id } = req.query;
  let where = {};
  console.log('--- GET /transactions ---');
  console.log('user_id recebido:', user_id);
  if (user_id) {
    // Busca todas as contas associadas ao usuário (contas compartilhadas)
    const links = await require('../models/AccountUser').findAll({ where: { user_id } });
    const accountIds = links.map(l => l.account_id);
    console.log('Contas associadas ao usuário:', accountIds);
    if (accountIds.length > 0) {
      where.accountId = accountIds;
    } else {
      console.log('Nenhuma conta associada. Retornando vazio.');
      return res.json([]);
    }
  }
  // Nunca filtra por user_id na tabela de transações!
  console.log('Filtro Sequelize where:', where);
  const transactions = await require('../models/Transaction').findAll({ where, order: [['date', 'DESC']] });
  console.log('Transações retornadas:', transactions.map(t => ({ id: t.id, accountId: t.accountId, amount: t.amount, type: t.type, user_id: t.user_id })));
  console.log('--- FIM GET /transactions ---');
  res.json(transactions);
});

router.post('/', async (req, res) => {
  const { type, amount, category, account_id, description, date, user_id, repetition = 'single', installments = 1 } = req.body;
  console.log('--- POST /transactions ---');
  console.log('Body recebido:', req.body);
  console.log('DEBUG repetition:', repetition, '| installments:', installments, '| typeof installments:', typeof installments);
  let account;
  if (account_id) {
    account = await Account.findByPk(account_id);
  } else {
    // Busca a primeira conta do usuário
    account = await Account.findOne({ where: { user_id }, order: [['id', 'ASC']] });
  }
  console.log('DEBUG Conta encontrada:', account ? account.id : null, '| Nome:', account ? account.name : null);
  if (!account) {
    console.log('Conta não encontrada para account_id:', account_id, 'user_id:', user_id);
    return res.status(400).json({ error: 'Conta não encontrada' });
  }

  // Lógica para transações parceladas ou fixas
  let txs = [];
  if (repetition === 'installment' && Number(installments) > 1) {
    console.log('Criando transação parcelada:', { repetition, installments });
    let parentId = null;
    for (let i = 1; i <= Number(installments); i++) {
      const tx = await Transaction.create({
        type,
        amount,
        category,
        accountId: account.id,
        description: description ? `${description} (${i}/${installments})` : null,
        date: addMonthsToDate(date, i - 1),
        account_name: account.name,
        user_id: account.user_id,
        repetition: 'installment',
        installment_number: i,
        installment_total: Number(installments),
        parent_transaction_id: parentId,
      });
      if (i === 1) parentId = tx.id;
      // Atualiza o parent_transaction_id da primeira parcela
      if (i === 1) await tx.update({ parent_transaction_id: parentId });
      txs.push(tx);
      console.log(`Parcela ${i}/${installments} criada:`, tx.toJSON());
    }
    // Atualiza saldo só da primeira parcela
    const delta = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
    account.balance = (account.balance || 0) + delta;
    await account.save();
    console.log('Parcelas criadas:', txs.length);
    return res.status(201).json(txs);
  } else if (repetition === 'fixed') {
    console.log('Criando transação fixa');
    const tx = await Transaction.create({
      type,
      amount,
      category,
      accountId: account.id,
      description,
      date,
      account_name: account.name,
      user_id: account.user_id,
      repetition: 'fixed',
    });
    const delta = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
    account.balance = (account.balance || 0) + delta;
    await account.save();
    console.log('Transação fixa criada:', tx.toJSON());
    return res.status(201).json(tx);
  } else {
    // Único
    console.log('Criando transação única');
    const tx = await Transaction.create({
      type,
      amount,
      category,
      accountId: account.id,
      description,
      date,
      account_name: account.name,
      user_id: account.user_id,
      repetition: 'single',
    });
    const delta = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
    account.balance = (account.balance || 0) + delta;
    await account.save();
    console.log('Transação única criada:', tx.toJSON());
    return res.status(201).json(tx);
  }
});

// Função utilitária para somar meses a uma data (YYYY-MM-DD ou Date)
function addMonthsToDate(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  // Ajusta para o último dia do mês se necessário
  if (d.getDate() !== new Date(date).getDate()) {
    d.setDate(0);
  }
  return d;
}


// DELETE /transactions/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  console.log('--- DELETE /transactions/:id ---');
  console.log('ID recebido:', id);
  try {
    const tx = await Transaction.findByPk(id);
    console.log('Resultado do findByPk:', tx);
    if (!tx) {
      console.log('Transação não encontrada para o id:', id);
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    // Atualiza saldo da conta ao remover a transação
    const account = await Account.findByPk(tx.accountId);
    console.log('Conta encontrada:', account);
    if (account) {
      const delta = tx.type === 'income' ? -parseFloat(tx.amount) : parseFloat(tx.amount);
      account.balance = (account.balance || 0) + delta;
      await account.save();
      console.log('Saldo da conta atualizado:', account.balance);
    }

    await tx.destroy();
    console.log('Transação deletada com sucesso:', id);
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar transação:', err);
    return res.status(500).json({ error: 'Erro ao deletar transação' });
  }
  finally {
    console.log('--- FIM DELETE /transactions/:id ---');
  }
});

module.exports = router;
