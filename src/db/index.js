import Bluebird from 'bluebird'
import { parse } from 'pg-connection-string'

const parseDBConfig = ({ connectionURL, ...rest }) => {
  const getResult = ({ database, host, password, port, user, username }) => {
    const u = user || username

    return { connectionString: `postgres://${user || username}:${password}@${host}:${port}`, name: database, user: u }
  }

  if (connectionURL) return getResult(parse(connectionURL))

  return getResult(rest)
}

const load = (config) => {
  const { connectionString, name, user } = parseDBConfig(config)
  if (!name) {
    return Bluebird.reject('database name not found. Check your db.js configs')
  }
  const result = {
    async checkIfExists (connection) {
      const data = await connection.query(`select 1 as result from pg_database where datname='${name}'`)
      return data.length !== 0
    },
    connectionString,
    async create (connection, pgp) {
      const dbExists = await result.checkIfExists(connection)

      if (!dbExists) {
        await connection.query(`create database ${name}`)

        const dbConnection = result.getConnection(pgp, `${connectionString}/${name}`)

        await dbConnection.query('create table if not exists "rstation_api_migrations" ("title" varchar(255) not null unique)')

        return dbConnection
      }
    },
    delete (connection) {
      return connection.query(`drop database if exists ${name}`)
    },
    getConnection (pgp, connectionStr = `${connectionString}/${user}`) {
      return pgp(connectionStr)
    },
    name,
    sequelizeOptions: config
  }

  return Bluebird.resolve(result)
}

export default load
