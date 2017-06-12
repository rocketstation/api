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

var _parseFunction = require('parse-function');

var _parseFunction2 = _interopRequireDefault(_parseFunction);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getTitle = file => `${_changeCase2.default.pascal(file.split('.')[0])}Service`;

const load = dir => {
  const servicesDir = _path2.default.join(dir, 'services');
  const result = {};
  if (_fs2.default.existsSync(servicesDir)) {
    _fs2.default.readdirSync(servicesDir).filter(item => item.includes('.js')).forEach(item => {
      const title = getTitle(item);
      const definition = require(_path2.default.join(servicesDir, item));
      result[title] = [definition, ...(0, _parseFunction2.default)(definition).args];
    });
  }
  return _bluebird2.default.resolve(result);
};

exports.default = load;