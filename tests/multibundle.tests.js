/*jslint node: true, vars: true, nomen: true */

"use strict";

var test = require("tape");
var concat = require("concat-stream");
var R = require("ramda");

var bundle = require("../");

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

test("multi-bundle", function (t) {

    t.test("for a single entry point", function (t) {

        t.test("produces a single bundle", function (t) {

            bundle("./fixtures/oneoff.js", { browserify: BrowserifyMock, basedir: __dirname }, function (err, res) {
                t.error(err, "no errors");
                t.equal(res.name, "oneoff", "name is basename without ext");
                t.ok(res.compiler instanceof BrowserifyMock, "compiler is mocked instance");
                t.end();
            });

        });

        t.test("specifies dependencies correctly", function (t) {

            bundle("./fixtures/oneoff.js", { browserify: BrowserifyMock, basedir: __dirname }, function (err, res) {
                t.error(err, "no errors");
                t.deepEqual(res.compiler.files, [__dirname + "/fixtures/oneoff.js"], "only entry module is added");
                t.end();
            });

        });

        t.test("passes dependency stream to compiler options", function (t) {

            bundle("./fixtures/oneoff.js", { browserify: BrowserifyMock, basedir: __dirname }, function (err, res) {
                t.error(err, "no errors");

                t.ok(res.compiler.opts.deps, "deps was specified");
                t.equal(typeof res.compiler.opts.deps, "function", "deps is a function");

                res.compiler.opts.deps().pipe(concat(function (deps) {
                    t.deepEqual(R.pluck("id", deps), [
                        __dirname + "/fixtures/z.js",
                        __dirname + "/fixtures/a.js",
                        __dirname + "/fixtures/d.js",
                        __dirname + "/fixtures/oneoff.js"
                    ], "all deps are included");

                    t.end();
                }));

            });

        });

    });

});
