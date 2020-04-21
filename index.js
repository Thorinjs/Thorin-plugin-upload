'use strict';

/**
 * The Thorin upload plugin works with asset uploading to various storage sollutions.
 * Plugin options:
 *  - transport - the transport to be attached to.
 *  -
 * */
const initUpload = require('./lib/uploadPlugin');
module.exports = function (thorin, opt, pluginName) {
  opt = thorin.util.extend({
    logger: pluginName || 'upload',
    transport: 'http',
    limits: {
      fieldNameSize: 120,     // max field name size in bytes
      fieldSize: 500 * 1024, // 500KB
      fileSize: 20 * 1000000,           // defaults to 20MB
      files: 1,               // we allow only one file per upload request
      headerPairs: 120        // max headers.
    }
  }, opt);

  const Upload = initUpload(thorin, opt);
  let pluginObj = new Upload();

  return pluginObj;
};
module.exports.publicName = 'upload';
