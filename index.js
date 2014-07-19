/*jslint node: true, vars: true */

"use strict";

var path = require("path");

var clone = require("clone");
var isPlainObject = require("lodash.isplainobject");
var mdeps = require("module-deps");
var R = require("ramda");
var Rx = require("rx");
var stream = require("readable-stream");

var gce = require("./lib/gce");
var sort = require("./lib/toposort");

/*
{
    common: {
        start: "start.js",
        group: {
            stop: "stop.js",
            pause: ["pause.js", "resume.js"]
        }
    },
    oneOff: "oneoff.js"
}

=>

[
    { name: "common", require: [...], external: [] },
    { name: "group", require: [...], external: [(common)] },

    { name: "start", entry: ["start.js"], external: [(common)] },
    { name: "stop", entry: ["stop.js"], external: [(group), (common)] },
    { name: "pause", entry: ["pause.js", "resume.js"], external: [(group), (common)] },
    { name: "oneOff", entry: ["oneoff.js"], external: [] }
]

(foo) = deps from 'foo' group
*/

function depsStream(deps) {
    return function () {
        var s = new stream.PassThrough();
        Rx.Node.writeToStream(deps, s);
        return s;
    };
}

function buildEntryCompiler(deps, name, opts, cb) {
    var ourDeps = deps
        .filter(R.contains(name, R.prop("path")))
        .share();

    var compiler = opts.browserify(R.mixin(opts, { deps: depsStream(ourDeps) }));

    return ourDeps.distinct(R.prop("id")).do(function (row) {
        if (row.external) {
            compiler.external(row.id);
        } else {
            compiler.add(row.id);
        }
    }).finally(function () {
        cb(null, { name: name, compiler: compiler });
    }).catch(cb);
}

function buildCommonCompiler(deps, name, opts, cb) {

    function exceedsThreshold(ctx, row) {
        return (ctx.rows[row.id].length > opts.threshold && gce(R.pluck("path", ctx.rows[row.id])) === name) || ctx.ensureCommon[row.id];
    }

    var ourDeps = deps
        .filter(R.contains(name, R.prop("path")))
        .share();

    return ourDeps.aggregate({ rows: {}, ensureCommon: {} }, function (ctx, row) {
        if (!ctx.rows[row.id]) {
            ctx.rows[row.id] = [];
        }
        ctx.rows[row.id].push(row);

        if (exceedsThreshold(ctx, row)) {
            R.each(function (id) { ctx.ensureCommon[id] = true; }, R.values(row.deps));
        }
        return ctx;
    }).map(function (ctx) {
        var rowValues = R.flatten(R.values(ctx.rows));
        var externals = R.filter(R.prop("external"), rowValues);
        var requires = R.filter(R.curry(exceedsThreshold)(ctx), rowValues);
        var childDeps = R.differenceWith(R.compose(R.eq, R.prop("id")), rowValues, R.union(externals, requires));

        return { externals: externals, requires: requires, childDeps: childDeps };
    }).do(function (res) {
        var compiler = opts.browserify(R.mixin(opts, { deps: depsStream(ourDeps) }));

        R.each(compiler.external, R.uniq(R.pluck("id", res.externals)));
        R.each(compiler.require, R.uniq(R.pluck("id", res.requires)));

        cb(null, { name: name, compiler: compiler });
    }).flatMap(function (res) {
        return sort(Rx.Observable.fromArray([].concat(
            res.externals,
            R.map(R.mixin({ external: true }), res.requires),
            res.childDeps
        )));
    }).catch(cb);
}


function concatDeps(config, opts, path) {
    return Rx.Observable.concat(R.map(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            return Rx.Observable.concat(concatDeps(entry, opts, path.concat(name)));
        }
        return Rx.Node.fromStream(mdeps([].concat(entry), opts))
            .map(R.mixin({ path: path.concat(name) }));
    }), R.keys(config));
}

module.exports = function createMultiBundle(entryConfig, opts, cb) {
    var config = {};

    if (typeof entryConfig === "string") {
        config[path.basename(entryConfig, path.extname(entryConfig))] = entryConfig;
    } else if (Array.isArray(entryConfig)) {
        config.common = R.clone(entryConfig);
    } else if (isPlainObject(entryConfig)) {
        config = clone(entryConfig);
    } else {
        throw new Error("multi-bundle: expected 'entryConfig' to be a string, array of strings, or an object.");
    }

    if (!opts.threshold || opts.threshold < 1) {
        opts.threshold = 1;
    }

    var deps = sort(concatDeps(config, opts, []));

    buildCommonCompiler(deps, 'a', opts, cb);
    buildEntryCompiler(deps, 'a', opts, cb);
};
