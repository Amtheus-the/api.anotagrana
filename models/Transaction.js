const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  accountId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  account_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  repetition: {
    type: DataTypes.ENUM('single', 'fixed', 'installment'),
    allowNull: false,
    defaultValue: 'single',
  },
  installment_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  installment_total: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  parent_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'transactions',
  timestamps: false // ou true se você usa createdAt/updatedAt
});

module.exports = Transaction;
