import ajv from 'ajv'
import Bluebird from 'bluebird'
import Bottle from 'bottlejs'
import fs from 'fs'
import kcors from 'kcors'
import Koa from 'koa'
import koaBody from 'koa-body'
import koaMorgan from 'koa-morgan'
import Router from 'koa-router'
import path from 'path'
import pgpLib from 'pg-promise'
import pgpMonitor from 'pg-monitor'
import { k as kebab } from '@rocketstation/change-case'
import Sequelize from 'sequelize'

import configLoader from './config'
import controllersLoader, { useAction } from './controllers'
import dbLoader from './db'
import environmentLoader from './environment'
import mailLoader from './mail'
import migrationsLoader, { getPending, run, runPending } from './migrations'
import modelsLoader, { getTableName } from './models'
import schemaLoader from './schema'
import scriptsLoader from './scripts'
import servicesLoader from './services'

const pgpOptions = {
  promiseLib: Bluebird
}
try {
  pgpMonitor.attach(pgpOptions, ['error'])
} catch (error) {
  if (error.toString().includes('detach')) {
    pgpMonitor.detach()
    pgpMonitor.attach(pgpOptions, ['error'])
  }
}

const pgp = pgpLib(pgpOptions)

const load = async (dir = process.cwd(), configCustom = {}) => {
  const bottle = new Bottle()

  const addService = (name, fn, ...deps) => {
    bottle.factory(name, (container) => {
      const resolvedDependencies = []

      deps.forEach((item) => {
        resolvedDependencies.push(container[item])
      })

      return fn(...resolvedDependencies)
    })
  }

  addService('Bluebird', () => Bluebird)
  addService('fs', () => fs)
  addService('path', () => path)
  addService('pgp', () => pgp)
  addService('Sequelize', () => Sequelize)

  const environment = await environmentLoader()
  const { db: dbConfig, dependencies, mail: mailConfig, ...config } = await configLoader(environment, dir)

  if (dependencies) Object.keys(dependencies).forEach((item) => { addService(item, () => dependencies[item]) })
  addService('config', () => config)

  const { db: dbConfigCustom = {} } = configCustom

  const db = await dbLoader({ ...dbConfig, ...dbConfigCustom })
  addService('db', () => db)

  if (mailConfig) {
    const mail = await mailLoader(mailConfig, dir)
    addService('mail', () => mail)
  }

  const services = await servicesLoader(dir)
  Object.keys(services).forEach((item) => { addService(item, ...services[item]) })

  const sequelize = new Sequelize(`${db.connectionString}/${db.name}`, db.sequelizeOptions)

  const models = await modelsLoader(dir)
  const modelsKeys = Object.keys(models)

  modelsKeys.forEach((item) => {
    sequelize.define(item, {}, { tableName: getTableName(item) })
    addService(item, models[item].definition, ...models[item].args)
  })

  addService('sequelize', () => sequelize)

  modelsKeys.forEach((item) => {
    bottle.factory(models[item].name, models[item].factory)
  })

  const scripts = await scriptsLoader(dir, environment)
  const promises = {}
  ;['bootstrap', 'seeds'].forEach((item) => {
    promises[item] = []
    scripts[item].forEach((element) => {
      addService(...element)
      promises[item].push(bottle.container[element[0]])
    })
  })

  const { bootstrap, seeds } = promises

  return { addService, bootstrap, bottle, config, sequelize, seeds }
}

const loadMigrations = async (dir = process.cwd()) => {
  const { addService, bottle, sequelize, seeds } = await load(dir)
  const migrations = await migrationsLoader(dir)
  Object.keys(migrations).forEach((item) => {
    const title = item.split('.').join('')
    addService(title, ...migrations[item])
    migrations[item] = bottle.container[title]
  })
  return {
    bottle,
    getPending (connection) { return getPending(connection, migrations) },
    run (connection, type, model, version) { return run(connection, type, model, version, migrations, sequelize) },
    runPending (connection) { return runPending(connection, migrations, sequelize) },
    seed () {
      if (seeds.length > 0) return Bluebird.each(seeds, item => item())
      return Bluebird.resolve()
    }
  }
}

const serve = async (dir = process.cwd()) => {
  const app = new Koa()

  const { addService, bootstrap, bottle, config: { body: { formidable = {}, ...body } = {}, cors = {}, morgan: { format = 'dev', options = {} } = {}, schemaConfig } } = await load(dir)

  if (bootstrap.length > 0) await Bluebird.each(bootstrap, item => item())

  const schema = await schemaLoader(schemaConfig)

  addService('schema', () => schema)

  const validator = ajv({ allErrors: true, removeAdditional: true, useDefaults: true })
  const controllers = await controllersLoader(dir, addService, bottle.container)
  const routes = {}

  app.use(async (ctx, next) => {
    try {
      await next()
    } catch (error) {
      if (error.stack) console.log(error.stack)

      const { status = 500 } = error
      const errors = status === 500 ? [{ key: 'internal', value: 'server error' }] : error.errors
      ctx.status = status
      ctx.body = { errors }
    }
  })

  app.use(kcors(cors))
  app.use(koaMorgan(format, options))

  const getBefore = (fn) => async (ctx, next) => {
    await fn(ctx)

    await next()
  }

  const use = ({ index, ...items }, router, route = '', befores = []) => {
    let nextBefores = [...befores]

    if (index && index.before) nextBefores = [...nextBefores, getBefore(index.before)]

    Object.keys(items).forEach((item) => {
      const element = items[item]

      if (element.isNamespace) {
        use(element, router, `${route}/${item}`, nextBefores)
      } else {
        const { before, body: { formidable: formidableEl = {}, ...bodyEl } = {}, ...rest } = element

        const nextBeforesEl = [...nextBefores]

        if (before) nextBeforesEl.push(getBefore(before))

        nextBeforesEl.push(koaBody({ formidable: { ...formidable, ...formidableEl }, ...body, ...bodyEl }))

        if (rest.method) {
          useAction(schema, validator, router, routes, `${route}/`, nextBeforesEl, item, rest)
        } else {
          Object.keys(rest).forEach((name) => useAction(schema, validator, router, routes, `${route}/${item}-`, nextBeforesEl, kebab(name), rest[name]))
        }
      }
    })
  }

  const router = new Router()

  use(controllers, router)

  app.use(router.routes()).use(router.allowedMethods())

  return { app, routes }
}

export { load, loadMigrations, serve }
