const express = require('express');
const Bill = require('../models/Bill');

const router = express.Router();

router.get('/', async (req, res) => {
  const bills = await Bill.findAll();
  res.json(bills);
});

router.post('/', async (req, res) => {
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

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const bill = await Bill.findByPk(id);
  if (!bill) return res.status(404).json({ error: 'Conta não encontrada' });
  bill.status = status;
  await bill.save();
  res.json(bill);
});

module.exports = router;
