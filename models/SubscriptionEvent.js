const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const SubscriptionEvent = sequelize.define('SubscriptionEvent', {
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  asaas_event: { type: DataTypes.STRING, allowNull: true },
  asaas_payment_id: { type: DataTypes.STRING, allowNull: true },
  asaas_customer_id: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: true },
  amount: { type: DataTypes.DECIMAL(10,2), allowNull: true },
  raw_payload: { type: DataTypes.JSON, allowNull: true }
}, {
  tableName: 'SubscriptionEvents',
  timestamps: false,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = SubscriptionEvent;
