'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _parseFunction = require('parse-function');

var _parseFunction2 = _interopRequireDefault(_parseFunction);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = (dir, env) => {
  const mainDir = (0, _path.join)(dir, 'config');
  const dirs = { common: mainDir, environment: (0, _path.join)(mainDir, env) };
  const result = {};['bootstrap', 'seeds'].forEach(item => {
    result[item] = [];['common', 'environment'].forEach(element => {
      const file = (0, _path.join)(dirs[element], `${item}.js`);
      const title = `${element}-${item}`;
      if (_fs2.default.existsSync(file)) {
        const definition = require(file);
        result[item].push([title, definition, ...(0, _parseFunction2.default)(definition).args]);
      }
    });
  });

  return _bluebird2.default.resolve(result);
};

exports.default = load;