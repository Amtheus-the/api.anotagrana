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
  const { name, type, balance } = req.body;
  const account = await Account.create({ name, type, balance });
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
