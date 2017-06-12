'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _changeCase = require('change-case');

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _parseFunction = require('parse-function');

var _parseFunction2 = _interopRequireDefault(_parseFunction);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _pluralize = require('pluralize');

var _pluralize2 = _interopRequireDefault(_pluralize);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

const associate = (model, title, sequelize, type, definition) => {
  if (Array.isArray(definition)) {
    definition.forEach(item => associate(model, title, sequelize, type, item));
    return;
  }
  let options = {};
  let relation;
  let relatedModel;
  let constrain = true;

  switch (typeof definition) {
    case 'string':
      {
        relation = definition;
        relatedModel = sequelize.models[(0, _changeCase.camel)(relation)];
        break;
      }
    case 'object':
      {
        const { model: declaredModel, scope } = definition,
              rest = _objectWithoutProperties(definition, ['model', 'scope']);
        relation = declaredModel;
        relatedModel = sequelize.models[(0, _changeCase.camel)(relation)];
        if (scope) {
          constrain = false;
          if (scope.method) relatedModel = relatedModel.scope(scope);
        }
        options = rest;
        break;
      }
  }
  if (constrain) {
    if (type === 'belongsToMany' && !options.through) {
      options.through = (0, _changeCase.snake)(title > relation ? `${relation}${(0, _pluralize2.default)(title)}` : `${title}${(0, _pluralize2.default)(relation)}`);
    }

    if (['hasMany', 'belongsTo'].includes(type)) {
      const fkName = `${(0, _changeCase.camel)(type === 'hasMany' ? title : relation)}ID`;
      options = _extends({ onDelete: 'cascade', foreignKey: { allowNull: false, name: fkName, field: (0, _changeCase.snake)(fkName) }, hooks: true }, options);
    }
  }
  model[type](relatedModel, options);
};

const factory = (container, title) => {
  const { sequelize } = container;
  const _container$title = container[title],
        { associations = {}, attributes = {} } = _container$title,
        options = _objectWithoutProperties(_container$title, ['associations', 'attributes']);
  if (!options.tableName) options.tableName = (0, _pluralize2.default)(title);
  const model = sequelize.define(title, attributes, options);['hasMany', 'belongsTo', 'belongsToMany'].forEach(item => {
    const definition = associations[item];
    if (definition) associate(model, (0, _changeCase.pascal)(title), sequelize, item, definition);
  });
  return model;
};

const getFilePath = (dir, model) => _path2.default.join(dir, model, 'model.js');

const load = dir => {
  const modelsDir = _path2.default.join(dir, 'models');
  const result = {};
  if (_fs2.default.existsSync(modelsDir)) {
    _fs2.default.readdirSync(modelsDir).filter(item => _fs2.default.lstatSync(_path2.default.join(modelsDir, item)).isDirectory() && _fs2.default.existsSync(getFilePath(modelsDir, item))).forEach(item => {
      const definition = require(getFilePath(modelsDir, item));
      const title = (0, _changeCase.camel)(item);
      result[title] = {
        args: (0, _parseFunction2.default)(definition).args,
        definition,
        name: (0, _changeCase.pascal)(title),
        factory(container) {
          return factory(container, title);
        }
      };
    });
  }
  return _bluebird2.default.resolve(result);
};

exports.default = load;