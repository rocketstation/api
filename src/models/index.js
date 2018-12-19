import Bluebird from 'bluebird'
import merge from 'deepmerge'
import fs from 'fs'
import parseFunction from 'parse-function'
import path from 'path'
import pluralize from 'pluralize'
import { cl, cu, sl } from '@rocketstation/change-case'

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
      relatedModel = sequelize.models[cl(relation)]
      break
    }
    case 'object': {
      const { model: declaredModel, scope, ...rest } = definition
      relation = declaredModel
      relatedModel = sequelize.models[cl(relation)]
      if (scope) {
        constrain = false
        if (scope.method) relatedModel = relatedModel.scope(scope)
      }
      options = rest
      break
    }
  }
  if (constrain) {
    if (type === 'belongsToMany' && !options.through) { options.through = sequelize.models[cl(title > relation ? [relation, title] : [title, relation])] }

    const { onDelete = 'cascade', foreignKey = {}, otherKey = {}, ...opts } = options
    const keys = type === 'belongsToMany' ? { foreignKey, otherKey } : { foreignKey }

    Object.entries(keys).forEach(([k, v]) => {
      let key = v
      const allowNull = onDelete.toLowerCase() === 'set null'
      let name = cl(type === 'belongsTo' || k === 'otherKey' ? relation : title, 'id')
      if (typeof v === 'string') {
        name = v
        key = {}
      }
      keys[k] = merge({ allowNull, name, field: sl(name) }, key)
    })

    options = merge({ ...keys, onDelete, hooks: true }, opts)
  }
  model[type](relatedModel, options)
}

const factory = (container, title) => {
  const { sequelize, Sequelize } = container
  const { associations = {}, attributes = {}, classMethods = {}, instanceMethods = {}, ...options } = container[title]
  if (!options.tableName) options.tableName = getTableName(title)
  if (!attributes.id) {
    attributes.id = {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    }
  }
  const model = sequelize.define(title, attributes, options)
  Object.keys(classMethods).forEach((item) => {
    model[item] = classMethods[item]
  })
  Object.keys(instanceMethods).forEach((item) => {
    model.prototype[item] = instanceMethods[item]
  })
  ;['hasMany', 'belongsTo', 'belongsToMany'].forEach((item) => {
    const definition = associations[item]
    if (definition) associate(model, cu(title), sequelize, item, definition)
  })
  return model
}

const getFilePath = (dir, model) => path.join(dir, model, 'model.js')

export const getTableName = (title) => sl(pluralize(title))

const load = (dir) => {
  const modelsDir = path.join(dir, 'models')
  const result = {}
  if (fs.existsSync(modelsDir)) {
    fs
      .readdirSync(modelsDir)
      .filter(item => fs.lstatSync(path.join(modelsDir, item)).isDirectory() && fs.existsSync(getFilePath(modelsDir, item)))
      .forEach(item => {
        const definition = require(getFilePath(modelsDir, item))
        const title = cl(item)
        result[title] = {
          args: parseFunction(definition).args,
          definition,
          name: cu(title),
          factory (container) {
            return factory(container, title)
          }
        }
      })
  }
  return Bluebird.resolve(result)
}

export default load
