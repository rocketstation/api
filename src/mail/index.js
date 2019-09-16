import Bluebird from 'bluebird'
import { renderFile } from 'ejs'
import fs from 'fs'
import nodemailer from 'nodemailer'
import path from 'path'

const send = async (transport, options, template, dir, convertEJS, context) => {
  let html
  if (template) {
    const asset = path.join(dir, 'assets', 'mail', template, 'html.ejs')
    if (fs.existsSync(asset)) {
      html = await convertEJS(asset, context, { cache: true })
    }
  }
  const params = html ? { ...options, html } : options
  return transport.sendMail(params)
}

const load = (config, dir) => {
  const convertEJS = Bluebird.promisify(renderFile)
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

      mail[item] = { send (options, template, context) { return send(transport, options, template, dir, convertEJS, context) } }
    })

  let defaultMailer = config.default
  const mailers = Object.keys(mail)

  if (!defaultMailer || !mailers.includes(defaultMailer)) defaultMailer = mailers[0]
  mail.send = mail[defaultMailer].send
  return Bluebird.resolve(mail)
}

export default load
