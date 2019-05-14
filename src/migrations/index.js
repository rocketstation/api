import Bluebird from 'bluebird'
import { sl } from '@rocketstation/change-case'
import fs from 'fs'
import parseFunction from 'parse-function'
import path from 'path'
import pluralize from 'pluralize'

const getDirPath = (dir, model) => path.join(dir, model, 'migrations')
const getTableName = (migrationTitle) => pluralize(sl(migrationTitle.split('.').slice(0, -1)))

const load = (dir) => {
  const modelsDir = path.join(dir, 'models')
  const result = {}
  fs
    .readdirSync(modelsDir)
    .filter(item => fs.lstatSync(path.join(modelsDir, item)).isDirectory() && fs.existsSync(getDirPath(modelsDir, item)))
    .forEach((item) => {
      const migrationsDir = getDirPath(modelsDir, item)
      if (fs.existsSync(migrationsDir)) {
        fs
          .readdirSync(migrationsDir)
          .filter(element => element.endsWith('.js'))
          .forEach((element) => {
            const [title] = element.split('.')
            const definition = require(path.join(migrationsDir, element))
            result[`${item}.${title}`] = [definition, ...parseFunction(definition).args]
          })
      }
    })
  return Bluebird.resolve(result)
}

const getPending = async (connection, migrations) => {
  const data = await connection.query('select * from rstation_api_migrations')
  const executed = data.map(({ title }) => title)
  const createdTables = []
  executed.forEach((item) => {
    const table = getTableName(item)
    if (!createdTables.includes(table)) createdTables.push(table)
  })
  const pendingUnsorted = []
  Object.keys(migrations).forEach((item) => {
    if (!executed.includes(item)) {
      const table = getTableName(item)
      const method = migrations[item].up
      const body = method.toString().replace(/\r?\n|\r/g, '').replace(/ /g, '')
      const references = []
      const regex = /references:{model:'([a-z_]+)'|\.(addColumn|addIndex|removeColumn|changeColumn|renameColumn)\('([a-z_]+)'/g
      let match = regex.exec(body)
      while (match) {
        let tableName
        if (match[1]) {
          if (match[1] !== table) tableName = match[1]
        }
        if (match[3]) {
          tableName = match[3]
        }
        if (tableName && !references.includes(tableName)) references.push(tableName)
        match = regex.exec(body)
      }
      pendingUnsorted.push({ isCreateTable: body.includes('createTable'), method, table, references, title: item })
    }
  })
  let pending = pendingUnsorted.filter(({ references }) => references.length === 0)
  let i = 0
  while (pending.length !== pendingUnsorted.length && i < 100) {
    pending.forEach(({ table }) => {
      if (!createdTables.includes(table)) createdTables.push(table)
    })
    pending = pending.concat(pendingUnsorted.filter(({ isCreateTable, table, references, title }) => {
      if (createdTables.includes(table) && !references.includes(table)) return false
      if (references.includes(table) && pending.map(({ title }) => title).includes(title)) return false
      if (references.includes(table) && !createdTables.includes(table) && !isCreateTable) return false
      let flag = true
      references.forEach((item) => {
        flag = flag && (item === table || createdTables.includes(item))
      })
      return flag
    }))
    i += 1
  }
  if (i === 100) {
    console.log('Possible circular dependency found. Pending tables')
    console.log('SORTED:')
    console.log(pending.map(({ table, references }) => ({ table, references })))
    console.log('UNSORTED:')
    console.log(pendingUnsorted.map(({ table, references }) => ({ table, references })))
    return []
  }
  return pending
}

const run = async (connection, type, model, version = '', migrations, sequelize) => {
  await connection.query('create table if not exists "rstation_api_migrations" ("title" varchar(255) not null unique)')
  const title = `${model}.${version}`
  const versions = Object.keys(migrations).filter((item) => item.startsWith(title))
  if (versions.length === 0) return Bluebird.reject(`no migrations found for '${model}' model`)
  if (version && !versions.includes(title)) return Bluebird.reject(`no '${model}' model migration with '${version}' version found`)
  let toRun = []
  let isToRun = () => false
  if (type === 'up') isToRun = (list, item) => list.includes(item)
  if (type === 'down') isToRun = (list, item) => !list.includes(item)
  const pending = await getPending(connection, migrations)
  const pendingTitles = pending.map(({ title }) => title)
  if (version) {
    if (isToRun(pendingTitles, title)) toRun = [{ title, method: migrations[title][type] }]
  } else {
    toRun = versions.filter((item) => isToRun(pendingTitles, item)).map((item) => ({ title: item, method: migrations[item][type] }))
  }
  const queryInterface = sequelize.getQueryInterface()
  await Bluebird.all(toRun.map(migration => migration.method(queryInterface)))
  if (type === 'up') await connection.query(`insert into rstation_api_migrations (title) values ${toRun.map(migration => `('${migration.title}')`).join(', ')};`)
  if (type === 'down') await connection.query(`delete from rstation_api_migrations where title in (${toRun.map(migration => `'${migration.title}'`).join(', ')});`)
}

const runPending = async (connection, migrations, sequelize) => {
  await connection.query('create table if not exists "rstation_api_migrations" ("title" varchar(255) not null unique)')
  const pending = await getPending(connection, migrations)
  const queryInterface = sequelize.getQueryInterface()
  if (pending.length > 0) {
    await Bluebird.each(pending, item => item.method(queryInterface))
    await connection.query(`insert into rstation_api_migrations (title) values ${pending.map(migration => `('${migration.title}')`).join(', ')};`)
  }
}

export default load
export { getPending, run, runPending }
