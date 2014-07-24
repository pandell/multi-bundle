/*jslint node: true, vars: true */

"use strict";

var path = require("path");

var isPlainObject = require("lodash.isplainobject");
var R = require("ramda");
var Rx = require("rx");

var fromStream = require("./fromstream");
var sort = require("./toposort");

var cleanOpts = R.omit(["browserify", "threshold"]);

//-----------------------------------------------
function walkConfig(config, level) {
    return R.map(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            return walkConfig(entry, level.concat(name));
        }
        return { name: name, entry: entry, level: level.concat(name) };
    }, R.keys(config));
}

//-----------------------------------------------
function deps(entries, i, opts) {
    var e = entries[i];
    var fullPaths = R.map(R.applyLeft(path.resolve, opts.basedir || process.cwd()), [].concat(e.entry));
    var b = opts.browserify(fullPaths, cleanOpts(opts));
    return sort(fromStream(b.deps(opts)))
        .do(function (row) {
            if (!opts.cache[row.id]) {
                opts.cache[row.id] = row;
            }
        })
        .map(R.mixin({ level: e.level }))
        .toArray()
        .flatMap(function (rows) {
            var r = Rx.Observable.fromArray(rows);
            return i + 1 < entries.length
                ? r.concat(deps(entries, i + 1, opts))
                : r;
        });
}

//-----------------------------------------------
module.exports = function concatDeps(config, opts) {
    var entries = R.flatten(walkConfig(config, []));

    return deps(entries, 0, opts).shareReplay();
};
