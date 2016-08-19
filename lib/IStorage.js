'use strict';
/**
 * Created by Adrian on 04-May-16.
 */
/*
 * This is the storage interface that has to be implemented
 * for custom storage options.
 * */
module.exports = class IUploadStorage {

  constructor(name) {
    this.name = name || 'INTERFACE';
  }

  /*
  * This will be called with a UploadFile object, that contains a stream.
  * It is supposed to return a promise that will attach the full URL to the
  * UploadFile instance and the file size if possible.
  * */
  save(fileObj, opt) {
    throw new Error('Not implemented: save()');
  }

  /*
  * This will check if the current storage option was saved to store the given
  * file. For example. my-bucket.s3.amazonaws.com/1.jpg would return true
  * for storages that use my-bucket and false otherwise.
  * */
  canRemove(fileUrl) {
    throw new Error('Not implemented: canRemove()');
  }

  /*
  * This will remove the actual fileUrl from the server, returning a promise.
  * */
  remove(fileUrl) {
    throw new Error('Not implemented: remove()');
  }

  /* This should be implemented by every class that has to perform any kind of resource clearing */
  destroy() {
    throw new Error('Not implemented: destroy()');
  }

}