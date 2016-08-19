'use strict';
/**
 * An example upload handler
 */
const dispatcher = thorin.dispatcher,
  uploadObj = thorin.plugin('upload'),
  logger = thorin.logger('upload');

const INVALID_ASSET = thorin.error('INVALID.FILE', 'File unsupported');

uploadObj
  .addHandler('asset.upload', '/upload')
  //.authorize('session') // maybe add a session authorization?
  .field('asset')       // send the file under the "asset" form input
  .enableCors()         // enable full CORS support
  .before('upload.request', (intentObj) => {
    /* update the file limits settings */
    const limits = {};
    if (true) {  // if some condition, force custom file size, otherwise default to the configured one
      limits.fileSize = 2000000;
    }
    intentObj.data('uploadLimits', limits);
  })
  .before('upload', function (intentObj, fileObj) {
    /* Check if the incoming file has some sort of mime type. */
    if (fileObj.mimeType !== 'image/jpeg') {
      return intentObj.error(INVALID_ASSET);
    }
    if (fileObj.extension !== 'jpg') {
      return intentObj.error(INVALID_ASSET);
    }
  })
  .storage((intentObj, fileObj, next) => {
    const sign = intentObj.data('sign');
    // some condition, for dynamic storage classes based on the condition
    if (false) return next(null, "aws"); // the default storage
    // read some storage config
    let storageClassObj = uploadObj.create('aws', {
      key: 'CUSTOM_KEY',
      secret: 'CUSTOM_SECRET',
      bucket: 'otherBucket'
    });
    next(null, storageClassObj);
  })
  .upload((intentObj, fileObj, next) => {
    // set a custom folder for the file.
    fileObj.setFolder('some/path/for/my/file');
    next();
  })
  .use((intentObj, next) => {
    // at this point, upload succeeded, we can do some async stuff if necessary
    const fileObj = intentObj.data('file');
    logger.info('File uploaded:', fileObj.url);
    return next();
  })
  .end((intentObj) => {
    // upload request ended.
    logger.debug('Ended!');
  });

