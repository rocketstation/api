'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.runPending = exports.run = exports.getPending = undefined;

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _parseFunction = require('parse-function');

var _parseFunction2 = _interopRequireDefault(_parseFunction);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _pluralize = require('pluralize');

var _pluralize2 = _interopRequireDefault(_pluralize);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getDirPath = (dir, model) => _path2.default.join(dir, model, 'migrations');
const getTableName = migrationTitle => (0, _pluralize2.default)(migrationTitle.split('.').slice(0, -1).join('_'));

const load = dir => {
  const modelsDir = _path2.default.join(dir, 'models');
  const result = {};
  _fs2.default.readdirSync(modelsDir).filter(item => _fs2.default.lstatSync(_path2.default.join(modelsDir, item)).isDirectory() && _fs2.default.existsSync(getDirPath(modelsDir, item))).forEach(item => {
    const migrationsDir = getDirPath(modelsDir, item);
    if (_fs2.default.existsSync(migrationsDir)) {
      _fs2.default.readdirSync(migrationsDir).filter(element => element.endsWith('.js')).forEach(element => {
        const [title] = element.split('.');
        const definition = require(_path2.default.join(migrationsDir, element));
        result[`${item}.${title}`] = [definition, ...(0, _parseFunction2.default)(definition).args];
      });
    }
  });
  return _bluebird2.default.resolve(result);
};

const getPending = async (connection, migrations) => {
  const data = await connection.query('select * from rstation_api_migrations');
  const executed = data.map(({ title }) => title);
  const createdTables = [];
  executed.forEach(item => {
    const table = getTableName(item);
    if (!createdTables.includes(table)) createdTables.push(table);
  });
  const pendingUnsorted = [];
  Object.keys(migrations).forEach(item => {
    if (!executed.includes(item)) {
      const method = migrations[item].up;
      const body = method.toString().replace(/\r?\n|\r/g, '').replace(/ /g, '');
      const references = [];
      const regex = /references:{model:'([a-z_]+)'|\.(addColumn|removeColumn|changeColumn|renameColumn)\('([a-z_]+)'/g;
      let match = regex.exec(body);
      while (match) {
        const tableName = match[1] || match[3];
        if (tableName && !references.includes(tableName)) references.push(tableName);
        match = regex.exec(body);
      }
      const table = getTableName(item);
      pendingUnsorted.push({ method, table, references, title: item });
    }
  });
  let pending = pendingUnsorted.filter(({ references }) => references.length === 0);
  while (pending.length !== pendingUnsorted.length) {
    pending.forEach(({ table }) => {
      if (!createdTables.includes(table)) createdTables.push(table);
    });
    pending = pending.concat(pendingUnsorted.filter(({ table, references }) => {
      if (createdTables.includes(table) && !references.includes(table)) return false;
      let flag = true;
      references.forEach(item => {
        flag = flag && createdTables.includes(item);
      });
      return flag;
    }));
  }
  return pending;
};

const run = async (connection, type, model, version = '', migrations, sequelize) => {
  const title = `${model}.${version}`;
  const versions = Object.keys(migrations).filter(item => item.startsWith(title));
  if (versions.length === 0) return _bluebird2.default.reject(`no migrations found for '${model}' model`);
  if (version && !versions.includes(title)) return _bluebird2.default.reject(`no '${model}' model migration with '${version}' version found`);
  let toRun = [];
  let isToRun = () => false;
  if (type === 'up') isToRun = (list, item) => list.includes(item);
  if (type === 'down') isToRun = (list, item) => !list.includes(item);
  const pending = await getPending(connection, migrations);
  const pendingTitles = pending.map(({ title }) => title);
  if (version) {
    if (isToRun(pendingTitles, title)) toRun = [{ title, method: migrations[title][type] }];
  } else {
    toRun = versions.filter(item => isToRun(pendingTitles, item)).map(item => ({ title: item, method: migrations[item][type] }));
  }
  const queryInterface = sequelize.getQueryInterface();
  await _bluebird2.default.all(toRun.map(migration => migration.method(queryInterface)));
  if (type === 'up') await connection.query(`insert into rstation_api_migrations (title) values ${toRun.map(migration => `('${migration.title}')`).join(', ')};`);
  if (type === 'down') await connection.query(`delete from rstation_api_migrations where title in (${toRun.map(migration => `'${migration.title}'`).join(', ')});`);
};

const runPending = async (connection, migrations, sequelize) => {
  const pending = await getPending(connection, migrations);
  const queryInterface = sequelize.getQueryInterface();
  if (pending.length > 0) {
    await _bluebird2.default.each(pending, item => item.method(queryInterface));
    await connection.query(`insert into rstation_api_migrations (title) values ${pending.map(migration => `('${migration.title}')`).join(', ')};`);
  }
};

exports.default = load;
exports.getPending = getPending;
exports.run = run;
exports.runPending = runPending;