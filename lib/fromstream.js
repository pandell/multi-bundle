/*jslint node: true, nomen: true, unparam: true */

"use strict";

var Rx = require("rx");
var stream = require("readable-stream");

//-----------------------------------------------
// streams2 version of Rx.Node.fromStream
module.exports = function fromStream(readable) {
    return Rx.Observable.create(function (observer) {
        function errorHandler(err) {
            observer.onError(err);
        }

        function endHandler() {
            observer.onCompleted();
        }

        var tr = new stream.Writable({ objectMode: readable._readableState.objectMode });
        tr._write = function (chunk, enc, cb) {
            observer.onNext(chunk);
            cb();
        };

        readable.addListener('error', errorHandler);
        readable.addListener('end', endHandler);
        readable.pipe(tr);

        return function () {
            readable.removeListener('error', errorHandler);
            readable.removeListener('end', endHandler);
            readable.unpipe(tr);
        };
    }).publish().refCount();
};
