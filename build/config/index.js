'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _changeCase = require('change-case');

var _changeCase2 = _interopRequireDefault(_changeCase);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const loadEnvConfigs = (configFiles, envDir, mainDir) => {
  configFiles.forEach(file => {
    const mainFile = _path2.default.join(mainDir, file);
    const envFile = _path2.default.join(envDir, file);

    let data = {};
    if (_fs2.default.existsSync(mainFile)) data = require(mainFile);
    if (_fs2.default.existsSync(envFile)) data = Object.assign({}, data, require(envFile));

    Object.keys(data).forEach(prop => {
      process.env[prop] = data[prop];
    });
  });
};

const getTitle = file => file.split('.')[0];

const readConfigs = (dir, ignored) => _fs2.default.readdirSync(dir).filter(item => item.includes('.js')).filter(item => !ignored.includes(getTitle(item)));

const load = (env, dir) => {
  const mainDir = _path2.default.join(dir, 'config');

  if (!_fs2.default.existsSync(mainDir)) return _bluebird2.default.reject('config directory doesn\'t exist');

  const envDir = _path2.default.join(mainDir, env);

  loadEnvConfigs(['env.js', 'secret.js'], envDir, mainDir);

  const result = {};
  const dirs = [mainDir];

  if (_fs2.default.existsSync(envDir)) dirs.push(envDir);

  dirs.forEach(configDir => {
    readConfigs(configDir, ['seeds', 'secret', 'env', 'bootstrap']).forEach(file => {
      const title = _changeCase2.default.camel(getTitle(file));

      result[title] = Object.assign(result[title] || {}, require(_path2.default.join(configDir, file)));
    });
  });
  return _bluebird2.default.resolve(result);
};

exports.default = load;