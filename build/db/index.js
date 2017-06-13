'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _pgConnectionString = require('pg-connection-string');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

const parseDBConfig = (_ref) => {
  let { connectionURL } = _ref,
      rest = _objectWithoutProperties(_ref, ['connectionURL']);

  const getResult = ({ database, host, password, port, user, username }) => ({ connectionString: `postgres://${user || username}:${password}@${host}:${port}`, name: database });
  if (connectionURL) return getResult((0, _pgConnectionString.parse)(connectionURL));
  return getResult(rest);
};

const load = config => {
  const { connectionString, name } = parseDBConfig(config);
  if (!name) {
    return _bluebird2.default.reject('database name not found. Check your db.js configs');
  }
  const result = {
    async checkIfExists(connection) {
      const data = await connection.query(`select 1 as result from pg_database where datname='${name}'`);
      return data.length !== 0;
    },
    connectionString,
    async create(connection, pgp) {
      const dbExists = await result.checkIfExists(connection);
      if (!dbExists) {
        await connection.query(`create database ${name}`);
        const dbConnection = result.getConnection(pgp, `${connectionString}/${name}`);
        await dbConnection.query('create table if not exists "rstation_api_migrations" ("title" varchar(255) not null unique)');
        return dbConnection;
      }
    },
    delete(connection) {
      return connection.query(`drop database if exists ${name}`);
    },
    getConnection(pgp, connectionStr = connectionString) {
      return pgp(connectionStr);
    },
    name,
    sequelizeOptions: config
  };

  return _bluebird2.default.resolve(result);
};

exports.default = load;