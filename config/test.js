import { sandbox } from 'sinon'
import mockRequire from 'mock-require'

beforeEach(function () {
  this.sandbox = sandbox.create()
})

afterEach(function () {
  this.sandbox.restore()
  mockRequire.stopAll()
})
