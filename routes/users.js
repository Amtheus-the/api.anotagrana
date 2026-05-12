
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendWelcomeMessage } = require('../services/whatsapp');
const { sendPasswordResetEmail } = require('../services/email');
const crypto = require('crypto');

const router = express.Router();

// Buscar usuário por id (inclui onboarding_complete)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      is_admin: user.is_admin,
      onboarding_complete: user.onboarding_complete,
      free_trial_started_at: user.free_trial_started_at,
      is_subscribed: user.is_subscribed
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar usuário', details: e.message });
  }
});

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
    console.log('Requisição de cadastro recebida:', req.body);
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      console.log('Campos obrigatórios faltando:', { name, email, phone, password });
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }
    const exists = await User.findOne({ where: { email } });
    if (exists) {
      console.log('Tentativa de cadastro com e-mail já existente:', email);
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    const hash = await bcrypt.hash(password, 10);
      // Simples armazenamento em memória para tokens de reset (substitua por banco/redis em produção)
      const passwordResetTokens = {};

      // Solicitar recuperação de senha
      router.post('/forgot-password', async (req, res) => {
        console.log('POST /users/forgot-password chamado', req.body);
        const { email } = req.body;
        if (!email) {
          console.log('Nenhum e-mail informado');
          return res.status(400).json({ error: 'Informe o e-mail.' });
        }
        const user = await User.findOne({ where: { email } });
        if (!user) {
          console.log('Usuário não encontrado para o e-mail:', email);
          return res.status(200).json({ message: 'Se o e-mail existir, enviaremos instruções.' });
        }
        // Gera token seguro e expira em 1h
        const token = crypto.randomBytes(32).toString('hex');
        passwordResetTokens[token] = { userId: user.id, expires: Date.now() + 3600 * 1000 };
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
        console.log('Enviando e-mail de recuperação para:', user.email, 'Link:', resetLink);
        try {
          await sendPasswordResetEmail(user.email, resetLink);
          console.log('E-mail de recuperação enviado com sucesso!');
          res.json({ message: 'Se o e-mail existir, enviaremos instruções.' });
        } catch (e) {
          console.error('Erro ao enviar e-mail de recuperação:', e);
          res.status(500).json({ error: 'Erro ao enviar e-mail', details: e.message });
        }
      });

      // Redefinir senha usando token
      router.post('/reset-password', async (req, res) => {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Token e nova senha obrigatórios.' });
        const data = passwordResetTokens[token];
        if (!data || data.expires < Date.now()) {
          return res.status(400).json({ error: 'Token inválido ou expirado.' });
        }
        const user = await User.findByPk(data.userId);
        if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });
        user.password = await bcrypt.hash(password, 10);
        await user.save();
        delete passwordResetTokens[token];
        res.json({ message: 'Senha redefinida com sucesso.' });
      });
    try {
      // Ao criar o usuário, inicia automaticamente 30 dias de trial
      const user = await User.create({ name, email, phone, password: hash, free_trial_started_at: new Date() });
      console.log('Usuário cadastrado com sucesso:', user.id, user.email);
      // Envia mensagem de boas-vindas no WhatsApp (não bloqueia cadastro se falhar)
      sendWelcomeMessage(user.phone, user.name).catch(e => console.error('Erro ao enviar WhatsApp:', e.message));
      res.status(201).json({ id: user.id, name: user.name, email: user.email, phone: user.phone, free_trial_started_at: user.free_trial_started_at, is_subscribed: user.is_subscribed });
    } catch (dbErr) {
      console.error('Erro ao criar usuário no banco:', dbErr);
      res.status(500).json({ error: 'Erro ao cadastrar usuário', details: dbErr.message });
    }
  } catch (e) {
    console.error('Erro inesperado no cadastro:', e);
    res.status(500).json({ error: 'Erro ao cadastrar usuário', details: e.message });
  }
});

// Listar usuários (admin)
router.get('/', async (req, res) => {
  const users = await User.findAll({ attributes: ['id', 'name', 'email', 'phone', 'is_admin', 'created_at', 'free_trial_started_at', 'is_subscribed'] });
  res.json(users);
});

module.exports = router;
