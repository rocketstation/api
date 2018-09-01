import Bluebird from 'bluebird'
import fs from 'fs'
import parseFunction from 'parse-function'
import { join } from 'path'
import { cu } from '@rocketstation/change-case'

export const useAction = (parser, validator, router, routes, route, befores, name, action) => {
  const {
    before,
    logging = {},
    method,
    onError,
    schema,
    type = 'post',
    url = `${route}${name}`
  } = action

  const middlewares = [...befores]

  if (method) {
    if (before) {
      middlewares.push(async (ctx, next) => {
        await before(ctx)
        await next()
      })
    }
    const onValidationError = (error) => error.isValidation ? error.errors.map(({ dataPath: key, message: value }) => ({ key, value })) : null
    middlewares.push(async (ctx, next) => {
      try {
        await next()
      } catch (error) {
        let errors
        if (error.constructor === Array) errors = error
        if (!errors && onError) errors = await onError(error)
        if (!errors) errors = onValidationError(error)
        if (!errors) throw (error)
        else return Bluebird.reject({ status: 400, errors })
      }
    })
    if (schema) {
      const isValid = validator.compile(parser.parse(schema).schema)
      middlewares.push(async (ctx, next) => {
        ctx.request.body = ctx.request.body || {}
        if (logging.body) console.log(JSON.stringify(ctx.request.body))
        if (!isValid(ctx.request.body)) {
          return Bluebird.reject({ errors: isValid.errors, isValidation: true })
        }
        await next()
      })
    }
    router.use(url, ...middlewares)
    router[type](url, async (ctx) => {
      if (logging.schema) console.log(JSON.stringify(ctx.request.body))
      await method(ctx)
      if (logging.body) console.log(JSON.stringify(ctx.body))
    })
    routes[url] = cu(url)
  }
}

const isFile = (file) => file.includes('.js')

const loadRecursively = (dir, controllers, addService, container, namespaces = []) => {
  if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
    fs
      .readdirSync(dir)
      .filter((item) => !item.includes('.') || isFile(item))
      .forEach((item) => {
        if (isFile(item)) {
          const [name] = item.split('.')
          const title = cu(...[].concat(namespaces, name, 'Controller'))
          const definition = require(join(dir, item))
          const dependencies = parseFunction(definition).args
          addService(title, definition, ...dependencies)
          controllers[name] = container[title]
        } else {
          controllers[item] = { isNamespace: true }
          loadRecursively(join(dir, item), controllers[item], addService, container, namespaces.concat(item))
        }
      })
  }
}

const load = (dir, addService, container) => {
  const controllersDir = join(dir, 'controllers')
  const controllers = {}

  loadRecursively(controllersDir, controllers, addService, container)

  return Bluebird.resolve(controllers)
}

export default load
