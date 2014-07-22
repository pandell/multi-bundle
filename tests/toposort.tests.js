/*jslint node: true, vars: true */
/*global describe: false, it: false */

"use strict";

var assert = require("assert");

var R = require("ramda");
var Rx = require("rx");

var sort = require("../lib/toposort");

describe("toposort", function () {

    it("sorts modules topologically", function (done) {
        var deps = Rx.Observable.fromArray([
            {
                id: "main.css",
                deps: {"./a.css": "z.css"}
            },
            {
                id: "0.css",
                deps: {"x": "x.css"}
            },
            {
                id: "x.css"
            },
            {
                id: "z.css",
                deps: {}
            }
        ]);

        var result = sort(deps).toArray();
        result.subscribe(function (r) {
            assert.deepEqual(R.pluck("id", r), ["x.css", "0.css", "z.css", "main.css"]);
        }, done, done);
    });

    it("handles circular deps", function (done) {
        var deps = Rx.Observable.fromArray([
            {
                id: "main.css",
                deps: {"z.css": "z.css"}
            },
            {
                id: "z.css",
                deps: {"main.css": "main.css"}
            }
        ]);

        var result = sort(deps).toArray();

        result.subscribe(function (r) {
            assert.deepEqual(R.pluck("id", r), ["z.css", "main.css"]);
        }, done, done);
    });

});
