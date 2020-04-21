'use strict';
const initHandler = require('./handler'),
  initUploader = require('./uploader'),
  IStorage = require('./IStorage');

const SIZES = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
/**
 * This is our uploader plugin definition
 * */
module.exports = function init(thorin, opt) {

  const logger = thorin.logger(opt.logger),
    Handler = initHandler(thorin, opt);

  class UploadPlugin {

    #config = {};
    #storageInstances = {};
    #storageClasses = {};
    #uploader = null; // the lib/uploader instance.
    #handlers = [];   // array of handlers.

    constructor() {
      this.#config = opt;
      this.#uploader = initUploader(thorin, opt, this.#storageInstances, this);
      this.started = false;
      Object.defineProperty(this, 'File', {
        value: this.#uploader.FileUpload,
        enumerable: false,
        writable: true
      });
      Object.defineProperty(this, 'IStorage', {
        value: IStorage,
        enumerable: false,
        writable: true
      });
    }

    get options() {
      return this.#config;
    }

    set uploader(v) {
      if (!this.#uploader) this.#uploader = v;
    }

    get uploader() {
      return this.#uploader;
    }

    /**
     * Listen for the transport-http register, to register the handlers.
     * */
    init() {
      thorin.on(thorin.EVENT.RUN, `transport.${opt.transport}`, () => {
        for (let i = 0, len = this.#handlers.length; i < len; i++) {
          this.#uploader.add(this.#handlers[i]);
        }
        this.#handlers = [];
        this.started = true;
      });
    }

    /**
     * Registers a new upload handler
     * */
    addHandler(name, uploadPath) {
      if (this.started) {
        logger.warn(`Upload plugin already started, cannot register handler ${name}`);
        return false;
      }
      if (typeof name !== 'string' || !name || typeof uploadPath !== 'string' || !uploadPath) {
        throw new Error('upload.addHandler() requires (name, uploadPath)');
      }
      const handlerObj = new Handler(name, uploadPath);
      this.#handlers.push(handlerObj);
      return handlerObj;
    }

    /**
     * Registers a new storage class
     * */
    registerStorageClass(type, StorageClass) {
      if (this.#storageClasses[type]) {
        logger.warn(`Storage Class type ${type} already registered`)
        return false;
      }
      this.#storageClasses[type] = StorageClass;
      return true;
    }

    /**
     * Creates a new storage class instance, based on a previously registered one.
     * NOTE: this is not persisted and should be used with dynamic storage types.
     * */
    createStorage(type, config) {
      if (typeof this.#storageClasses[type] === 'undefined') {
        logger.error('createStorage(): storage ' + type + ' is not registered yet.');
        return null;
      }
      let Storage = this.#storageClasses[type];
      return new Storage(config);
    }

    /**
     * Creates and caches an instance of a storage class.
     * Ways of registering a storage:
     *   registerStorage(type, instanceName, config)
     *   registerStorage(type, config)
     *   registerStorage(storageInstanceObj);
     * */
    registerStorage(type, _name, config = {}) {
      // registerStorage(instance)
      if (type instanceof IStorage) {
        let name = type.name;
        if (typeof this.#storageInstances[name] !== 'undefined') {
          logger.error('registerStorage(): storage ' + name + ' is already registered.');
          return false;
        }
        this.#storageInstances[name] = type;
        return true;
      }
      // registerStorage(type, instanceName, config)
      if (typeof type === 'string' && typeof _name === 'string') {
        if (typeof this.#storageInstances[_name] !== 'undefined') {
          logger.error('registerStorage(): storage ' + _name + ' is already registered.');
          return false;
        }
        let SClass = this.#storageClasses[type];
        if (!SClass) {
          logger.error('registerStorage(): storage type ' + type + ' does not exist or is not loaded.');
          return false;
        }
        this.#storageInstances[_name] = new SClass(config, _name);
        return true;
      }
      // registerStorage(type, config)
      if (typeof type === 'string' && typeof _name === 'object' && _name) {
        config = _name;
        let name = type;
        if (typeof this.#storageInstances[name] !== 'undefined') {
          logger.error('registerStorage(): storage ' + name + ' is already registered.');
          return false;
        }
        let SClass = this.#storageClasses[type];
        if (!SClass) {
          logger.error('registerStorage(): storage type ' + type + ' does not exist or is not loaded.');
          return false;
        }
        this.#storageInstances[name] = new SClass(config, name);
        return true;
      }
      logger.warn('Invalid syntax for registerStorage().');
      return false;
    }

    /**
     * Returns a previously registered storage by its name.
     * */
    getStorage(name) {
      return this.#storageInstances[name] || null;
    }

    /**
     * Given a string like 10MB or 2KB or 13.4GB, it will convert the string to the number of bytes
     * */
    toBytes(str) {
      if (typeof str === 'number' && str > 0) return str;
      if (typeof str === 'string' && str !== '') {
        str = str.toUpperCase();
        str = str.replace(/ /g, '');
        let unit = str.substr(str.length - 2),
          value = parseFloat(str.substr(0, str.length - 2));
        if (unit.length !== 2) return 0;
        let k = 1000,
          imul = 0;
        if (unit === 'KB') {
          imul = k;
        } else if (unit === 'MB') {
          imul = Math.pow(k, 2);
        } else if (unit === 'GB') {
          imul = Math.pow(k, 3);
        } else if (unit === 'TB') {
          imul = Math.pow(k, 4);
        } else if (unit === 'PB') {
          imul = Math.pow(k, 5);
        }
        if (imul === 0) return value;
        value = value * imul;
        if (isNaN(value)) return 0;
        return value;
      }
      return 0;
    }

    /**
     * Given the number of bytes, it will convert to pretty printing (10MB, 12.3KB, etc)
     * */
    fromBytes(bytes, _dm) {
      if (typeof bytes !== 'number' || bytes === 0) {
        return 'Empty';
      }
      let k = 1000,
        dm = (typeof _dm === 'number' ? _dm : 2),
        i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + SIZES[i];
    }


  }

  return UploadPlugin;
}
