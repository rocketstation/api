import fs from 'fs'
import mockRequire from 'mock-require'
import rewire from 'rewire'

import assert from '../../config/assert'

const loader = rewire('./index.js')

describe('services', function () {
  it(`converts service file name to title`, function () {
    assert.equal(loader.__get__('getTitle')('test-name.js'), 'TestNameService')
  })
  it(`doesn't read 'services' dir when it doesn't exist`, async function () {
    this.sandbox.stub(fs, 'existsSync').returns(false)
    const spy = this.sandbox.spy(fs, 'readdirSync')

    await loader.__get__('load')('')
    assert.isFalse(spy.called)
  })
  it(
    `loads services:
      1. reads .js files from 'services' dir
      2. maps service title to its definition array`,
    async function () {
      this.sandbox.stub(fs, 'existsSync').returns(true)
      this.sandbox.stub(fs, 'readdirSync').returns(['.DS_Store', 'test.js'])
      const fakeDefinition = (fakeDependency) => { fakeDependency.doSomething() }
      mockRequire('services/test.js', fakeDefinition)

      const services = await loader.__get__('load')('')
      assert.deepEqual(services, { TestService: [fakeDefinition, 'fakeDependency'] })
    }
  )
})
