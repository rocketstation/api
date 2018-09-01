import Bluebird from 'bluebird'
import fs from 'fs'
import path from 'path'
import { cl } from '@rocketstation/change-case'

const loadEnvConfigs = (configFiles, envDir, mainDir) => {
  configFiles.forEach((file) => {
    const mainFile = path.join(mainDir, file)
    const envFile = path.join(envDir, file)

    let data = {}
    if (fs.existsSync(mainFile)) data = require(mainFile)
    if (fs.existsSync(envFile)) data = Object.assign({}, data, require(envFile))

    Object.keys(data).forEach((prop) => {
      process.env[prop] = data[prop]
    })
  })
}

const getTitle = (file) => file.split('.')[0]

const readConfigs = (dir, ignored) =>
  fs
    .readdirSync(dir)
    .filter(item => item.includes('.js'))
    .filter(item => !ignored.includes(getTitle(item)))

const load = (env, dir) => {
  const mainDir = path.join(dir, 'config')

  if (!fs.existsSync(mainDir)) return Bluebird.reject('config directory doesn\'t exist')

  const envDir = path.join(mainDir, env)

  loadEnvConfigs(['env.js', 'secret.js'], envDir, mainDir)

  const result = {}
  const dirs = [mainDir]

  if (fs.existsSync(envDir)) dirs.push(envDir)

  dirs.forEach((configDir) => {
    readConfigs(configDir, ['seeds', 'secret', 'env', 'bootstrap']).forEach((file) => {
      const title = cl(getTitle(file))

      result[title] = Object.assign(result[title] || {}, require(path.join(configDir, file)))
    })
  })
  return Bluebird.resolve(result)
}

export default load
