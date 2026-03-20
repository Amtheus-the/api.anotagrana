const express = require('express');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');

const router = express.Router();

router.get('/', async (req, res) => {
  const { user_id } = req.query;
  let where = {};
  if (user_id) where.user_id = user_id;
  const transactions = await Transaction.findAll({ where, order: [['date', 'DESC']] });
  res.json(transactions);
});

router.post('/', async (req, res) => {
  const { type, amount, category, account_id, description, date, user_id } = req.body;
  let account;
  if (account_id) {
    account = await Account.findByPk(account_id);
  } else {
    // Busca a primeira conta do usuário
    account = await Account.findOne({ where: { user_id }, order: [['id', 'ASC']] });
  }
  if (!account) return res.status(400).json({ error: 'Conta não encontrada' });

  const tx = await Transaction.create({
    type,
    amount,
    category,
    accountId: account.id,
    description,
    date,
    account_name: account.name,
    user_id: account.user_id,
  });

  // Atualiza saldo da conta
  const delta = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
  account.balance = (account.balance || 0) + delta;
  await account.save();

  res.status(201).json(tx);
});

module.exports = router;
