'use strict';

/**
 * The Thorin upload plugin works with asset uploading to various storage sollutions.
 * Plugin options:
 *  - transport - the transport to be attached to.
 *  -
 * */
const initUploader = require('./lib/uploader'),
  initHandler = require('./lib/handler'),
  IStorage = require('./lib/IStorage');
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
  const storageInstances = {};
  let logger = thorin.logger(opt.logger),
    uploader = initUploader(thorin, opt, storageInstances),
    storages = [],
    Handler = null;

  let pluginObj = {},
    isStarted = false,
    handlers = [];

  /* When the transport layer is ready, we will attach all the uploading paths to it. */
  thorin.on(thorin.EVENT.RUN, 'transport.' + opt.transport, (tObj) => {
    for (let i = 0; i < handlers.length; i++) {
      uploader.add(handlers[i]);
    }
    handlers = null;
    isStarted = true;
  });

  /**
   * Given the number of bytes, it will convert to pretty printing (10MB, 12.3KB, etc)
   * */
  const SIZES = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  pluginObj.fromBytes = function (bytes, _dm) {
    if (typeof bytes !== 'number' || bytes === 0) {
      return 'Empty';
    }
    let k = 1000,
      dm = (typeof _dm === 'number' ? _dm : 2),
      i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + SIZES[i];
  };

  /**
   * Given a string like 10MB or 2KB or 13.4GB, it will conver the string to the number of bytes
   * */
  pluginObj.toBytes = function (str) {
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
  };

  /**
   * Registers a new upload handler that works exactly as a thorin.Action,
   * but with a few other functionalities.
   * */
  pluginObj.addHandler = function AddUploadHandler(name, uploadPath) {
    if (!Handler) Handler = initHandler(thorin, opt);
    if (!handlers) {
      logger.error('Upload plugin already started, cannot add handler ' + name);
      return false;
    }
    if (typeof name !== 'string' || !name || typeof uploadPath !== 'string' || !uploadPath) {
      throw new Error('upload.addHandler() requires (name, uploadPath)');
    }
    const handlerObj = new Handler(name, uploadPath);
    if (isStarted) {
      handlers.add(handlerObj);
    } else {
      handlers.push(handlerObj);
    }
    return handlerObj;
  }

  /* Expose the FileUpload class */
  pluginObj.File = uploader.FileUpload;

  /*
   * Each upload storage sollution will register itself to the upload plugin,
   * so that they can share references.
   * */
  const storageClasses = {};
  pluginObj.registerStorageClass = function RegisterStorage(type, StorageClass) {
    storageClasses[type] = StorageClass;
  };

  /*
   * Creates a new storage class instance, based on a previously registered one.
   * NOTE: this is not persisted and should be used with dynamic storage types.
   * */
  pluginObj.createStorage = function CreateStorageInstance(type, config) {
    if (typeof storageClasses[type] === 'undefined') {
      logger.error('createStorage(): storage ' + type + ' is not registered yet.');
      return null;
    }
    let Storage = storageClasses[type];
    return new Storage(config);
  };

  /*
   * Creates and caches an instance of a storage class.
   * Ways of registering a storage:
   *   registerStorage(type, instanceName, config)
   *   registerStorage(type, config)
   *   registerStorage(storageInstanceObj);
   * */
  pluginObj.registerStorage = function RegisterStorageInstance(type, _name, config) {
    // registerStorage(instance)
    if (type instanceof IStorage) {
      let name = type.name;
      if (typeof storageInstances[name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + name + ' is already registered.');
        return false;
      }
      storageInstances[name] = type;
      return true;
    }
    // registerStorage(type, instanceName, config)
    if (typeof type === 'string' && typeof _name === 'string') {
      if (typeof storageInstances[_name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + _name + ' is already registered.');
        return false;
      }
      if (!config) config = {};
      let SClass = storageClasses[type];
      if (!SClass) {
        logger.error('registerStorage(): storage type ' + type + ' does not exist or is not loaded.');
        return false;
      }
      storageInstances[_name] = new SClass(config, _name);
      return true;
    }
    // registerStorage(type, config)
    if (typeof type === 'string' && typeof _name === 'object' && _name) {
      config = _name;
      let name = type;
      if (typeof storageInstances[name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + name + ' is already registered.');
        return false;
      }
      let SClass = storageClasses[type];
      if (!SClass) {
        logger.error('registerStorage(): storage type ' + type + ' does not exist or is not loaded.');
        return false;
      }
      storageInstances[name] = new SClass(config, name);
      return true;
    }
    logger.warn('Invalid syntax for registerStorage().');
    return false;
  }

  /*
   * Returns a previously registered storage by its name.
   * */
  pluginObj.getStorage = function GetStorage(name) {
    return storageInstances[name] || null;
  }

  pluginObj.options = opt;
  pluginObj.IStorage = IStorage;
  return pluginObj;
};
module.exports.publicName = 'upload';