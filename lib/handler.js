'use strict';
/**
 * Created by Adrian on 04-May-16.
 */
const B = 1,
  KB = 1024 * B,
  MB = 1024 * KB,
  GB = 1024 * MB,
  TB = 1024 * GB;
module.exports = function(thorin, opt) {

  /*
  *  Converts 1MB, 100KB , etc to bytes*/
  function convert(str) {
    str = str.replace(/ /g,'');
    var type = str.substr(-2),
      amount = parseInt(str.replace(type,""));
    switch(type.toUpperCase()) {
      case 'KB':
        return amount * KB;
      case 'MB':
        return amount * MB;
      case 'GB':
        return amount * GB;
      case 'TB':
        return amount * TB;
      default:
        return amount;
    }
  }

  const logger = thorin.logger(opt.logger),
    Action = thorin.Action;
  Action.HANDLER_TYPE.UPLOAD_PROCESS = "upload.process";
  class UploadHandler extends Action {

    constructor(name, uploadPath) {
      super(name);
      delete this.isTemplate;
      this.path = uploadPath;
      this.aliases = [{
        name: uploadPath
      }];
      this.fieldName = 'asset';
      this.mimeTypes = [];
      this.extensions = [];
      this.uploadFn = null; // this is placed here when the user calls upload()
      this.storageFn = null;  // the default storage to use.
      this.limits = Object.assign({}, opt.limits);
    }

    _isFileValid(fileObj) {
      let mimeValid = false,
        extValid = false;
      if (this.mimeTypes.length === 0) {
        mimeValid = true;
      } else {
        for (let i = 0; i < this.mimeTypes.length; i++) {
          let item = this.mimeTypes[i];
          if (item.test(fileObj.mimeType)) {
            mimeValid = true;
            break;
          }
        }
      }
      if (this.extensions.length === 0) {
        extValid = true;
      } else {
        for (let i = 0; i < this.extensions.length; i++) {
          let item = this.extensions[i];
          if (item === fileObj.extension) {
            extValid = true;
            break;
          }
        }
      }
      return (extValid && mimeValid);
    }

    /* Accept only specific mime types. */
    mimeType(m) {
      let items = (m instanceof Array) ? m : Array.prototype.slice.call(arguments);
      for (let i = 0; i < items.length; i++) {
        let m = items[i];
        if (typeof m === 'string') {
          this.mimeTypes.push(new RegExp(m));
        } else if (m instanceof RegExp) {
          this.mimeTypes.push(m);
        }
      }
      return this;
    }

    /* Accept only specific file extensions. */
    extension(m) {
      let items = (m instanceof Array) ? m : Array.prototype.slice.call(arguments);
      for (let i = 0; i < items.length; i++) {
        let m = items[i];
        if (typeof m === 'string') {
          if (m.charAt(0) === '.') m = m.substr(1);
          this.extensions.push(m.toLowerCase());
        }
      }
      return this;
    }

    /* Explicitly set the field name */
    field(v) {
      if (typeof v === 'string') {
        this.fieldName = v;
      }
      return this;
    }

    /* Updates the default limitations */
    limit(_key, _val) {
      if (typeof _key === 'string' && typeof _val !== 'undefined') {
        if(typeof _val === 'string') {
          _val = convert(_val);
        }
        this.limits[_key] = _val;
        return this;
      }
      if (typeof _key === 'object' && _key) {
        this.limits = Object.assign({}, this.limits, _key);
        return this;
      }
      logger.warn('Received invalid limit() for handler ' + this.name);
      return this;
    }

    /*
     * This will se the default storage to use for this.
     * Ways to use it:
     *   storage(storageInstanceName=string)
     *   OR
     *   storage(fn) => storageInstanceName = fn(intentObj, fileObj)
     *   OR
     *   storage(fn) => storageInstanceObj = fn(intentObj, fileObj);
     * */
    storage(val) {
      if (this.storageFn) {
        logger.warn('Handler ' + this.name + ' already has a storage() handler');
        return this;
      }
      if (typeof val === 'string' || (typeof val === 'object' && val)) {
        this.storageFn = (intent, file, done) => done(null, val);
      } else if (typeof val === 'function') {
        this.storageFn = val;
      } else {
        logger.warn('Invalid call of storage() for handler ' + this.name);
      }
      return this;
    }

    /* This will be called when a file is processed by busboy.
     The handler will be called with: fn(fileObj, next)
     */
    upload(fn) {
      if (this._hasProcessor) {
        logger.warn('Upload handler ' + this.name + ' already registered a upload() processor.');
        return this;
      }
      this._hasProcessor = true;
      this.stack.push({
        type: Action.HANDLER_TYPE.UPLOAD_PROCESS,
        fn
      });
      return this;
    }

    /*
     * Runs our custom process() files.
     * */
    _runCustomType(intentObj, handler, done) {
      if (handler.type === Action.HANDLER_TYPE.UPLOAD_PROCESS) {
        intentObj._attachBusboy(handler.fn, done);
        return;
      }
      return super._runCustomType.apply(this, arguments);
    }

    alias() {
      throw new Error('Upload handler does not allow alias()')
    }

    render() {
      throw new Error('Upload handlers cannot render content');
    }

  }

  return UploadHandler;
}