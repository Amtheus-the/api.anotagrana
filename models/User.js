const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Data de início do período grátis (se aplicável)
  free_trial_started_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
    // Integração Asaas
    asaas_customer_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    asaas_subscription_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    subscription_status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    subscription_plan: {
      type: DataTypes.STRING,
      allowNull: true
    },
    subscription_started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscription_ends_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscription_meta: {
      type: DataTypes.JSON,
      allowNull: true
    },
  // Indica se o usuário já assinou o serviço (pagamento)
  is_subscribed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  onboarding_complete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'Users', // Garante uso do nome correto da tabela
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = User;
