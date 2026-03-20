const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Account = sequelize.define('Account', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  balance: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  isMain: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

module.exports = Account;
