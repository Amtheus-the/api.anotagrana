const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const MoneyBoxDeposit = sequelize.define('MoneyBoxDeposit', {
  moneyBoxId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  }
});

module.exports = MoneyBoxDeposit;
