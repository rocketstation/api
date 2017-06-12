import rewire from 'rewire'

import assert from '../../config/assert'

const loader = rewire('./index.js')

describe('schema', function () {
  it(
    `predefines builders for schemes from config:
      1. sets their keys from property paths namespaced by 'schema.'
      2. maps builders functions under corresponding keys`,
    function () {
      const builder = this.sandbox.spy()
      const child = this.sandbox.spy()
      const predefine = loader.__get__('predefine')

      let predefined = predefine({ builder })
      predefined = predefine({ builder: { child } }, predefined)

      assert.isTrue('schema.builder' in predefined)
      assert.isTrue('schema.builder.child' in predefined)

      predefined['schema.builder']()
      assert(builder.called)
      predefined['schema.builder.child']()
      assert(child.called)
    }
  )

  it(
    `parses array to valid JSON schema:
      1. processes items recursively
      2. returns source when it is not array
      3. creates object configuration when source contains embedded arrays
      4. sets 'type' to 'string' when no type specified
      5. adds property to 'required' field when source contains boolean item
      6. sets property title when specified
      7. adds 'additionalProperties: false' configuration to all 'object' properties by default
      8. sets property configuration when specified
      9. calls predefined schema builder when specified`,
    function () {
      const parse = loader.__get__('parse')

      assert.deepEqual(parse({}).schema, {})

      assert.deepEqual(
        parse([
          ['data', true, [['name', true], ['age', 'number'], ['about', 'string|null']], { additionalProperties: true }],
          ['format', { default: 'json' }]
        ]).schema,
        {
          additionalProperties: false,
          properties: {
            data: {
              additionalProperties: true,
              properties: {
                about: { type: 'string|null' },
                age: { type: 'number' },
                name: { type: 'string' }
              },
              required: ['name'],
              type: 'object'
            },
            format: { default: 'json', type: 'string' }
          },
          required: ['data'],
          type: 'object'
        }
      )

      const builder = this.sandbox.stub().returns(['property'])

      assert.deepEqual(
        parse(['schema.builder', { prop: 'test' }], { 'schema.builder': builder }).schema,
        { property: { type: 'string' } }
      )
      assert(builder.calledWith({ prop: 'test' }))
    }
  )

  it(
    `detects specific schemes by their configuration:
      1. no type when some of 'not', 'oneOf', 'anyOf', 'allOf' properties specified
      2. 'array' when some of 'items', 'additionalItems', 'contains' properties specified
      3. converts them to JSON schema`,
    function () {
      const noType = { anyOf: [[['age', 'number', true]], ['number']] }
      const array = { items: [[['id', true]]] }
      const detect = loader.__get__('detect')

      assert.equal(detect(noType, Object.keys(noType), ['anyOf']), true)
      assert.equal(detect(array, Object.keys(array), ['items']), true)
      assert.deepEqual(noType, {
        anyOf: [
          {
            additionalProperties: false,
            properties: {
              age: { type: 'number' }
            },
            required: ['age'],
            type: 'object'
          },
          { type: 'number' }
        ]
      })
      assert.deepEqual(array, {
        items: [
          {
            additionalProperties: false,
            properties: {
              id: { type: 'string' }
            },
            required: ['id'],
            type: 'object'
          }
        ]
      })
    }
  )

  it('loads predefined builders and parser', async function () {
    const builder = this.sandbox.stub().returns(['test'])
    const schema = await loader.__get__('load')({ builder })

    assert.deepEqual(
      schema.parse([
        ['schema.builder']
      ]).schema,
      {
        additionalProperties: false,
        properties: {
          test: { type: 'string' }
        },
        type: 'object'
      }
    )
  })
})
