const sequelize = require('../database');
const Account = require('./Account');
const Bill = require('./Bill');
const Investment = require('./Investment');
const MoneyBox = require('./MoneyBox');
const MoneyBoxDeposit = require('./MoneyBoxDeposit');
const Transaction = require('./Transaction');
const User = require('./User');

module.exports = {
  sequelize,
  Account,
  Bill,
  Investment,
  MoneyBox,
  MoneyBoxDeposit,
  Transaction,
  User
};
