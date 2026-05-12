

const express = require('express');
const Account = require('../models/Account');
const AccountUser = require('../models/AccountUser');
const router = express.Router();

// Buscar conta por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const account = await Account.findByPk(id);
  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada' });
  }
  res.json(account);
});

// Atualizar saldo da conta
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { balance, bankLogo } = req.body;
  console.log('--- INÍCIO PUT /accounts/:id ---');
  console.log('ID recebido:', id);
  console.log('Body recebido:', req.body);
  const accountId = Number(id);
  if (isNaN(accountId)) {
    console.log('ID inválido:', id);
    console.log('--- FIM PUT /accounts/:id ---');
    return res.status(400).json({ error: 'ID inválido' });
  }
  const account = await Account.findByPk(accountId);
  if (!account) {
    console.log('Conta não encontrada para id', accountId);
    console.log('--- FIM PUT /accounts/:id ---');
    return res.status(404).json({ error: 'Conta não encontrada' });
  }
  if (typeof balance === 'number') {
    console.log('Balance válido:', balance);
    account.balance = balance;
  } else {
    console.log('Balance não informado ou inválido:', balance);
    console.log('--- FIM PUT /accounts/:id ---');
    return res.status(400).json({ error: 'Balance não informado ou inválido' });
  }
  if (typeof bankLogo === 'string') {
    account.bankLogo = bankLogo;
  }
  await account.save();
  console.log('Conta atualizada:', account.toJSON());
  console.log('--- FIM PUT /accounts/:id ---');
  res.json(account);
});

// Buscar contas do usuário (todas que ele participa)
router.get('/', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });
  // Busca todos os account_ids do usuário
  const links = await AccountUser.findAll({ where: { user_id } });
  const accountIds = links.map(l => l.account_id);
  const accounts = await Account.findAll({ where: { id: accountIds } });
  res.json(accounts);
});

// Criar conta e associar criador
router.post('/', async (req, res) => {
  const { name, type, balance, user_id, bankLogo } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id é obrigatório' });
  }
  const account = await Account.create({ name, type, balance, user_id, bankLogo });
  await AccountUser.create({ account_id: account.id, user_id });
  res.status(201).json(account);
});

// Entrar em uma conta existente via ID
router.post('/join', async (req, res) => {
  const { account_id, user_id } = req.body;
  if (!account_id || !user_id) return res.status(400).json({ error: 'account_id e user_id são obrigatórios' });
  // Verifica se já está associado
  const exists = await AccountUser.findOne({ where: { account_id, user_id } });
  if (exists) return res.status(400).json({ error: 'Usuário já está associado a essa conta' });
  await AccountUser.create({ account_id, user_id });
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await Account.destroy({ where: { id } });
  res.status(204).end();
});

// PATCH para atualizar conta (ex: definir como principal ou atualizar logo)
// PATCH para atualizar conta (ex: definir como principal ou atualizar logo)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { isMain, bankLogo, user_id } = req.body;
  const account = await Account.findByPk(id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

  // Só faz sentido definir principal para o usuário logado
  if (typeof isMain !== 'undefined' && user_id) {
    // Busca todas as contas associadas ao usuário
    const links = await AccountUser.findAll({ where: { user_id } });
    const accountIds = links.map(l => l.account_id);
    // Remove principal das outras contas do usuário
    await Account.update({ isMain: false }, { where: { id: accountIds } });
    // Define principal só nesta conta
    account.isMain = !!isMain;
  }
  if (typeof bankLogo === 'string') {
    account.bankLogo = bankLogo;
  }
  await account.save();
  res.json(account);
});

module.exports = router;
