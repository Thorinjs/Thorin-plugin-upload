'use strict';
const path = require('path');
/**
 * Created by Adrian on 04-May-16.
 */
module.exports = function(thorin, opt) {
  const logger = thorin.logger(opt.logger),
    stream = Symbol();

  class UploadFile {

    constructor(streamObj, fileName, mimeType, encoding) {
      this[stream] = streamObj;
      this.name = fileName;
      this.size = 0;  // set when we store it.
      this.extension = path.extname(fileName);
      this.mimeType = mimeType;
      this.encoding = encoding;
      if(this.extension.charAt(0) === '.') this.extension = this.extension.substr(1);
      let rand = thorin.util.randomString(16),
        now = Date.now(),
        hash = now + fileName.toString() + mimeType.toString();
      this.key = now + '_' + thorin.util.sha2(rand + hash) + rand + '.' + this.extension;
      this.folder = null;
      this.options = null;
      this.error = null;
      let self = this;
      function onData(d) {
        self.size += d.length;
      }
      function onEnd() {
        streamObj.removeListener('data', onData);
        streamObj.removeListener('end', onEnd);
      }
      streamObj
        .on('end', onEnd)
        //.on('data', onData)
        .on('error', (e) => {
          logger.warn('Upload file ' + this.key + ' readable stream encountered an error', e);
        });
    }

    toJSON() {
      let r = {
        url: this.url
      };
      if(this.size) r.size = this.size;
      return r;
    }

    getStream() {
      if(this[stream]) return this[stream];
      return null;
    }

    /* Marks the file as being too large and stops its processing. */
    fileTooLarge(e) {
      if(e) {
        this.error = thorin.error(e);
      } else {
        this.error = thorin.error('UPLOAD.FILE_TOO_LARGE', 'The file is too large.');
      }
      return this;
    }

    /* Sets the folder hierarchy of the file. */
    setFolder(f) {
      if(typeof f !== 'string') {
        logger.warn('UploadFile: setFolder() requires a string.');
        return this;
      }
      if(f.charAt(0) === '/') f = f.substr(1);
      this.folder = f;
      return this;
    }

    /* Sets additional options that will be read by the storage class. */
    setOptions(opt) {
      if(typeof opt === 'object' && opt) {
        this.options = opt;
      }
      return this;
    }

    getKey() {
      let root = '';
      if(this.folder) {
        root = this.folder;
        if(root.charAt(root.length - 1) !== '/') root += '/';
      }
      root += this.key;
      return root;
    }

    /* Destructor */
    destroy() {
      this[stream] = null;
      this.name = null;
      this.key = null;
      this.extension = null;
      this.mimeType = null;
      this.encoding = null;
      this.options = null;
      this.folder = null;
    }

  }

  return UploadFile;
}