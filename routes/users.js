
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();
const { sendWelcomeMessage } = require('../services/whatsapp');

// Login de usuário
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Preencha e-mail e senha.' });
    }
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    // Retorna dados básicos do usuário (sem senha)
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, is_admin: user.is_admin });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao fazer login', details: e.message });
  }
});

// Cadastro de usuário
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }
    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, phone, password: hash });
  // Envia mensagem de boas-vindas no WhatsApp (não bloqueia cadastro se falhar)
  sendWelcomeMessage(user.phone, user.name).catch(e => console.error('Erro ao enviar WhatsApp:', e.message));
  res.status(201).json({ id: user.id, name: user.name, email: user.email, phone: user.phone });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar usuário', details: e.message });
  }
});

// Listar usuários (admin)
router.get('/', async (req, res) => {
  const users = await User.findAll({ attributes: ['id', 'name', 'email', 'phone', 'is_admin', 'created_at'] });
  res.json(users);
});

module.exports = router;
