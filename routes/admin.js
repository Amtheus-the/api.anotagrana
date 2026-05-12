const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const User = require('../models/User');
// Adicione aqui outros models se necessário (ex: Pagamento, Faturamento)

// Endpoint: GET /admin/stats
router.get('/stats', async (req, res) => {
  try {

    // Total de usuários comuns
    const total_users = await User.count({ where: { is_admin: false } });

    // Total de pagantes comuns
    const total_pagantes = await User.count({ where: { is_admin: false, is_pagante: true } });

    // Total em teste (usuários comuns criados há menos de 30 dias e não pagantes)
    const now = new Date();
    const testeDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const total_teste = await User.count({
      where: {
        is_admin: false,
        created_at: { [Op.gte]: testeDate },
        is_pagante: false
      }
    });

    // Pagantes ativos comuns
    const pagantes_ativos = await User.count({ where: { is_admin: false, is_pagante: true, onboarding_complete: true } });

    // Faturamento total (exemplo: some de um model Pagamento)
    // const faturamento_total = await Pagamento.sum('valor');
    const faturamento_total = 0; // Troque para valor real

    // Novos usuários comuns no mês
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const novos_mes = await User.count({ where: { is_admin: false, created_at: { [Op.gte]: startOfMonth } } });

    res.json({
      total_users,
      total_pagantes,
      total_teste,
      pagantes_ativos,
      faturamento_total,
      novos_mes
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas', details: err.message });
  }
});

module.exports = router;
