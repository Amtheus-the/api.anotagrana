const express = require('express');
const app = express();
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sequelize, Account, Bill, Investment, MoneyBox, MoneyBoxDeposit, Transaction, User } = require('./models');
const { OPENAI_KEY, INSTANCE_ID, TOKEN, PORT = 3001 } = process.env;

app.use(cors());
app.use(bodyParser.json());


// Rotas de usuário (cadastro, listagem)
app.use('/users', require('./routes/users'));

// Rota para atualizar onboarding_complete
app.use('/onboarding', require('./routes/onboarding'));

// Rotas WhatsApp/IA
app.use('/', require('./routes/whatsapp'));



// Rotas MoneyBox
app.get('/moneyboxes', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id é obrigatório' });
  }
  const boxes = await MoneyBox.findAll({ where: { user_id } });
  res.json(boxes);
});

app.post('/moneyboxes', async (req, res) => {
  console.log('POST /moneyboxes req.body:', req.body);
  const { name, total, goal_amount, user_id } = req.body;
  if (!name || !user_id) {
    console.log('POST /moneyboxes erro: campos obrigatórios faltando');
    return res.status(400).json({ error: 'Campos obrigatórios: name, user_id' });
  }
  const boxData = { name, total: total || 0, goal_amount: goal_amount || 0, user_id };
  console.log('POST /moneyboxes MoneyBox.create:', boxData);
  const box = await MoneyBox.create(boxData);
  res.status(201).json(box);
});

app.put('/moneyboxes/:id', async (req, res) => {
  const { id } = req.params;
  const { total } = req.body;
  const box = await MoneyBox.findByPk(id);
  if (!box) {
    return res.status(404).json({ error: 'Caixinha não encontrada' });
  }
  if (typeof total === 'number') box.total = (box.total || 0) + total;
  await box.save();
  res.json(box);
});

app.delete('/moneyboxes/:id', async (req, res) => {
  const { id } = req.params;
  await MoneyBox.destroy({ where: { id } });
  res.status(204).end();
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

// Atualizar Bill (pagar)
app.put('/bills/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const bill = await Bill.findByPk(id);
  if (!bill) return res.status(404).json({ error: 'Conta não encontrada' });
  bill.status = status;
  await bill.save();
  res.json(bill);
});

// Rota de status para debug e healthcheck
app.get('/', async (req, res) => {
  let dbStatus = 'desconectado';
  try {
    await sequelize.authenticate();
    dbStatus = 'conectado';
  } catch (e) {
    dbStatus = 'erro: ' + (e.message || e);
  }
  res.json({
    status: 'ok',
    database: dbStatus,
    hora: new Date().toISOString()
  });
});
// ...existing code...

// Rotas Account
app.get('/accounts', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });
  const accounts = await Account.findAll({ where: { user_id } });
  res.json(accounts);
});

app.post('/accounts', async (req, res) => {
  const { name, type, balance, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });
  const account = await Account.create({ name, type, balance, user_id });
  res.status(201).json(account);
});


app.delete('/accounts/:id', async (req, res) => {
  const { id } = req.params;
  await Account.destroy({ where: { id } });
  res.status(204).end();
});

// PATCH para atualizar conta (ex: definir como principal)
app.patch('/accounts/:id', async (req, res) => {
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


// Rotas Transaction
app.get('/transactions', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });
  const transactions = await Transaction.findAll({ where: { user_id }, order: [['date', 'DESC']] });
  res.json(transactions);
});

app.post('/transactions', async (req, res) => {
  const { type, amount, category, account_id, description, date, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });
  const account = await Account.findByPk(account_id);
  if (!account) return res.status(400).json({ error: 'Conta não encontrada' });

  const tx = await Transaction.create({
    type,
    amount,
    category,
    accountId: account_id,
    description,
    date,
    account_name: account.name,
    user_id
  });

  // Atualiza saldo da conta
  const delta = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
  account.balance = (account.balance || 0) + delta;
  await account.save();

  res.status(201).json(tx);
});


// Rotas MoneyBox
app.get('/moneyboxes', async (req, res) => {
  const boxes = await MoneyBox.findAll();
  res.json(boxes);
});

app.post('/moneyboxes', async (req, res) => {
  const { name, total, goal_amount } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Campo obrigatório: name' });
  }
  const box = await MoneyBox.create({ name, total: total || 0, goal_amount: goal_amount || 0 });
  res.status(201).json(box);
});

app.delete('/moneyboxes/:id', async (req, res) => {
  const { id } = req.params;
  await MoneyBox.destroy({ where: { id } });
  res.status(204).end();
});

// Rotas Bill
app.get('/bills', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id é obrigatório' });
  }
  const bills = await Bill.findAll({ where: { user_id } });
  res.json(bills);
});

app.post('/bills', async (req, res) => {
  console.log('POST /bills req.body:', req.body);
  const { description, amount, dueDate, category, status, user_id } = req.body;
  if (!description || !amount || !dueDate || !user_id) {
    console.log('POST /bills erro: campos obrigatórios faltando');
    return res.status(400).json({ error: 'Campos obrigatórios: description, amount, dueDate, user_id' });
  }
  const billData = { description, amount, dueDate, category, status, user_id };
  console.log('POST /bills Bill.create:', billData);
  const bill = await Bill.create(billData);
  res.status(201).json(bill);
});

// Rotas Investment
app.get('/investments', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id é obrigatório' });
  }
  const investments = await Investment.findAll({ where: { user_id } });
  res.json(investments);
});

app.post('/investments', async (req, res) => {
  console.log('POST /investments req.body:', req.body);
  const { name, type, invested_amount, current_value, institution, start_date, user_id } = req.body;
  if (!name || !type || invested_amount == null || current_value == null || !user_id) {
    console.log('POST /investments erro: campos obrigatórios faltando');
    return res.status(400).json({ error: 'Campos obrigatórios: name, type, invested_amount, current_value, user_id' });
  }
  const investmentData = {
    name,
    type,
    invested_amount,
    current_value,
    institution,
    start_date,
    user_id
  };
  console.log('POST /investments Investment.create:', investmentData);
  const investment = await Investment.create(investmentData);
  res.status(201).json(investment);
});

app.delete('/investments/:id', async (req, res) => {
  const { id } = req.params;
  await Investment.destroy({ where: { id } });
  res.status(204).end();
});

sequelize.sync().then(() => {
  console.log('Banco de dados e tabelas criados!');
  app.listen(PORT, () => {
    console.log(`Backend rodando em http://localhost:${PORT}`);
  });
});
