const nodemailer = require('nodemailer');

// Configure aqui com os dados SMTP da Hostinger
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: process.env.SMTP_PORT || 465,
  secure: true, // true para 465, false para outras portas
  auth: {
    user: process.env.SMTP_USER, // seu e-mail completo
    pass: process.env.SMTP_PASS  // sua senha
  }
});

async function sendPasswordResetEmail(to, resetLink) {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to,
    subject: 'Recuperação de senha - Seu Sistema',
    html: `<p>Você solicitou a recuperação de senha.</p>
           <p>Clique no link abaixo para redefinir sua senha:</p>
           <a href="${resetLink}">${resetLink}</a>
           <p>Se não foi você, ignore este e-mail.</p>`
  };
  await transporter.sendMail(mailOptions);
}

module.exports = { sendPasswordResetEmail };
