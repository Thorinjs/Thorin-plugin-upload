'use strict';

/**
 * The Thorin upload plugin works with asset uploading to various storage sollutions.
 * Plugin options:
 *  - transport - the transport to be attached to.
 *  -
 * */
const initUploader = require('./lib/uploader'),
  inidHandler = require('./lib/handler'),
  IStorage = require('./lib/IStorage');
module.exports = function(thorin, opt, pluginName) {
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
    for(let i=0; i < handlers.length; i++) {
      uploader.add(handlers[i]);
    }
    handlers = null;
    isStarted = true;
  });

  /**
  * Registers a new upload handler that works exactly as a thorin.Action,
   * but with a few other functionalities.
  * */
  pluginObj.addHandler = function AddUploadHandler(name, uploadPath) {
    if(!Handler) Handler = inidHandler(thorin, opt);
    if(!handlers) {
      logger.error('Upload plugin already started, cannot add handler ' + name);
      return false;
    }
    if(typeof name !== 'string' || !name || typeof uploadPath !== 'string' || !uploadPath) {
      throw new Error('upload.addHandler() requires (name, uploadPath)');
    }
    const handlerObj = new Handler(name, uploadPath);
    if(isStarted) {
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
  }

  /*
  * Creates and caches an instance of a storage class.
  * Ways of registering a storage:
  *   registerStorage(type, instanceName, config)
  *   registerStorage(type, config)
  *   registerStorage(storageInstanceObj);
  * */
  pluginObj.registerStorage = function RegisterStorageInstance(type, _name, config) {
    // registerStorage(instance)
    if(type instanceof IStorage) {
      let name = type.name;
      if(typeof storageInstances[name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + name + ' is already registered.');
        return false;
      }
      storageInstances[name] = type;
      return true;
    }
    // registerStorage(type, instanceName, config)
    if(typeof type === 'string' && typeof _name === 'string') {
      if(typeof storageInstances[_name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + _name + ' is already registered.');
        return false;
      }
      if(!config) config = {};
      let SClass = storageClasses[type];
      if(!SClass) {
        logger.error('registerStorage(): storage type ' + type + ' does not exist or is not loaded.');
        return false;
      }
      storageInstances[_name] = new SClass(config, _name);
      return true;
    }
    // registerStorage(type, config)
    if(typeof type === 'string' && typeof _name === 'object' && _name) {
      config = _name;
      let name = type;
      if(typeof storageInstances[name] !== 'undefined') {
        logger.error('registerStorage(): storage ' + name + ' is already registered.');
        return false;
      }
      let SClass = storageClasses[type];
      if(!SClass) {
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