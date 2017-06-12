'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = () => {
  let { NODE_ENV: env } = process.env;
  if (!['p', 'i', 'production', 'integration'].includes(env)) env = 'development';
  const map = {
    p: 'production',
    i: 'integration'
  };
  return _bluebird2.default.resolve(map[env] || env);
};

exports.default = load;