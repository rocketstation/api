import ajv from 'ajv'
import Bluebird from 'bluebird'
import Bottle from 'bottlejs'
import { param } from 'change-case'
import fs from 'fs'
import http from 'http'
import kcors from 'kcors'
import Koa from 'koa'
import koaBody from 'koa-body'
import koaMorgan from 'koa-morgan'
import Router from 'koa-router'
import moment from 'moment-timezone'
import path from 'path'
import pgpLib from 'pg-promise'
import pgpMonitor from 'pg-monitor'
import Sequelize from 'sequelize'
import socketIO from 'socket.io'

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

const load = async (dir = process.cwd()) => {
  addService('Bluebird', () => Bluebird)
  addService('fs', () => fs)
  addService('path', () => path)
  addService('pgp', () => pgp)
  addService('Sequelize', () => Sequelize)

  moment.tz.setDefault('UTC')
  addService('moment', () => moment)

  const environment = await environmentLoader()
  const { db: dbConfig, dependencies, mail: mailConfig, ...config } = await configLoader(environment, dir)

  if (dependencies) Object.keys(dependencies).forEach((item) => { addService(item, () => dependencies[item]) })
  addService('config', () => config)

  const db = await dbLoader(dbConfig)
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

  return { bootstrap, config, sequelize, seeds }
}

const loadMigrations = async (dir = process.cwd()) => {
  const { sequelize, seeds } = await load(dir)
  const migrations = await migrationsLoader(dir)
  Object.keys(migrations).forEach((item) => {
    const title = item.split('.').join('')
    addService(title, ...migrations[item])
    migrations[item] = bottle.container[title]
  })
  return {
    getPending (connection) { return getPending(connection, migrations) },
    run (connection, type, model, version) { return run(connection, type, model, version, migrations, sequelize) },
    runPending (connection) { return runPending(connection, migrations, sequelize) },
    seed () {
      if (seeds.length > 0) return Bluebird.each(seeds, item => item())
      return Bluebird.resolve()
    }
  }
}

const serve = async (dir = process.cwd(), areSocketsEnabled = false) => {
  const app = new Koa()
  const server = http.Server(app.callback())

  if (areSocketsEnabled) {
    const sockets = socketIO(server)
    addService('sockets', () => sockets)
  }

  const { bootstrap, config: { body = {}, cors = {}, morgan: { format = 'dev', options = {} } = {}, schemaConfig } } = await load(dir)

  if (bootstrap.length > 0) await Bluebird.each(bootstrap, item => item())

  const schema = await schemaLoader(schemaConfig)
  addService('schema', () => schema)
  const validator = ajv({ allErrors: true, removeAdditional: true, useDefaults: true })
  const controllers = await controllersLoader(dir, addService, bottle.container)
  const routes = {}

  app.use(kcors(cors))
  app.use(koaMorgan(format, options))
  app.use(koaBody(body))

  app.use(async (ctx, next) => {
    try {
      await next()
    } catch (error) {
      if (error.stack) console.log(error.stack)
      console.log(error)
      const { status = 500 } = error
      const errors = status === 500 ? [{ key: 'internal', value: 'server error' }] : error.errors
      ctx.status = status
      ctx.body = { errors }
    }
  })

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
        if (element.method) {
          useAction(schema, validator, router, routes, `${route}/`, nextBefores, item, element)
        } else {
          const { before, ...rest } = element
          Object.keys(rest).forEach((name) => useAction(schema, validator, router, routes, `${route}/${item}-`, before ? [...nextBefores, getBefore(before)] : nextBefores, param(name), rest[name]))
        }
      }
    })
  }

  const router = new Router()

  use(controllers, router)

  app.use(router.routes()).use(router.allowedMethods())

  return { app, routes, server }
}

export { addService, bottle, load, loadMigrations, serve }
