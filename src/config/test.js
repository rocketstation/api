import fs from 'fs'
import mockRequire from 'mock-require'
import path from 'path'
import rewire from 'rewire'

import assert from '../../config/assert'

const loader = rewire('./index.js')

describe('config', function () {
  it('stops without config dir', function () {
    this.sandbox.stub(path, 'join')
    this.sandbox.stub(fs, 'existsSync').returns(false)
    assert.isRejected(loader.__get__('load')(), 'config directory doesn\'t exist')
  })

  describe(`'process.env' configuration`, function () {
    beforeEach(function () {
      this.sandbox.stub(fs, 'existsSync').returns(true)
      this.fakeProcess = { env: {} }
      this.revertProcess = loader.__set__('process', this.fakeProcess)
    })

    ;['env.js', 'secret.js'].forEach((item) => {
      it(`loads environment variables from 'config/${item}' & 'config/<environment>/${item}'`, function () {
        mockRequire(item, { common: 'test', development: 'wrong' })
        mockRequire(`development/${item}`, { development: 'right' })
        loader.__get__('loadEnvConfigs')([item], 'development', '')
        assert.deepEqual(this.fakeProcess.env, { common: 'test', development: 'right' })
      })
    })

    afterEach(function () {
      this.revertProcess()
    })
  })

  it('splits config file name', function () {
    assert.equal(loader.__get__('getTitle')('file.js'), 'file')
  })

  it(
    `reads config directory:
      1. filters non js files
      2. filters ignored configs`,
    function () {
      this.sandbox.stub(fs, 'readdirSync').returns(['test.js', '.DS_Store', 'seeds.js'])
      assert.deepEqual(loader.__get__('readConfigs')('', ['seeds']), ['test.js'])
    }
  )

  it(
    `loads each config:
      1. maps loaded config with it's camel cased file name
      2. loads environment specific configs
      3. merges common configs with environment specific`,
    async function () {
      const fakeReadDir = this.sandbox.stub(fs, 'readdirSync')

      const stub = this.sandbox.stub(fs, 'existsSync')
      stub.withArgs('config').returns(true)
      stub.withArgs('config/integration').returns(true)
      fakeReadDir.withArgs('config').returns(['camel-case.js', 'environment-specific.js'])
      fakeReadDir.withArgs('config/integration').returns(['environment-specific.js'])
      mockRequire(`config/camel-case.js`, {})
      mockRequire(`config/environment-specific.js`, { test: 'wrong' })
      mockRequire(`config/integration/environment-specific.js`, { test: 'right' })

      const result = await loader.__get__('load')('integration', '')

      assert.deepEqual(result, { camelCase: {}, environmentSpecific: { test: 'right' } })
    }
  )
})
