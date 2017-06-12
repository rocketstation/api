import Bluebird from 'bluebird'
import { renderFile } from 'ejs'
import fs from 'fs'
import nodemailer from 'nodemailer'
import path from 'path'

const send = async (transport, options, template, dir, convertEJS, context, mjml2html) => {
  let html
  if (template) {
    const asset = path.join(dir, 'assets', 'mail', template, 'html.mjml.ejs')
    if (fs.existsSync(asset)) {
      const str = await convertEJS(asset, context, { cache: true })
      html = mjml2html(str).html
    }
  }
  const params = html ? { ...options, html } : options
  return transport.sendMail(params)
}

const load = (config, dir) => {
  const convertEJS = Bluebird.promisify(renderFile)
  const { mjml2html } = require('mjml')
  const transports = ['ses', 'smtp']
  const mail = {}

  Object
    .keys(config)
    .filter(item => transports.includes(item))
    .forEach((item) => {
      const transport = nodemailer.createTransport(require(`nodemailer-${item}-transport`)(config[item]))
      mail[item] = { send (options, template, context) { return send(transport, options, template, dir, convertEJS, context, mjml2html) } }
    })

  let defaultMailer = config.default
  const mailers = Object.keys(mail)

  if (!defaultMailer || !mailers.includes(defaultMailer)) defaultMailer = mailers[0]
  mail.send = mail[defaultMailer].send
  return Bluebird.resolve(mail)
}

export default load
