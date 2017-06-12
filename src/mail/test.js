import fs from 'fs'
import mockRequire from 'mock-require'
import nodemailer from 'nodemailer'
import rewire from 'rewire'

import assert from '../../config/assert'

const loader = rewire('./index.js')

const prepareFakeLoad = (transports, sandbox) => {
  const fakes = {}
  const fakeNodemailer = sandbox.stub(nodemailer, 'createTransport')
  transports.forEach((item) => {
    const fake = sandbox.spy()
    mockRequire(`nodemailer-${item}-transport`, () => item)
    fakeNodemailer.withArgs(item).returns({ sendMail: fake })
    fakes[item] = fake
  })
  return fakes
}

describe('mail', function () {
  describe('send', function () {
    it('sends e-mail using nodemailer transport', function () {
      const fakeSend = this.sandbox.spy()

      loader.__get__('send')({ sendMail: fakeSend }, {})
      assert(fakeSend.calledWith({}))
    })
    it(
      `sends html from template when provided:
        1. converts ejs template from '<dir>/assets/mail/<template>/html.mjml.ejs' to mjml using passed context
        2. converts mjml to html
        3. adds html to sendMail params`,
      async function () {
        this.sandbox.stub(fs, 'existsSync').returns(true)
        const fakeConvertEJS = this.sandbox.stub().resolves('ejs')
        const fakeMJML = this.sandbox.stub().returns({ html: 'mjml' })
        const fakeSend = this.sandbox.spy()

        await loader.__get__('send')({ sendMail: fakeSend }, {}, 'test', '', fakeConvertEJS, {}, fakeMJML)
        assert(fakeConvertEJS.calledWith('assets/mail/test/html.mjml.ejs', {}))
        assert(fakeMJML.calledWith('ejs'))
        assert(fakeSend.calledWith({ html: 'mjml' }))
      }
    )
  })
  it(
    `loads mail transports specified in 'mail.js' config: 
      1. filters only available transports
      2. creates 'send' function for each transport available under mail.<transport>.send`,
    async function () {
      const { ses: fakeSES, smtp: fakeSMTP } = prepareFakeLoad(['ses', 'smtp'], this.sandbox)

      const mail = await loader.__get__('load')({ ses: {}, smtp: {}, unknown: {} })
      assert.isFalse(Object.keys(mail).includes('unknown'))
      await mail.ses.send()
      assert(fakeSES.called)
      await mail.smtp.send()
      assert(fakeSMTP.called)
    }
  )
  it(
    `sets 'send' function for 'mail' from:
      1. 'default' transport when specified in config
      2. first transport when default isn't specified`,
    async function () {
      const { ses: fakeSES, smtp: fakeSMTP } = prepareFakeLoad(['ses', 'smtp'], this.sandbox)

      let mail = await loader.__get__('load')({ ses: {}, smtp: {}, default: 'smtp' })
      await mail.send()
      assert(fakeSMTP.called)
      mail = await loader.__get__('load')({ ses: {}, smtp: {} })
      await mail.send()
      assert(fakeSES.called)
    }
  )
})
