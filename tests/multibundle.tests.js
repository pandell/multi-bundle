/*jslint node: true, vars: true, nomen: true */

"use strict";

var path = require("path");

var test = require("tape");
var concat = require("concat-stream");
var R = require("ramda");

var bundle = require("../");

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
test("multi-bundle", function (t) {

    //-------------------------------------------
    t.test("for a single entry point", function (t) {

        var opts = { browserify: BrowserifyMock, basedir: __dirname };

        //---------------------------------------
        t.test("produces a single bundle", function (t) {

            bundle("./fixtures/oneoff.js", opts, function (err, res) {
                t.error(err, "no errors");
                t.equal(res.name, "oneoff", "name is basename without ext");
                t.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
                t.end();
            });

        });

        //---------------------------------------
        t.test("includes entry modules with no externals", function (t) {

            bundle("./fixtures/oneoff.js", opts, function (err, res) {
                t.error(err, "no errors");
                t.deepEqual(res.compiler.files, resolve(["oneoff.js"]), "only entry module is added");
                t.deepEqual(res.compiler.externals, [], "no externals are added");
                t.end();
            });

        });

        //---------------------------------------
        t.test("passes dependency stream to compiler options", function (t) {

            bundle("./fixtures/oneoff.js", opts, function (err, res) {
                t.error(err, "no errors");

                t.ok(res.compiler.opts.deps, "deps was specified");
                t.equal(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    t.deepEqual(
                        R.pluck("id", deps),
                        resolve(["z.js", "a.js", "d.js", "oneoff.js"]),
                        "all deps are included"
                    );
                    t.end();
                }));

            });

        });

    });

    //-------------------------------------------
    t.test("for an array entry point", function (t) {

        var opts = { browserify: BrowserifyMock, basedir: __dirname };

        //---------------------------------------
        t.test("produces a single bundle", function (t) {

            bundle(["./fixtures/a.js", "./fixtures/b.js"], opts, function (err, res) {
                t.error(err, "no errors");
                t.equal(res.name, "bundle", "name is 'bundle'");
                t.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
                t.end();
            });

        });

        //---------------------------------------
        t.test("includes entry modules with no externals", function (t) {

            bundle(["./fixtures/a.js", "./fixtures/b.js"], opts, function (err, res) {
                t.error(err, "no errors");
                t.deepEqual(res.compiler.files, resolve(["a.js", "b.js"]), "only entry modules are added");
                t.deepEqual(res.compiler.externals, [], "no externals are added");
                t.end();
            });

        });

        //---------------------------------------
        t.test("passes dependency stream to compiler options", function (t) {

            bundle(["./fixtures/a.js", "./fixtures/b.js"], opts, function (err, res) {
                t.error(err, "no errors");

                t.ok(res.compiler.opts.deps, "deps was specified");
                t.equal(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    t.deepEqual(
                        R.pluck("id", deps),
                        resolve(["z.js", "a.js", "y.js", "b.js"]),
                        "all deps are included"
                    );
                    t.end();
                }));

            });

        });

    });

    //-------------------------------------------
    t.test("for a nested set of entry points", function (t) {

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
        t.test("produces common and entry bundles", function (t) {
            // depth-first traversal
            var names = ["common", "start", "group", "stop", "pause", "oneoff"];

            t.plan(names.length * 4); // 4 assertions per bundle

            var b = 0;
            bundle(entryConfig, opts, function (err, res) {
                t.error(err, "no errors");
                t.ok(res, "has result");
                t.equal(res.name, names[b], "name is '" + names[b] + "'");
                t.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
                b += 1;
            });
        });

        //---------------------------------------
        t.test("includes entry modules with correct externals", function (t) {
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

            t.plan(12); // 4 entries * 3 assertions

            bundle(entryConfig, opts, function (err, res) {
                if (!expected[res.name]) { return; }
                t.error(err, "no errors");
                t.deepEqual(res.compiler.files, expected[res.name].files, res.name + ": only entry modules are added");
                t.deepEqual(res.compiler.externals, expected[res.name].externals, res.name + ": external dependencies are marked");
            });
        });

        //---------------------------------------
        t.test("requires common dependencies with correct externals", function (t) {
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

            t.plan(8); // 2 modules * 4 assertions

            bundle(entryConfig, opts, function (err, res) {
                if (!expected[res.name]) { return; }
                t.error(err, "no errors");
                t.deepEqual(res.compiler.files, [], res.name + ": no entry modules are added");
                t.deepEqual(res.compiler.requires, expected[res.name].requires, res.name + ": required dependencies are added");
                t.deepEqual(res.compiler.externals, expected[res.name].externals, res.name + ": external dependencies are marked");
            });
        });

        //---------------------------------------
        t.test("passes dependency stream to compiler options", function (t) {
            var expected = {
                "common": resolve(["z.js", "a.js"]),
                "group": resolve(["z.js", "a.js", "y.js", "b.js"]),
                "start": resolve(["z.js", "a.js", "d.js", "start.js"]),
                "stop": resolve(["z.js", "a.js", "y.js", "b.js", "stop.js"]),
                "pause": resolve(["z.js", "a.js", "y.js", "b.js", "x.js", "c.js", "pause.js", "resume.js"]),
                "oneoff": resolve(["z.js", "a.js", "d.js", "oneoff.js"])
            };

            t.plan(24); // 6 bundles * 4 assertions

            bundle(entryConfig, opts, function (err, res) {
                t.error(err, "no errors");

                t.ok(res.compiler.opts.deps, "deps was specified");
                t.equal(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    t.deepEqual(R.pluck("id", deps), expected[res.name], res.name + ": all deps are included");
                }));

            });

        });

    });

});
