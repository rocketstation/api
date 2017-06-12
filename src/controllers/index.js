import Bluebird from 'bluebird'
import { pascal, param } from 'change-case'
import fs from 'fs'
import Router from 'koa-router'
import parseFunction from 'parse-function'
import { join } from 'path'

const isFile = (file) => file.includes('.js')

const loadRecursively = (dir, namespaces = {}, namespace = '') => {
  if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
    fs
      .readdirSync(dir)
      .filter((item) => !item.includes('.') || isFile(item))
      .forEach((item) => {
        if (isFile(item)) {
          const title = `${pascal(namespace)}${pascal(item.split('.')[0])}Controller`
          const definition = require(join(dir, item))
          if (!namespaces[namespace]) namespaces[namespace] = []
          namespaces[namespace].push([title, definition, ...parseFunction(definition).args])
        } else {
          loadRecursively(join(dir, item), namespaces, item)
        }
      })
  }
}

const load = (dir) => {
  const controllersDir = join(dir, 'controllers')
  const namespaces = {}

  loadRecursively(controllersDir, namespaces)

  return Bluebird.resolve(namespaces)
}

const setBefore = (router, fn, url) => {
  const middleware = async (ctx, next) => {
    await fn(ctx)
    await next()
  }
  if (url) router.use(url, middleware)
  else router.use(middleware)
}

const use = (namespace, controllers, app, parser, validator, routes = {}) => {
  const router = namespace === '' ? new Router() : new Router({ prefix: `/${namespace}` })
  Object.keys(controllers)
    .sort((a, b) => { return a.includes('Index') ? -1 : b.includes('Index') ? 1 : 0 })
    .forEach((item) => {
      const { before, ...rest } = controllers[item]
      if (item.includes('Index') && before) {
        setBefore(router, before)
      } else {
        Object.keys(rest).forEach((element) => {
          const {
          onError = ({ errors = [], isValidation, status = 400 }) => {
            return Bluebird.reject({
              status,
              errors: isValidation ? errors.map(({ dataPath: key, message: value }) => ({ key, value })) : errors
            })
          },
          logging = {},
          method,
          schema,
          type = 'post',
          url = `/${param(item.replace(pascal(namespace), '').replace('Controller', ''))}-${param(element)}`
        } = rest[element]
          if (method) {
            router.use(url, async (ctx, next) => {
              try {
                await next()
              } catch (error) {
                if (error.stack) throw (error)
                else return onError(error)
              }
            })
            if (schema) {
              const isValid = validator.compile(parser.parse(schema).schema)
              router.use(url, async (ctx, next) => {
                ctx.request.body = ctx.request.body || {}
                if (logging.body) console.log(JSON.stringify(ctx.request.body))
                if (!isValid(ctx.request.body)) {
                  return Bluebird.reject({ errors: isValid.errors, isValidation: true })
                }
                await next()
              })
            }
            if (before) setBefore(router, before, schema)
            router[type](url, async (ctx) => {
              if (logging.schema) console.log(JSON.stringify(ctx.request.body))
              await method(ctx)
              if (logging.body) console.log(JSON.stringify(ctx.body))
            })
            routes[namespace === '' ? url : `/${namespace}${url}`] = `${item}.${element}`
          }
        })
      }
    })
  app.use(router.routes()).use(router.allowedMethods())
}

export default load
export { use }
