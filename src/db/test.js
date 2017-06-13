import rewire from 'rewire'

import assert from '../../config/assert'

const loader = rewire('./index.js')

const connectionString = 'postgres://user:password@localhost:5432'
const name = 'test'
const connectionURL = `${connectionString}/${name}`
const loadWithFakeConnection = () => loader.__get__('load')({ connectionURL })

describe('db', function () {
  describe('connection string and DB name extraction from db config', function () {
    it('loads from connectionURL', function () {
      const parsed = loader.__get__('parseDBConfig')({ connectionURL })

      assert.deepEqual(parsed, { connectionString, name })
    })
    it('loads from js options', function () {
      const parsed = loader.__get__('parseDBConfig')({ username: 'user', password: 'password', host: 'localhost', port: 5432, database: 'test' })

      assert.deepEqual(parsed, { connectionString, name })
    })
  })
  it('stops without DB name', function () {
    const load = loader.__get__('load')

    assert.isRejected(load({ connectionURL: 'postgres://u:p@local:5432' }), 'database name not found. Check your db.js configs')
  })
  it('provides a function to get DB connection using pg-promise lib', async function () {
    const fakePGP = this.sandbox.spy()
    const db = await loadWithFakeConnection()

    db.getConnection(fakePGP)
    assert(fakePGP.calledWith(connectionString))
    db.getConnection(fakePGP, connectionURL)
    assert(fakePGP.calledWith(connectionURL))
  })
  it('provides a function to check if DB exists', async function () {
    const fakeQuery = this.sandbox.stub()
    fakeQuery.resolves([true])
    const db = await loadWithFakeConnection()

    const result = await db.checkIfExists({ query: fakeQuery })
    assert(fakeQuery.calledWith(`select 1 as result from pg_database where datname='test'`))
    assert.equal(result, true)
  })
  it(`provides a function to create DB if it doesn't exist`, async function () {
    const fakeQuery = this.sandbox.stub()
    fakeQuery.withArgs(`select 1 as result from pg_database where datname='test'`).resolves([])
    const fakePGP = this.sandbox.stub()
    fakePGP.returns({ query: fakeQuery })

    const db = await loadWithFakeConnection()

    await db.create({ query: fakeQuery }, fakePGP)
    assert(fakeQuery.calledWith('create database test'))
    assert(fakeQuery.calledWith('create table if not exists "rstation_api_migrations" ("title" varchar(255) not null unique)'))
  })
  it('provides a function to delete DB if it exists', async function () {
    const fakeQuery = this.sandbox.spy()
    const db = await loadWithFakeConnection()

    await db.delete({ query: fakeQuery })
    assert(fakeQuery.calledWith('drop database if exists test'))
  })
})
