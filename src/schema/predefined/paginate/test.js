import rewire from 'rewire'

import assert from '../../../../config/assert'

const builder = rewire('./index.js')

describe('schema', function () {
  describe('predefined', function () {
    describe('paginate', function () {
      it(`builds default schema for 'paginate' property`, function () {
        assert.deepEqual(builder.__get__('paginate')(), ['paginate', false, [['current', 'number', { default: 1 }], ['limit', 'number', { default: 15 }]]])
      })
      it(
        `customises schema by following sceanrios:
          1. adds 'required' attribute when 'isRequired' property is set
          2. sets 'current' field default value when 'current' property is set
          3. sets 'limit' field default value when 'limit' property is set`,
        function () {
          const schema = builder.__get__('paginate')({ isRequired: true })
          assert.isTrue(schema.includes(true))

          const [current, limit] = builder.__get__('paginate')({ current: 2, limit: 100 }).pop()
          assert.deepEqual(current, ['current', 'number', { default: 2 }])
          assert.deepEqual(limit, ['limit', 'number', { default: 100 }])
        }
      )
    })
  })
})
