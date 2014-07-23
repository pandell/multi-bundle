/*jslint node: true */

"use strict";

var path = require("path");

var isPlainObject = require("lodash.isplainobject");
var R = require("ramda");
var Rx = require("rx");

var sort = require("./lib/toposort");

var cleanOpts = R.omit(["browserify", "threshold"]);
var s = require("readable-stream");

function fromStream(stream) {
    return Rx.Observable.create(function (observer) {
        function errorHandler (err) {
            observer.onError(err);
        }

        function endHandler () {
            observer.onCompleted();
        }

        var tr = new s.Writable({ objectMode: stream._readableState.objectMode });
        tr._write = function (chunk, enc, cb) {
            observer.onNext(chunk);
            cb();
        };

        stream.pipe(tr);

        stream.addListener('error', errorHandler);
        stream.addListener('end', endHandler);

        return function () {
            stream.unpipe(tr);
            stream.removeListener('error', errorHandler);
            stream.removeListener('end', endHandler);
        };
    }).publish().refCount();
}

function concatDeps(config, opts) {
    function walk(config, level) {
        return R.map(function (name) {
            var entry = config[name];
            if (isPlainObject(entry)) {
                return walk(entry, level.concat(name));
            }
            return { name: name, entry: entry, level: level.concat(name) };
        }, R.keys(config));
    }

    var entries = R.flatten(walk(config, []));
    var cache = {};

    function deps(entries, i) {
        var e = entries[i];
        var fullPaths = R.map(R.applyLeft(path.resolve, opts.basedir || process.cwd()), [].concat(e.entry));
        var depOpts = R.mixin({ cache: cache }, cleanOpts(opts));
        var b = opts.browserify(fullPaths, depOpts);
        console.log(i + ": ", e.name);
        return sort(fromStream(b.deps(depOpts)))
                .map(R.mixin({ level: e.level }))
                .aggregate([], function (rows, row) {
                    console.log(i + ".A: ", row.id);
                    rows.push(row);
                    if (!cache[row.id]) {
                        cache[row.id] = R.omit(["level"], row);
                    }
                    console.log(i + ".A: cache=", R.keys(cache).length);
                    return rows;
                })
                .flatMap(function (rows) {
                    console.log(i + ".B: ", i + 1, entries.length);
                    var r = Rx.Observable.fromArray(rows);
                    return i + 1 < entries.length
                        ? r.concat(deps(entries, i + 1))
                        : r;
                })
                .do(function (row) {
                    console.log(i + ".C: ", row.id);
                });
    }

    //var rows = [];

    return deps(entries, 0).share().do(function (row) {
        console.log("Z: " + row.id);
    });

}

var browserify = require("browserify");

var entryConfig = {
    common: {
        start: "./tests/fixtures/start.js",
        group: {
            stop: "./tests/fixtures/stop.js",
            pause: ["./tests/fixtures/pause.js", "./tests/fixtures/resume.js"]
        }
    },
    oneoff: "./tests/fixtures/oneoff.js"
};

var deps = concatDeps(entryConfig, { browserify: browserify });

deps.subscribe(
        function onNext(row) {
            console.log("S: " + row.id);
        },
        function onError(err) {
            console.error(err);
        },
        function onEnd() {
            console.log("S:END");
        }
    );

deps.subscribe(
        function onNext(row) {
            console.log("T: " + row.id);
        },
        function onError(err) {
            console.error(err);
        },
        function onEnd() {
            console.log("T:END");
        }
    );
