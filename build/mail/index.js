'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _ejs = require('ejs');

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _nodemailer = require('nodemailer');

var _nodemailer2 = _interopRequireDefault(_nodemailer);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const send = async (transport, options, template, dir, convertEJS, context, mjml2html) => {
  let html;
  if (template) {
    const asset = _path2.default.join(dir, 'assets', 'mail', template, 'html.mjml.ejs');
    if (_fs2.default.existsSync(asset)) {
      const str = await convertEJS(asset, context, { cache: true });
      html = mjml2html(str).html;
    }
  }
  const params = html ? _extends({}, options, { html }) : options;
  return transport.sendMail(params);
};

const load = (config, dir) => {
  const convertEJS = _bluebird2.default.promisify(_ejs.renderFile);
  const { mjml2html } = require('mjml');
  const transports = ['ses', 'smtp'];
  const mail = {};

  Object.keys(config).filter(item => transports.includes(item)).forEach(item => {
    const transport = _nodemailer2.default.createTransport(require(`nodemailer-${item}-transport`)(config[item]));
    mail[item] = { send(options, template, context) {
        return send(transport, options, template, dir, convertEJS, context, mjml2html);
      } };
  });

  let defaultMailer = config.default;
  const mailers = Object.keys(mail);

  if (!defaultMailer || !mailers.includes(defaultMailer)) defaultMailer = mailers[0];
  mail.send = mail[defaultMailer].send;
  return _bluebird2.default.resolve(mail);
};

exports.default = load;