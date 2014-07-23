/*jslint node: true, nomen: true, vars: true, unparam: true */

"use strict";

var path = require("path");
var util = require("util");

var isPlainObject = require("lodash.isplainobject");
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
var cleanOpts = R.omit(["browserify", "threshold"]);

//-----------------------------------------------
function buildEntryCompiler(name, deps, opts) {
    var ourDeps = deps
        .filter(R.compose(R.eq(name), R.last, R.prop("level")))
        .distinct(R.prop("id"));

    return ourDeps.aggregate({ externals: [], files: [] }, function (res, row) {
        if (row.external) {
            res.externals.push(row.id);
        } else if (row.entry) {
            res.files.push(row.id);
        }
        return res;
    }).map(function (res) {
        var compiler = opts.browserify(R.mixin(cleanOpts(opts), { deps: depsStream(ourDeps) }));

        R.each(compiler.external.bind(compiler), res.externals);
        R.each(compiler.add.bind(compiler), res.files);

        return { name: name, compiler: compiler };
    }).single();
}

//-----------------------------------------------
function buildCommonCompiler(name, deps, opts) {
    return deps.map(function (res) {
        var compiler = opts.browserify(R.mixin(cleanOpts(opts), {
            deps: depsStream(Rx.Observable.fromArray([].concat(res.externals, res.requires)).distinct(R.prop("id")))
        }));

        R.each(compiler.external.bind(compiler), R.uniq(R.pluck("id", res.externals)));
        R.each(compiler.require.bind(compiler), R.uniq(R.pluck("id", res.requires)));

        return { name: name, compiler: compiler };
    }).single();
}

//-----------------------------------------------
function getChildDeps(commonDeps) {
    return commonDeps.flatMap(function (res) {
        return Rx.Observable.fromArray([].concat(
            res.externals,
            R.map(R.mixin({ external: true }), res.requires),
            res.childDeps
        ));
    });
}

//-----------------------------------------------
function getCommonDeps(name, deps, opts) {

    function exceedsThreshold(ctx, row) {
        return (ctx.rows[row.id].length > opts.threshold && gce(R.pluck("level", ctx.rows[row.id])) === name) || ctx.ensureCommon[row.id];
    }

    return deps.filter(R.compose(R.contains(name), R.prop("level"))).aggregate({ rows: {}, ensureCommon: {} }, function (ctx, row) {
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
    }).single();
}

//-----------------------------------------------
function buildCompilers(config, deps, opts) {
    return Rx.Observable.concat(R.map(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            var commonDeps = getCommonDeps(name, deps, opts);
            return Rx.Observable.concat(
                buildCommonCompiler(name, commonDeps, opts),
                buildCompilers(entry, getChildDeps(commonDeps), opts)
            );
        }
        return buildEntryCompiler(name, deps, opts);
    }, R.keys(config)));
}

//-----------------------------------------------
function concatDeps(config, opts, callback) {
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

    function deps(e) {
        console.log("1: ", e.name);
        var fullPaths = R.map(R.applyLeft(path.resolve, opts.basedir || process.cwd()), [].concat(e.entry));
        var depOpts = R.mixin({ cache: cache }, cleanOpts(opts));
        var b = opts.browserify(fullPaths, depOpts);
        return sort(Rx.Node.fromStream(b.deps(depOpts)))
                .do(function (row) {
                    console.log("2: ", row.id);
                    cache[row.id] = row;
                }).map(R.mixin({ level: e.level }));
    }

    var rows = [];

    Rx.Observable.fromArray(entries).flatMap(function (e) {
        return deps(e);
    }).subscribe(
        function onNext(row) {
            rows.push(row);
        },
        function onError(err) {
            callback(err);
        },
        function onEnd() {
            callback(null, rows);
        }
    );

/*
    var i = 0;

    var results = R.map(function (name) {
        var entry = config[name];
        if (isPlainObject(entry)) {
            return Rx.Observable.concat(concatDeps(entry, opts, level.concat(name), cache));
        }
        var fullPaths = R.map(R.applyLeft(path.resolve, opts.basedir || process.cwd()), [].concat(entry));
        var depOpts = R.mixin({ cache: cache }, cleanOpts(opts));
        var b = opts.browserify(fullPaths, depOpts);
        var deps = b.deps(depOpts);

        console.log(util.inspect(depOpts.packageCache, { colors: true }));
        console.log(util.inspect(depOpts.cache, { colors: true }));

        var sorted = sort(Rx.Node.fromStream(deps));

        console.log(i);
        i += 1;

        return {
            deps: sorted.map(R.mixin({ level: level.concat(name) })),
            cache: sorted.aggregate({}, function (c, row) {
                c[row.id] = row;
                console.log(row);
            })
        };
    }, R.keys(config));

    console.log(util.inspect(results));

    return Rx.Observable.concat(R.pluck("deps", results));
    */
}

//-----------------------------------------------
function bundleCompilers(compilers, opts) {
    if (!opts) { opts = {}; }

    var transforms = [].concat(opts.pipeTo || []);
    var s = stream.PassThrough({ objectMode: !!opts.objectMode });

    Rx.Node.writeToStream(
        compilers.flatMap(function (res) {
            var bundle = res.compiler.bundle(R.omit(["objectMode", "pipeTo"], opts));

            return Rx.Node.fromStream(
                R.reduce(function (b, t) {
                    return b.pipe(t(res.name, res.compiler));
                }, bundle, transforms)
            );
        }),
        s
    );

    return s;
}

//-----------------------------------------------
function streamCompilers(compilers) {
    var s = stream.PassThrough({ objectMode: true });
    Rx.Node.writeToStream(compilers, s);
    return s;
}

//-----------------------------------------------
module.exports = function createMultiBundle(entryConfig, opts) {
    var config = {};

    if (typeof entryConfig === "string") {
        config[path.basename(entryConfig, path.extname(entryConfig))] = entryConfig;
    } else if (Array.isArray(entryConfig)) {
        config.bundle = R.clone(entryConfig);
    } else if (isPlainObject(entryConfig)) {
        config = entryConfig;
    } else {
        throw new Error("multi-bundle: expected 'entryConfig' to be a string, array of strings, or an object.");
    }

    if (!opts) {
        opts = {};
    }
    if (!opts.threshold || opts.threshold < 1) {
        opts.threshold = 1;
    }
    if (!opts.browserify) {
        try {
            opts.browserify = require("browserify");
        } catch (e) {
            throw new Error("multi-bundle: expected either 'opts.browserify' to be set or an npm dependency on 'browserify'.");
        }
    }

    opts.packageCache = {};
    opts.cache = {};

    var deps = Rx.Observable.fromNodeCallback(concatDeps);
    var compilers = buildCompilers(config, deps(config, opts), opts);

    return {
        bundle: bundleCompilers.bind(null, compilers),
        stream: streamCompilers.bind(null, compilers)
    };
};
