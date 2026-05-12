const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const AccountUser = sequelize.define('AccountUser', {
  account_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'account_users',
  timestamps: true
});

module.exports = AccountUser;
