const express = require('express');
const Investment = require('../models/Investment');

const router = express.Router();

router.get('/', async (req, res) => {
  const investments = await Investment.findAll();
  res.json(investments);
});

router.post('/', async (req, res) => {
  const { name, type, invested_amount, current_value, institution, start_date } = req.body;
  if (!name || !type || invested_amount == null || current_value == null) {
    return res.status(400).json({ error: 'Campos obrigatórios: name, type, invested_amount, current_value' });
  }
  const investment = await Investment.create({
    name,
    type,
    invested_amount,
    current_value,
    institution,
    start_date
  });
  res.status(201).json(investment);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await Investment.destroy({ where: { id } });
  res.status(204).end();
});

module.exports = router;
