const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const MoneyBox = sequelize.define('MoneyBox', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  total: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  goal_amount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

module.exports = MoneyBox;
