/*jslint node: true, nomen: true, vars: true, unparam: true */

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

//-----------------------------------------------
function depsStream(deps) {
    var s = new stream.PassThrough({ objectMode: true });
    Rx.Node.writeToStream(deps, s);

    return function () {
        return s;
    };
}

//-----------------------------------------------
function buildEntryCompiler(name, deps, opts, cb) {
    var ourDeps = deps
        .filter(R.compose(R.eq(name), R.last, R.prop("level")))
        .distinct(R.prop("id"))
        .share();

    var compiler = opts.browserify(R.mixin(opts, { deps: depsStream(ourDeps) }));

    return ourDeps.distinct(R.prop("id")).subscribe(
        function onNext(row) {
            if (row.external) {
                compiler.external(row.id);
            } else if (row.entry) {
                compiler.add(row.id);
            }
        },
        cb, // onError
        function onComplete() {
            cb(null, { name: name, compiler: compiler });
        }
    );
}

//-----------------------------------------------
function buildCommonCompiler(name, deps, opts, cb) {

    function exceedsThreshold(ctx, row) {
        return (ctx.rows[row.id].length > opts.threshold && gce(R.pluck("level", ctx.rows[row.id])) === name) || ctx.ensureCommon[row.id];
    }

    var commonDeps = deps.filter(R.compose(R.contains(name), R.prop("level"))).aggregate({ rows: {}, ensureCommon: {} }, function (ctx, row) {
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
        var requires = R.filter(R.curry(exceedsThreshold)(ctx), R.reject(R.prop("external"), rowValues));
        var childDeps = R.filter(function (row) {
            return !R.containsWith(R.eqProps("id"), row, externals) && !R.containsWith(R.eqProps("id"), row, requires);
        }, rowValues);

        return { externals: externals, requires: requires, childDeps: childDeps };
    }).single().share();

    commonDeps.subscribe(
        function onNext(res) {
            var compiler = opts.browserify(R.mixin(opts, {
                deps: depsStream(Rx.Observable.fromArray([].concat(res.externals, res.requires)).distinct(R.prop("id")))
            }));

            R.each(compiler.external.bind(compiler), R.uniq(R.pluck("id", res.externals)));
            R.each(compiler.require.bind(compiler), R.uniq(R.pluck("id", res.requires)));

            cb(null, { name: name, compiler: compiler });
        },
        cb, // onError
        null // onComplete
    );

    return commonDeps.flatMap(function (res) {
        return Rx.Observable.fromArray([].concat(
            res.externals,
            R.map(R.mixin({ external: true }), res.requires),
            res.childDeps
        ));
    });
}

//-----------------------------------------------
function buildCompilers(config, deps, opts, cb) {
    R.each(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            var childDeps = buildCommonCompiler(name, deps, opts, cb);
            buildCompilers(entry, childDeps, opts, cb);
        } else {
            buildEntryCompiler(name, deps, opts, cb);
        }
    }, R.keys(config));
}

//-----------------------------------------------
function concatDeps(config, opts, level) {
    return Rx.Observable.concat(R.map(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            return Rx.Observable.concat(concatDeps(entry, opts, level.concat(name)));
        }
        var fullPaths = R.map(R.applyLeft(path.resolve, opts.basedir || process.cwd()), [].concat(entry));
        var deps = mdeps(fullPaths, opts);
        return sort(Rx.Node.fromStream(deps)).map(R.mixin({ level: level.concat(name) }));
    }, R.keys(config)));
}

//-----------------------------------------------
module.exports = function createMultiBundle(entryConfig, opts, cb) {
    var config = {};

    if (typeof entryConfig === "string") {
        config[path.basename(entryConfig, path.extname(entryConfig))] = entryConfig;
    } else if (Array.isArray(entryConfig)) {
        config.bundle = R.clone(entryConfig);
    } else if (isPlainObject(entryConfig)) {
        config = clone(entryConfig);
    } else {
        throw new Error("multi-bundle: expected 'entryConfig' to be a string, array of strings, or an object.");
    }

    if (!opts.threshold || opts.threshold < 1) {
        opts.threshold = 1;
    }

    var deps = concatDeps(config, opts, []);
    buildCompilers(config, deps, opts, cb);
};
