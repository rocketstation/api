import assert from '../../config/assert'
import load from './index'

describe('environment', function () {
  afterEach(function () {
    delete process.env.NODE_ENV
  })

  it(`returns 'development' if 'process.env.NODE_ENV' is not set`, () => {
    assert.eventually.equal(load(), 'development')
  })

  it(`returns 'development' if 'process.env.NODE_ENV' is unknown`, () => {
    process.env.NODE_ENV = 'unknown'
    assert.eventually.equal(load(), 'development')
  })

  const environments = {
    production: ['p', 'production'],
    integration: ['i', 'integration']
  }

  Object.keys(environments).forEach((item) => {
    environments[item].forEach((key) => {
      it(`returns '${item}' if 'process.env.NODE_ENV' is '${key}'`, () => {
        process.env.NODE_ENV = key
        assert.eventually.equal(load(), item)
      })
    })
  })
})
