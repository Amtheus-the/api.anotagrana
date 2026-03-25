const express = require('express');
const User = require('../models/User');

const router = express.Router();

// Atualiza onboarding_complete para true
router.patch('/:id/onboarding', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.onboarding_complete = true;
    await user.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar onboarding', details: e.message });
  }
});

module.exports = router;
