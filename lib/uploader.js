'use strict';
const Busboy = require('busboy'),
  Route = require('route-parser'),
  IStorage = require('./IStorage'),
  initUploadFile = require('./uploadFile');

/**
 * Attaches busboy to the given http transport.
 * */
module.exports = function init(thorin, opt, storageInstances, pluginObj) {
  const logger = thorin.logger(opt.logger),
    dispatcher = thorin.dispatcher,
    transportObj = thorin.transport(opt.transport),
    handlerPaths = [];

  pluginObj.ERROR = {
    FILE_TOO_LARGE: thorin.error('UPLOAD.FILE_TOO_LARGE', 'File is too large.', 413),
    FILE_NOT_VALID: thorin.error('UPLOAD.FILE_INVALID', 'Unsupported file type.'),
    FILE_LIMIT: thorin.error('UPLOAD.FILE_LIMIT', 'Only one file can be uploaded once.'),
    FILE_PART_LIMIT: thorin.error('UPLOAD.SIZE_LIMIT', 'Form contains too many parts.'),
    FILE_FIELD_LIMIT: thorin.error('UPLOAD.FIELDS_LIMIT', 'Uploader does not support POST fields.'),
    FILE_INVALID: thorin.error('UPLOAD.INVALID_FILE', 'Please specify the file to upload'),
    INVALID: thorin.error('UPLOAD.FILE', 'Upload request is not valid'),
    FIELD: thorin.error('UPLOAD.INVALID_FIELD', 'Upload file field name is invalid.'),
    STORAGE_UNAVAILABLE: thorin.error('UPLOAD.STORAGE_UNAVAILABLE', 'File storage is currently unavailable.'),
    INVALID_CONTENT_TYPE: thorin.error('UPLOAD.CONTENT_TYPE', 'Uploading only works with multpart/form-data forms')
  };
  const UploadFile = initUploadFile(thorin, opt, pluginObj.ERROR);

  if (transportObj) {
    thorin.on(thorin.EVENT.INIT, 'transport.' + transportObj.name, () => {
      const appObj = transportObj.app;
      appObj._addRootMiddleware(handleIncomingRequest);

      function matchHandler(mPath) {
        for (let i = 0; i < handlerPaths.length; i++) {
          let item = handlerPaths[i];
          let res = item.route.match(mPath);
          if (res) {
            return {
              handler: item.handler,
              params: res
            }
          }
        }
        return false;
      }

      function checkCors(req, res, handlerObj) {
        if (!handlerObj.cors) return;
        let corsDomain = handlerObj.cors.domain || req.headers['origin'] || '*',
          allowHeaders = '*';
        res.header('Access-Control-Allow-Origin', corsDomain);
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Credentials', handlerObj.cors.credentials);
        res.header('Access-Control-Allow-Headers', allowHeaders);
      }

      /**
       * We have to register a root middleware inside the designated transport,
       * so that we can intercept POST requests on the upload path.
       * */
      function handleIncomingRequest(req, res, next) {
        // check if we're on the set upload path
        let matcher = matchHandler(req.path);
        if (!matcher) return next();
        let handlerObj = matcher.handler,
          inputData = Object.assign({}, req.query, matcher.params);
        if (req.method === 'OPTIONS') {
          checkCors(req, res, handlerObj);
          return res.end();
        }
        if (req.method !== 'POST') return next();
        const contentType = req.headers['content-type'] || null;
        if (!contentType) return next(pluginObj.ERROR.INVALID_CONTENT_TYPE);
        if (contentType.indexOf('multipart/form-data') !== 0) return next();
        checkCors(req, res, handlerObj);
        if (!handlerObj.hasProcessor) {
          logger.error('Upload handler ' + handlerObj.name + ' has no upload() processor attached.');
        }
        let intentObj = new thorin.Intent(handlerObj.name, inputData, onIntentCompleted);
        intentObj.transport = transportObj.name;
        const clientData = {
          ip: req.ip,
          headers: req.headers
        };
        intentObj.client(clientData);
        req.startAt = Date.now();
        req.uniqueId = appObj._requestUniqueId();
        req.method = 'UPLOAD';
        req.action = handlerObj.name;
        intentObj._attachBusboy = attachBusboy;

        intentObj.runCreate(() => {
          handlerObj._runStack(intentObj, (e) => {
            if (e instanceof Error) {
              if (e.name && e.name.indexOf('Thorin') === -1) {
                e = thorin.error(e);
              }
              if (!intentObj.hasError()) {
                intentObj.error(e);
              }
            }
            if (!intentObj.completed) {
              intentObj.send();
            }
          });
        });

        /**
         * Called to attach busboy to the request.
         * */
        function attachBusboy(fileProcessFn, onDone) {
          delete intentObj._attachBusboy;
          if (!intentObj.fieldName) intentObj.fieldName = handlerObj.fieldName;
          let customLimits = intentObj.data('uploadLimits');
          let busboyObj,
            busboyOpt = {
              headers: req.headers,
              limits: (customLimits ? thorin.util.extend(handlerObj.limits, customLimits) : handlerObj.limits)
            };
          // Try and check the content-length header.
          if (busboyOpt.limits.fileSize && req.headers['content-length']) {
            let len = parseInt(req.headers['content-length'], 10);
            if (!isNaN(len)) {
              if (len >= busboyOpt.limits.fileSize) {
                return onDone(pluginObj.ERROR.FILE_TOO_LARGE);
              }
            }
          }
          try {
            busboyObj = new Busboy(busboyOpt);
          } catch (e) {
            logger.debug(`Could not initiate busboy with request`);
            logger.debug(e.message);
            return onDone(pluginObj.ERROR.INVALID);
          }
          let isDone = false,
            hasFile = false;

          function handleError(code, message) {
            if (isDone) return;
            isDone = true;
            remove();
            let err = (typeof code === 'object' && code ? code : (typeof code === 'string' ? thorin.error(code, message) : thorin.error(code)));
            return onDone(err);
          }

          function onFile(fieldName, stream, fileName, encoding, mimeType) {
            if (fieldName !== intentObj.fieldName) {
              try {
                stream.unpipe();
                stream.resume();
              } catch (e) {
              }
              return handleError(pluginObj.ERROR.FIELD);
            }
            let fileObj = new UploadFile(stream, fileName, mimeType, encoding);
            if (!handlerObj._isFileValid(fileObj)) {
              try {
                stream.unpipe();
                stream.resume();
              } catch (e) {
              }
              fileObj.destroy();
              return handleError(pluginObj.ERROR.FILE_NOT_VALID);
            }
            hasFile = true;
            intentObj.data('file', fileObj);

            function onFileTooLarge() {
              stream.removeListener('limit', onFileTooLarge);
              try {
                stream.unpipe();
                stream.resume();
              } catch (e) {
              }
              fileObj.fileTooLarge();
              if (isDone) return;
              return handleError(pluginObj.ERROR.FILE_TOO_LARGE);
            }

            stream.on('limit', onFileTooLarge);
            /**
             * Fetch the storage option.
             * */
            handlerObj.storageFn(intentObj, fileObj, (err, storageObj) => {
              if (err) return handleError(err);
              if (typeof storageObj === 'string') {
                storageObj = storageInstances[storageObj];
              }
              if (!(storageObj instanceof IStorage)) {
                return handleError(pluginObj.ERROR.STORAGE_UNAVAILABLE);
              }
              /* Run the before handler. */
              handlerObj._runHandler('before', 'upload', intentObj, null, fileObj);
              if (intentObj.hasError()) {
                try {
                  stream.unpipe();
                  stream.resume();
                } catch (e) {
                }
                return handleError(intentObj.error());
              }
              try {
                fileProcessFn(intentObj, fileObj, (err) => {
                  if (err) return handleError(err);
                  if (isDone) return;
                  storageObj.save(fileObj).then(() => {
                    if (isDone) return;
                    isDone = true;
                    handlerObj._runHandler('after', 'upload', intentObj, null, fileObj);
                    remove();
                    onDone();
                  }).catch(handleError);
                });
              } catch (e) {
                logger.error('Encountered an error in upload() function of upload hanler ' + handlerObj.name);
                logger.trace(e.stack);
                try {
                  stream.unpipe();
                  stream.resume();
                } catch (e) {
                }
                return handleError(e);
              }
            });
          }

          function onFilesLimit() {
            handleError(pluginObj.ERROR.FILE_LIMIT);
          }

          function onPartsLimit() {
            handleError(pluginObj.ERROR.FILE_PART_LIMIT);
          }

          function onFieldsLimit() {
            handleError(pluginObj.ERROR.FILE_FIELD_LIMIT);
          }

          function onEnd() {
            if (!hasFile) {
              return handleError(pluginObj.ERROR.FILE_INVALID);
            }
          }

          function remove() {
            busboyObj
              .removeListener('filesLimit', onFilesLimit)
              .removeListener('partsLimit', onPartsLimit)
              .removeListener('fieldsLimit', onFieldsLimit)
              .removeListener('file', onFile)
              .removeListener('finish', onEnd);
          }


          busboyObj
            .on('file', onFile)
            .on('partsLimit', onPartsLimit)
            .on('fieldsLimit', onFieldsLimit)
            .on('finish', onEnd);

          req.pipe(busboyObj);
        }

        /* Called to signal that the intent is done. */
        function onIntentCompleted(wasError, data, intentObj) {
          let fileObj = intentObj.data('file');
          if (fileObj && fileObj.error) {
            let err = fileObj.error;
            fileObj.destroy();
            return next(err);
          }
          if (wasError) {
            next(data);
            if (fileObj) fileObj.destroy();
            return;
          }
          appObj._sendIntentSuccess(intentObj, req, res);
          if (fileObj) fileObj.destroy();
        }
      }
    });
  }

  /* This is the uploader utility functions */
  const uploader = {
    FileUpload: UploadFile,
    add: function addPath(handlerObj) {
      if (!handlerObj.storageFn) {
        logger.error('Upload handler ' + handlerObj.name + ' does not provide a storage() option. Skipping.');
        return false;
      }
      if (!handlerObj.hasProcessor) {
        logger.error('Upload handler ' + handlerObj.name + ' does not provide a upload() processor. Skipping.');
        return false;
      }
      // once the handler is registered, we add it to our middleware.
      handlerObj.onRegister(() => {
        let reqPath = handlerObj.aliases[0].name;
        handlerPaths.push({
          reqPath,
          route: new Route(reqPath),
          handler: handlerObj
        });
      });
      dispatcher.addAction(handlerObj, {
        save: false
      });
      return true;
    },
    remove: function removePath(reqPath) {
      for (let i = 0; i < handlerPaths.length; i++) {
        if (handlerPaths[i].reqPath === reqPath) {
          handlerPaths.splice(i, 1);
          return true;
        }
      }
      return false;
    }
  };


  return uploader;
}
