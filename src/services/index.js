import Bluebird from 'bluebird'
import fs from 'fs'
import parseFunction from 'parse-function'
import path from 'path'
import { cu } from '@rocketstation/change-case'

const getTitle = (file) => `${cu(file.split('.')[0])}Service`

const load = (dir) => {
  const servicesDir = path.join(dir, 'services')
  const result = {}
  if (fs.existsSync(servicesDir)) {
    fs
      .readdirSync(servicesDir)
      .filter(item => item.includes('.js'))
      .forEach(item => {
        const title = getTitle(item)
        const definition = require(path.join(servicesDir, item))
        result[title] = [definition, ...parseFunction(definition).args]
      })
  }
  return Bluebird.resolve(result)
}

export default load
