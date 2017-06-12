'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.serve = exports.loadMigrations = exports.load = exports.bottle = exports.addService = undefined;

var _ajv = require('ajv');

var _ajv2 = _interopRequireDefault(_ajv);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _bottlejs = require('bottlejs');

var _bottlejs2 = _interopRequireDefault(_bottlejs);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _kcors = require('kcors');

var _kcors2 = _interopRequireDefault(_kcors);

var _koa = require('koa');

var _koa2 = _interopRequireDefault(_koa);

var _koaBody = require('koa-body');

var _koaBody2 = _interopRequireDefault(_koaBody);

var _koaMorgan = require('koa-morgan');

var _koaMorgan2 = _interopRequireDefault(_koaMorgan);

var _momentTimezone = require('moment-timezone');

var _momentTimezone2 = _interopRequireDefault(_momentTimezone);

var _pgPromise = require('pg-promise');

var _pgPromise2 = _interopRequireDefault(_pgPromise);

var _pgMonitor = require('pg-monitor');

var _pgMonitor2 = _interopRequireDefault(_pgMonitor);

var _sequelize = require('sequelize');

var _sequelize2 = _interopRequireDefault(_sequelize);

var _socket = require('socket.io');

var _socket2 = _interopRequireDefault(_socket);

var _config = require('./config');

var _config2 = _interopRequireDefault(_config);

var _controllers = require('./controllers');

var _controllers2 = _interopRequireDefault(_controllers);

var _db = require('./db');

var _db2 = _interopRequireDefault(_db);

var _environment = require('./environment');

var _environment2 = _interopRequireDefault(_environment);

var _mail = require('./mail');

var _mail2 = _interopRequireDefault(_mail);

var _migrations = require('./migrations');

var _migrations2 = _interopRequireDefault(_migrations);

var _models = require('./models');

var _models2 = _interopRequireDefault(_models);

var _schema = require('./schema');

var _schema2 = _interopRequireDefault(_schema);

var _scripts = require('./scripts');

var _scripts2 = _interopRequireDefault(_scripts);

var _services = require('./services');

var _services2 = _interopRequireDefault(_services);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

const bottle = new _bottlejs2.default();
const addService = (name, fn, ...deps) => {
  bottle.factory(name, container => {
    const resolvedDependencies = [];
    deps.forEach(item => {
      resolvedDependencies.push(container[item]);
    });
    return fn(...resolvedDependencies);
  });
};

const pgpOptions = {
  promiseLib: _bluebird2.default
};
try {
  _pgMonitor2.default.attach(pgpOptions, ['error']);
} catch (error) {
  if (error.toString().includes('detach')) {
    _pgMonitor2.default.detach();
    _pgMonitor2.default.attach(pgpOptions, ['error']);
  }
}

const pgp = (0, _pgPromise2.default)(pgpOptions);

const load = async (dir = process.cwd()) => {
  addService('Bluebird', () => _bluebird2.default);
  addService('moment', () => _momentTimezone2.default);
  addService('Sequelize', () => _sequelize2.default);
  addService('pgp', () => pgp);

  const environment = await (0, _environment2.default)();
  const _ref = await (0, _config2.default)(environment, dir),
        { db: dbConfig, dependencies, mail: mailConfig } = _ref,
        config = _objectWithoutProperties(_ref, ['db', 'dependencies', 'mail']);

  if (dependencies) Object.keys(dependencies).forEach(item => {
    addService(item, () => dependencies[item]);
  });
  addService('config', () => config);

  const db = await (0, _db2.default)(dbConfig);
  addService('db', () => db);

  if (mailConfig) {
    const mail = await (0, _mail2.default)(mailConfig, dir);
    addService('mail', () => mail);
  }

  const services = await (0, _services2.default)(dir);
  Object.keys(services).forEach(item => {
    addService(...[item, ...services[item]]);
  });

  const sequelize = new _sequelize2.default(`${db.connectionString}/${db.name}`, db.sequelizeOptions);

  const models = await (0, _models2.default)(dir);
  const modelsKeys = Object.keys(models);

  modelsKeys.forEach(item => {
    sequelize.define(item);
    addService(...[item, models[item].definition, ...models[item].args]);
  });

  addService('sequelize', () => sequelize);

  modelsKeys.forEach(item => {
    bottle.factory(models[item].name, models[item].factory);
  });

  const scripts = await (0, _scripts2.default)(dir, environment);
  const promises = {};['bootstrap', 'seeds'].forEach(item => {
    promises[item] = [];
    scripts[item].forEach(element => {
      addService(...element);
      promises[item].push(bottle.container[element[0]]);
    });
  });

  const { bootstrap, seeds } = promises;

  if (bootstrap.length > 0) await _bluebird2.default.each(bootstrap, item => item());

  return { config, sequelize, seeds };
};

const loadMigrations = async (dir = process.cwd()) => {
  const { sequelize, seeds } = await load(dir);
  const migrations = await (0, _migrations2.default)(dir);
  Object.keys(migrations).forEach(item => {
    const title = item.split('.').join('');
    addService(...[title, ...migrations[item]]);
    migrations[item] = bottle.container[title];
  });
  return {
    getPending(connection) {
      return (0, _migrations.getPending)(connection, migrations);
    },
    run(connection, type, model, version) {
      return (0, _migrations.run)(connection, type, model, version, migrations, sequelize);
    },
    runPending(connection) {
      return (0, _migrations.runPending)(connection, migrations, sequelize);
    },
    seed() {
      if (seeds.length > 0) return _bluebird2.default.each(seeds, item => item());
      return _bluebird2.default.resolve();
    }
  };
};

const serve = async (dir = process.cwd(), areSocketsEnabled = false) => {
  const { config: { body = {}, cors = {}, morgan: { format = 'dev', options = {} } = {}, schemaConfig } } = await load(dir);

  const schema = await (0, _schema2.default)(schemaConfig);
  const controllers = await (0, _controllers2.default)(dir);
  const routes = {};
  const app = new _koa2.default();
  const server = _http2.default.Server(app.callback());
  const validator = (0, _ajv2.default)({ allErrors: true, removeAdditional: true, useDefaults: true });

  if (areSocketsEnabled) {
    const sockets = (0, _socket2.default)(server);
    addService('sockets', () => sockets);
  }

  app.use((0, _kcors2.default)(cors));
  app.use((0, _koaMorgan2.default)(format, options));
  app.use((0, _koaBody2.default)(body));

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      if (error.stack) console.log(error.stack);else console.log(error);
      const { errors = [{ key: 'internal', value: 'server error' }], status = 500 } = error;
      ctx.status = status;
      ctx.body = { errors };
    }
  });

  Object.keys(controllers).forEach(item => {
    const list = {};
    controllers[item].forEach(element => {
      const [title] = element;
      addService(...element);
      list[title] = bottle.container[title];
    });
    (0, _controllers.use)(item, list, app, schema, validator, routes);
  });

  return { routes, server };
};

exports.addService = addService;
exports.bottle = bottle;
exports.load = load;
exports.loadMigrations = loadMigrations;
exports.serve = serve;