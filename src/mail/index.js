import Bluebird from 'bluebird'
import { renderFile } from 'ejs'
import fs from 'fs'
import nodemailer from 'nodemailer'
import path from 'path'
import aws from 'aws-sdk'

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
  const mjml2html = require('mjml')
  const transports = ['ses', 'smtp']
  const mail = {}

  Object
    .keys(config)
    .filter(item => transports.includes(item))
    .forEach((item) => {
      let transport = {
        sendMail () {
          return Bluebird.reject(`${item} transport is not implemented`)
        }
      }
      if (item === 'smtp') transport = nodemailer.createTransport(require(`nodemailer-smtp-transport`)(config[item]))
      if (item === 'ses') {
        transport = nodemailer.createTransport({ SES: new aws.SES({ apiVersion: '2010-12-01', ...config[item] }) })
      }
      mail[item] = { send (options, template, context) { return send(transport, options, template, dir, convertEJS, context, mjml2html) } }
    })

  let defaultMailer = config.default
  const mailers = Object.keys(mail)

  if (!defaultMailer || !mailers.includes(defaultMailer)) defaultMailer = mailers[0]
  mail.send = mail[defaultMailer].send
  return Bluebird.resolve(mail)
}

export default load
