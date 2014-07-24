/*jslint node: true, vars: true, nomen: true */
/*global describe: false, it: false, beforeEach: false */

"use strict";

var assert = require("assert");

var R = require("ramda");
var Rx = require("rx");
var stream = require("readable-stream");

var concatDeps = require("../lib/concatdeps");


//-----------------------------------------------
function BrowserifyMock(deps, paths, opts) {
    if (!(this instanceof BrowserifyMock)) { return new BrowserifyMock(deps, paths, opts); }

    this.mockDeps = deps;
    this.path = paths[0];
    this.opts = opts;
}

BrowserifyMock.prototype.deps = function (opts) {
    if (opts.depsCalled) {
        opts.depsCalled[this.path] += 1;
    }
    if (opts.cacheUsed) {
        opts.cacheUsed[this.path] = R.mixin({}, opts.cache);
    }

    var self = this;
    var readable = new stream.Readable({ objectMode: true });
    readable._read = function () {
        var i, deps = self.mockDeps[self.path];
        for (i = 0; i < deps.length; i += 1) {
            this.push(deps[i]);
        }
        this.push(null);
    };

    return readable;
};

//-----------------------------------------------
describe("concatDeps", function () {

    var deps = {
        "/a": [
            { id: "./a", source: "a", deps: { "b": "./b", "c": "./c" }, entry: true },
            { id: "./b", source: "b", deps: { "c": "./c" } },
            { id: "./c", source: "c", deps: {} }
        ],
        "/b": [
            { id: "./b", source: "b", deps: { "c": "./c" }, entry: true },
            { id: "./c", source: "c", deps: {} }
        ],
        "/c": [
            { id: "./c", source: "c", deps: {} }
        ]
    };

    var config = {
        "x": {
            "a": "./a",
            "b": "./b"
        }
    };

    var opts = {
        basedir: "/",
        browserify: R.applyLeft(BrowserifyMock, deps)
    };

    //-------------------------------------------
    beforeEach(function () {
        opts.cache = {};
        opts.cacheUsed = { "/a": {}, "/b": {} };
        opts.depsCalled = { "/a": 0, "/b": 0, "/c": 0 };
    });

    //-------------------------------------------
    it("should include entry point dependencies", function (done) {
        var called = 0;

        var observable = concatDeps(config, opts).do(function () { called += 1; });

        observable.subscribe(Rx.helpers.noop, done, function onEnd() {
            assert.strictEqual(called, 5); // a:3, b:2
            done();
        });
    });

    //-------------------------------------------
    it("calls 'deps' once per entry point", function (done) {
        var observable = concatDeps(config, opts);

        // extra subscriptions should have no effect
        observable.subscribe(Rx.helpers.noop, done, function onEnd() {
            observable.subscribe(Rx.helpers.noop, done, function onEnd() {
                assert.strictEqual(opts.depsCalled["/a"], 1);
                assert.strictEqual(opts.depsCalled["/b"], 1);
                assert.strictEqual(opts.depsCalled["/c"], 0);
                done();
            });
        });
    });

    //-------------------------------------------
    it("builds a cache incrementally", function (done) {
        var observable = concatDeps(config, opts);

        // extra subscriptions should have no effect
        observable.subscribe(Rx.helpers.noop, done, function onEnd() {
            observable.subscribe(Rx.helpers.noop, done, function onEnd() {
                assert.deepEqual(opts.cacheUsed["/a"], {});
                assert.deepEqual(opts.cacheUsed["/b"], {
                    "./a": { id: "./a", source: "a", deps: { "b": "./b", "c": "./c" }, entry: true },
                    "./b": { id: "./b", source: "b", deps: { "c": "./c" } },
                    "./c": { id: "./c", source: "c", deps: {} }
                });
                done();
            });
        });
    });

});
