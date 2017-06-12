'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _paginate = require('./predefined/paginate');

var _paginate2 = _interopRequireDefault(_paginate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const predefine = (config = {}, predefined = {}, namespace = 'schema') => {
  if (typeof config === 'object') {
    Object.keys(config).forEach(item => {
      const element = config[item];
      const title = `${namespace}.${item}`;
      switch (typeof element) {
        case 'object':
          predefine(element, predefined, title);
          break;
        case 'function':
          predefined[title] = element;
          break;
      }
    });
  }
  return predefined;
};

const detect = (props, keys, whitelist, predefined) => {
  let flag = false;
  if (keys.some(item => whitelist.includes(item))) {
    flag = true;
    keys.filter(item => whitelist.includes(item)).forEach(item => {
      props[item] = props[item].map(element => parse(element, predefined).schema);
    });
  }
  return flag;
};

const parse = (schema, predefined) => {
  if (schema.constructor !== Array) {
    return { schema };
  }
  const required = [];
  const schemes = [];
  let config = {};
  let isRequired = false;
  let result = {};
  let defined;
  let title;
  let type = 'string';
  schema.forEach(item => {
    switch (typeof item) {
      case 'string':
        if (item.includes('|') || ['number', 'integer', 'string', 'boolean', 'array', 'object', 'null'].includes(item)) type = item;else if (item.startsWith('schema.')) defined = item;else title = item;
        break;
      case 'boolean':
        isRequired = item;
        break;
      case 'object':
        if (item.constructor === Array) schemes.push(item);else config = item;
        break;
    }
  });
  if (defined) {
    const fn = predefined[defined];
    if (fn) {
      const parsed = parse(fn(config), predefined);
      result = parsed.schema;
      title = parsed.title;
      isRequired = parsed.isRequired;
    }
  } else {
    const keys = Object.keys(config);
    if (keys.length > 0) {
      if (detect(config, keys, ['not', 'oneOf', 'anyOf', 'allOf'], predefined)) type = null;
      if (detect(config, keys, ['items', 'additionalItems', 'contains'], predefined)) type = 'array';
    }
    if (schemes.length > 0) {
      type = 'object';
      result.properties = {};
      schemes.forEach(item => {
        const parsed = parse(item, predefined);
        if (parsed.title) {
          if (parsed.isRequired) required.push(parsed.title);
          result.properties = Object.assign(result.properties, parsed.schema);
        } else {
          result = parsed.schema;
        }
      });
    }
    if (type === 'object') result.additionalProperties = false;
    result = Object.assign(result, config);
    if (type) result.type = type;
    if (required.length > 0) result.required = required;
    if (title) result = { [title]: result };
  }
  return {
    isRequired,
    schema: result,
    title
  };
};

const load = (config = {}) => {
  let predefined = predefine({ paginate: _paginate2.default });
  predefined = predefine(config, predefined);
  return _bluebird2.default.resolve({ parse(schema) {
      return parse(schema, predefined);
    } });
};

exports.default = load;