'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.use = undefined;

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _changeCase = require('change-case');

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _koaRouter = require('koa-router');

var _koaRouter2 = _interopRequireDefault(_koaRouter);

var _parseFunction = require('parse-function');

var _parseFunction2 = _interopRequireDefault(_parseFunction);

var _path = require('path');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

const isFile = file => file.includes('.js');

const loadRecursively = (dir, namespaces = {}, namespace = '') => {
  if (_fs2.default.existsSync(dir) && _fs2.default.lstatSync(dir).isDirectory()) {
    _fs2.default.readdirSync(dir).filter(item => !item.includes('.') || isFile(item)).forEach(item => {
      if (isFile(item)) {
        const title = `${(0, _changeCase.pascal)(namespace)}${(0, _changeCase.pascal)(item.split('.')[0])}Controller`;
        const definition = require((0, _path.join)(dir, item));
        if (!namespaces[namespace]) namespaces[namespace] = [];
        namespaces[namespace].push([title, definition, ...(0, _parseFunction2.default)(definition).args]);
      } else {
        loadRecursively((0, _path.join)(dir, item), namespaces, item);
      }
    });
  }
};

const load = dir => {
  const controllersDir = (0, _path.join)(dir, 'controllers');
  const namespaces = {};

  loadRecursively(controllersDir, namespaces);

  return _bluebird2.default.resolve(namespaces);
};

const setBefore = (router, fn, url) => {
  const middleware = async (ctx, next) => {
    await fn(ctx);
    await next();
  };
  if (url) router.use(url, middleware);else router.use(middleware);
};

const use = (namespace, controllers, app, parser, validator, routes = {}) => {
  const router = namespace === '' ? new _koaRouter2.default() : new _koaRouter2.default({ prefix: `/${namespace}` });
  Object.keys(controllers).sort((a, b) => {
    return a.includes('Index') ? -1 : b.includes('Index') ? 1 : 0;
  }).forEach(item => {
    const _controllers$item = controllers[item],
          { before } = _controllers$item,
          rest = _objectWithoutProperties(_controllers$item, ['before']);
    if (item.includes('Index') && before) {
      setBefore(router, before);
    } else {
      Object.keys(rest).forEach(element => {
        const {
          onError = ({ errors = [], isValidation, status = 400 }) => {
            return _bluebird2.default.reject({
              status,
              errors: isValidation ? errors.map(({ dataPath: key, message: value }) => ({ key, value })) : errors
            });
          },
          logging = {},
          method,
          schema,
          type = 'post',
          url = `/${(0, _changeCase.param)(item.replace((0, _changeCase.pascal)(namespace), '').replace('Controller', ''))}-${(0, _changeCase.param)(element)}`
        } = rest[element];
        if (method) {
          router.use(url, async (ctx, next) => {
            try {
              await next();
            } catch (error) {
              if (error.stack) throw error;else return onError(error);
            }
          });
          if (schema) {
            const isValid = validator.compile(parser.parse(schema).schema);
            router.use(url, async (ctx, next) => {
              ctx.request.body = ctx.request.body || {};
              if (logging.body) console.log(JSON.stringify(ctx.request.body));
              if (!isValid(ctx.request.body)) {
                return _bluebird2.default.reject({ errors: isValid.errors, isValidation: true });
              }
              await next();
            });
          }
          if (before) setBefore(router, before, schema);
          router[type](url, async ctx => {
            if (logging.schema) console.log(JSON.stringify(ctx.request.body));
            await method(ctx);
            if (logging.body) console.log(JSON.stringify(ctx.body));
          });
          routes[namespace === '' ? url : `/${namespace}${url}`] = `${item}.${element}`;
        }
      });
    }
  });
  app.use(router.routes()).use(router.allowedMethods());
};

exports.default = load;
exports.use = use;