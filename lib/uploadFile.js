'use strict';
const path = require('path'),
  Stream = require('stream');
/**
 *  This is the Upload FIle object that contains all the info
 *  about a file.
 */
module.exports = function (thorin, opt, ERROR) {

  const logger = thorin.logger(opt.logger);

  class UploadFile {

    #stream = null;
    #options = null;
    #folder = null;
    #error = null;

    constructor(streamObj, fileName, mimeType, encoding) {
      if (typeof streamObj === 'string' || streamObj instanceof Buffer) {
        if (typeof mimeType !== 'string' || !mimeType) {
          mimeType = 'text/plain';
        }
        if (typeof encoding !== 'string' || !encoding) {
          encoding = 'utf8';
        }
      }
      if (typeof fileName !== 'string' || !fileName) {
        fileName = 'file';
      }
      this.name = fileName;
      this.size = 0;  // set when we store it.
      this.extension = path.extname(fileName);
      if (this.extension) this.extension = this.extension.toLowerCase();
      this.mimeType = mimeType;
      this.encoding = encoding;
      if (this.extension.charAt(0) === '.') this.extension = this.extension.substr(1);
      let rand = thorin.util.randomString(8),
        now = Date.now(),
        hash = now + fileName.toString() + mimeType.toString();
      this.key = now + '_' + thorin.util.sha2(rand + hash) + rand;
      if (this.name && this.name !== 'file') {
        this.key += '/' + this.name;
      }
      if (this.extension !== '' && this.key.indexOf('.' + this.extension) === -1) {
        this.key += '.' + this.extension;
      }
      this.key = this.key.replace(/\/\/+/g, '/');
      let self = this;

      if (typeof streamObj === 'string' || streamObj instanceof Buffer) {  // we're uploading raw text.
        this.#stream = streamObj;
        this.size = streamObj.length;
        return this;
      }

      let fileStream = new Stream.PassThrough(),
        sizeStream = new Stream.PassThrough();
      this.#stream = fileStream;

      function onData(d) {
        self.size += d.length;
        return d;
      }

      function onEnd() {
        sizeStream.removeAllListeners('data');
        sizeStream.removeAllListeners('error');
        fileStream.removeAllListeners('end');
        fileStream.removeAllListeners('error');
        streamObj.removeListener('end', onEnd);
        streamObj.removeListener('error', onError);
      }

      function onError(e) {
        logger.warn('Upload file ' + self.key + ' readable stream encountered an error', e);
        logger.debug(e);
      }

      sizeStream.on('data', onData);
      sizeStream.on('error', (e) => {
        logger.warn(`Upload file ${this.key} size stream encountered an error`);
        logger.debug(e);
      });
      fileStream.on('error', (e) => {
        logger.warn(`Upload file readable stream encountered an error [${this.key}]`, e);
        logger.debug(e);
      });

      streamObj
        .pipe(sizeStream)
        .pipe(fileStream)
        .on('end', onEnd)
        .on('error', onError);
    }

    toJSON() {
      let r = {
        url: this.url
      };
      if (this.size) r.size = this.size;
      return r;
    }

    /**
     * Manually override the stream, SHOULD NEVER USE.
     * */
    __setStream(streamObj) {
      this.#stream = streamObj;
    }

    getStream() {
      if (this.#stream) return this.#stream;
      return null;
    }

    /**
     * Marks the file as being too large and stops its processing.
     * */
    fileTooLarge(e) {
      if (e) {
        this.#error = thorin.error(e);
      } else {
        this.#error = ERROR.FILE_TOO_LARGE || thorin.error('UPLOAD.FILE_TOO_LARGE', 'The file is too large.');
      }
      return this;
    }

    /**
     * Sets the folder hierarchy of the file.
     * */
    setFolder(f) {
      if (typeof f !== 'string') {
        logger.warn('UploadFile: setFolder() requires a string.');
        return this;
      }
      if (f.charAt(0) === '/') f = f.substr(1);
      f = f.replace(/\/\/+/g, '/');
      this.#folder = f;
      return this;
    }

    get folder() {
      return this.#folder;
    }

    /**
     * Sets additional options that will be read by the storage class.
     * */
    setOptions(opt) {
      if (typeof opt === 'object' && opt) {
        this.#options = opt;
      }
      return this;
    }

    get options() {
      return this.#options || null;
    }

    get error() {
      return this.#error || null;
    }

    getKey() {
      let root = '';
      if (this.#folder) {
        root = this.#folder;
        if (root.charAt(root.length - 1) !== '/') root += '/';
      }
      root += this.key;
      return root;
    }

    /* Destructor */
    destroy() {
      this.#stream = null;
      this.#options = null;
      this.#folder = null;
      this.name = null;
      this.key = null;
      this.extension = null;
      this.mimeType = null;
      this.encoding = null;
    }

  }

  return UploadFile;
}
