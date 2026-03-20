const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Investment = sequelize.define('Investment', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  invested_amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  current_value: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  institution: {
    type: DataTypes.STRING,
    allowNull: true
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

module.exports = Investment;
