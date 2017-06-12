import Bluebird from 'bluebird'
import fs from 'fs'
import { join } from 'path'
import parseFunction from 'parse-function'

const load = (dir, env) => {
  const mainDir = join(dir, 'config')
  const dirs = { common: mainDir, environment: join(mainDir, env) }
  const result = {}

  ;['bootstrap', 'seeds'].forEach((item) => {
    result[item] = []
    ;['common', 'environment'].forEach((element) => {
      const file = join(dirs[element], `${item}.js`)
      const title = `${element}-${item}`
      if (fs.existsSync(file)) {
        const definition = require(file)
        result[item].push([title, definition, ...parseFunction(definition).args])
      }
    })
  })

  return Bluebird.resolve(result)
}

export default load
