// Atualizar saldo da conta
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { balance } = req.body;
  const account = await Account.findByPk(id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  if (typeof balance === 'number') account.balance = balance;
  await account.save();
  res.json(account);
});
const express = require('express');
const Account = require('../models/Account');

const router = express.Router();

router.get('/', async (req, res) => {
  const { user_id } = req.query;
  let where = {};
  if (user_id) where.user_id = user_id;
  const accounts = await Account.findAll({ where });
  res.json(accounts);
});

router.post('/', async (req, res) => {
  const { name, type, balance, user_id } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id é obrigatório' });
  }
  const account = await Account.create({ name, type, balance, user_id });
  res.status(201).json(account);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await Account.destroy({ where: { id } });
  res.status(204).end();
});

// PATCH para atualizar conta (ex: definir como principal)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { isMain } = req.body;
  const account = await Account.findByPk(id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  if (isMain) {
    // Remove principal das outras contas do mesmo usuário
    await Account.update({ isMain: false }, { where: { user_id: account.user_id } });
  }
  account.isMain = !!isMain;
  await account.save();
  res.json(account);
});

module.exports = router;
