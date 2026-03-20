const express = require('express');
const MoneyBox = require('../models/MoneyBox');

const router = express.Router();

router.get('/', async (req, res) => {
  const boxes = await MoneyBox.findAll();
  res.json(boxes);
});

router.post('/', async (req, res) => {
  const { name, total, goal_amount } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Campo obrigatório: name' });
  }
  const box = await MoneyBox.create({ name, total: total || 0, goal_amount: goal_amount || 0 });
  res.status(201).json(box);
});

router.put('/:id', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await MoneyBox.destroy({ where: { id } });
  res.status(204).end();
});

module.exports = router;
