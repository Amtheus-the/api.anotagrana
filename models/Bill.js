const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Bill = sequelize.define('Bill', {
  description: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'outros',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

module.exports = Bill;
