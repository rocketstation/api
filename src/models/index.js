import Bluebird from 'bluebird'
import {
  camel,
  pascal,
  snake
} from 'change-case'
import fs from 'fs'
import parseFunction from 'parse-function'
import path from 'path'
import pluralize from 'pluralize'

const associate = (model, title, sequelize, type, definition) => {
  if (Array.isArray(definition)) {
    definition.forEach((item) => associate(model, title, sequelize, type, item))
    return
  }
  let options = {}
  let relation
  let relatedModel
  let constrain = true

  switch (typeof definition) {
    case 'string': {
      relation = definition
      relatedModel = sequelize.models[camel(relation)]
      break
    }
    case 'object': {
      const { model: declaredModel, scope, ...rest } = definition
      relation = declaredModel
      relatedModel = sequelize.models[camel(relation)]
      if (scope) {
        constrain = false
        if (scope.method) relatedModel = relatedModel.scope(scope)
      }
      options = rest
      break
    }
  }
  if (constrain) {
    if (type === 'belongsToMany' && !options.through) { options.through = snake(title > relation ? `${relation}${pluralize(title)}` : `${title}${pluralize(relation)}`) }

    if (['hasMany', 'belongsTo'].includes(type)) {
      const fkName = `${camel(type === 'hasMany' ? title : relation)}ID`
      options = { ...{ onDelete: 'cascade', foreignKey: { allowNull: false, name: fkName, field: snake(fkName) }, hooks: true }, ...options }
    }
  }
  model[type](relatedModel, options)
}

const factory = (container, title) => {
  const { sequelize } = container
  const { associations = {}, attributes = {}, ...options } = container[title]
  if (!options.tableName) options.tableName = snake(pluralize(title))
  const model = sequelize.define(title, attributes, options)
  ;['hasMany', 'belongsTo', 'belongsToMany'].forEach((item) => {
    const definition = associations[item]
    if (definition) associate(model, pascal(title), sequelize, item, definition)
  })
  return model
}

const getFilePath = (dir, model) => path.join(dir, model, 'model.js')

const load = (dir) => {
  const modelsDir = path.join(dir, 'models')
  const result = {}
  if (fs.existsSync(modelsDir)) {
    fs
      .readdirSync(modelsDir)
      .filter(item => fs.lstatSync(path.join(modelsDir, item)).isDirectory() && fs.existsSync(getFilePath(modelsDir, item)))
      .forEach(item => {
        const definition = require(getFilePath(modelsDir, item))
        const title = camel(item)
        result[title] = {
          args: parseFunction(definition).args,
          definition,
          name: pascal(title),
          factory (container) {
            return factory(container, title)
          }
        }
      })
  }
  return Bluebird.resolve(result)
}

export default load
