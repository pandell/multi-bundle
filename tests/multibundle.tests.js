/*jslint node: true, vars: true, nomen: true */
/*global describe: false, it: false */

"use strict";

var assert = require("assert");
var path = require("path");

var concat = require("concat-stream");
var R = require("ramda");
var Rx = require("rx");

var multi = require("../");

//-----------------------------------------------
function BrowserifyMock(opts) {
    if (!(this instanceof BrowserifyMock)) { return new BrowserifyMock(opts); }

    this.opts = opts;
    this.files = [];
    this.requires = [];
    this.externals = [];
}

BrowserifyMock.prototype.add = function (file) {
    this.files.push(file);
};

BrowserifyMock.prototype.require = function (file) {
    this.requires.push(file);
};

BrowserifyMock.prototype.external = function (file) {
    this.externals.push(file);
};

//-----------------------------------------------
var resolve = R.map(R.compose(path.resolve, function (p) { return __dirname + "/fixtures/" + p; }));

//-----------------------------------------------
function subscribe(observable, onNext, done) {
    var error;
    observable.subscribe(
        function (res) {
            try {
                onNext(res);
            } catch (e) {
                error = e;
            }
        },
        done,
        function () {
            done(error);
        }
    );
}

//-----------------------------------------------
describe("multi-bundle", function () {

    //-------------------------------------------
    describe("for a single entry point", function () {

        var opts = { browserify: BrowserifyMock, basedir: __dirname };

        //---------------------------------------
        it("produces a single bundle", function (done) {
            var observable = Rx.Node.fromStream(multi("./fixtures/oneoff.js", opts).stream());

            subscribe(observable, function (res) {
                assert.strictEqual(res.name, "oneoff");
                assert.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
            }, done);
        });

        //---------------------------------------
        it("includes entry modules with no externals", function (done) {
            var observable = Rx.Node.fromStream(multi("./fixtures/oneoff.js", opts).stream());

            subscribe(observable, function (res) {
                assert.deepEqual(res.compiler.files, resolve(["oneoff.js"]));
                assert.deepEqual(res.compiler.externals, []);
            }, done);
        });

        //---------------------------------------
        it("passes options to compiler, omitting internals", function (done) {
            var observable = Rx.Node.fromStream(multi("./fixtures/oneoff.js", R.mixin(opts, { a: "a" })).stream());

            subscribe(observable, function (res) {
                var o = R.omit(["deps"], res.compiler.opts);
                assert.deepEqual(o, { a: "a", basedir: __dirname });
            }, done);
        });

        //---------------------------------------
        it("passes dependency stream to compiler options", function (done) {
            var observable = Rx.Node.fromStream(multi("./fixtures/oneoff.js", opts).stream());

            subscribe(observable, function (res) {
                assert.ok(res.compiler.opts.deps, "deps was specified");
                assert.strictEqual(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    assert.deepEqual(
                        R.pluck("id", deps),
                        resolve(["z.js", "a.js", "d.js", "oneoff.js"])
                    );
                }));
            }, done);
        });

    });

    //-------------------------------------------
    describe("for an array entry point", function () {

        var opts = { browserify: BrowserifyMock, basedir: __dirname };

        //---------------------------------------
        it("produces a single bundle", function (done) {
            var observable = Rx.Node.fromStream(multi(["./fixtures/a.js", "./fixtures/b.js"], opts).stream());

            subscribe(observable, function (res) {
                assert.strictEqual(res.name, "bundle");
                assert.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
            }, done);
        });

        //---------------------------------------
        it("includes entry modules with no externals", function (done) {
            var observable = Rx.Node.fromStream(multi(["./fixtures/a.js", "./fixtures/b.js"], opts).stream());

            subscribe(observable, function (res) {
                assert.deepEqual(res.compiler.files, resolve(["a.js", "b.js"]));
                assert.deepEqual(res.compiler.externals, []);
            }, done);
        });

        //---------------------------------------
        it("passes dependency stream to compiler options", function (done) {
            var observable = Rx.Node.fromStream(multi(["./fixtures/a.js", "./fixtures/b.js"], opts).stream());

            subscribe(observable, function (res) {
                assert.ok(res.compiler.opts.deps, "deps was specified");
                assert.strictEqual(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    assert.deepEqual(
                        R.pluck("id", deps),
                        resolve(["z.js", "a.js", "y.js", "b.js"])
                    );
                }));
            }, done);
        });

    });

    //-------------------------------------------
    describe("for a nested set of entry points", function () {

        var opts = { browserify: BrowserifyMock, basedir: __dirname };
        var entryConfig = {
            common: {
                start: "./fixtures/start.js",
                group: {
                    stop: "./fixtures/stop.js",
                    pause: ["./fixtures/pause.js", "./fixtures/resume.js"]
                }
            },
            oneoff: "./fixtures/oneoff.js"
        };

        //---------------------------------------
        it("produces common and entry bundles", function (done) {
            // depth-first traversal
            var names = ["common", "start", "group", "stop", "pause", "oneoff"];

            var observable = Rx.Observable.zipArray(
                Rx.Node.fromStream(multi(entryConfig, opts).stream()),
                Rx.Observable.fromArray(names)
            );

            subscribe(observable, function (arr) {
                var res = arr[0], expectedName = arr[1];
                assert.ok(res, "has result");
                assert.strictEqual(res.name, expectedName);
                assert.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
            }, done);
        });

        //---------------------------------------
        it("includes entry modules with correct externals", function (done) {
            var expected = {
                "start": {
                    files: resolve(["start.js"]),
                    externals: resolve(["z.js", "a.js"])
                },
                "stop": {
                    files: resolve(["stop.js"]),
                    externals: resolve(["z.js", "a.js", "y.js", "b.js"])
                },
                "pause": {
                    files: resolve(["pause.js", "resume.js"]),
                    externals: resolve(["z.js", "a.js", "y.js", "b.js"])
                },
                "oneoff": {
                    files: resolve(["oneoff.js"]),
                    externals: []
                }
            };

            var observable = Rx.Node.fromStream(multi(entryConfig, opts).stream())
                .filter(function (res) { return !!expected[res.name]; });

            subscribe(observable, function (res) {
                assert.deepEqual(res.compiler.files, expected[res.name].files);
                assert.deepEqual(res.compiler.externals, expected[res.name].externals);
            }, done);
        });

        //---------------------------------------
        it("requires common dependencies with correct externals", function (done) {
            var expected = {
                "common": {
                    requires: resolve(["z.js", "a.js"]),
                    externals: []
                },
                "group": {
                    requires: resolve(["y.js", "b.js"]),
                    externals: resolve(["z.js", "a.js"])
                }
            };

            var observable = Rx.Node.fromStream(multi(entryConfig, opts).stream())
                .filter(function (res) { return !!expected[res.name]; });

            subscribe(observable, function (res) {
                assert.deepEqual(res.compiler.files, []);
                assert.deepEqual(res.compiler.requires, expected[res.name].requires);
                assert.deepEqual(res.compiler.externals, expected[res.name].externals);
            }, done);
        });

        //---------------------------------------
        it("passes options to compiler, omitting internals", function (done) {
            var observable = Rx.Node.fromStream(multi(entryConfig, R.mixin(opts, { a: "a" })).stream());

            subscribe(observable, function (res) {
                var o = R.omit(["deps"], res.compiler.opts);
                assert.deepEqual(o, { a: "a", basedir: __dirname }, "options match");
            }, done);
        });

        //---------------------------------------
        it("passes dependency stream to compiler options", function (done) {
            var expected = {
                "common": resolve(["z.js", "a.js"]),
                "group": resolve(["z.js", "a.js", "y.js", "b.js"]),
                "start": resolve(["z.js", "a.js", "d.js", "start.js"]),
                "stop": resolve(["z.js", "a.js", "y.js", "b.js", "stop.js"]),
                "pause": resolve(["z.js", "a.js", "y.js", "b.js", "x.js", "c.js", "pause.js", "resume.js"]),
                "oneoff": resolve(["z.js", "a.js", "d.js", "oneoff.js"])
            };

            var observable = Rx.Node.fromStream(multi(entryConfig, opts).stream());

            subscribe(observable, function (res) {
                assert.ok(res.compiler.opts.deps, "deps was specified");
                assert.strictEqual(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    assert.deepEqual(R.pluck("id", deps), expected[res.name]);
                }));
            }, done);

        });

    });

});
