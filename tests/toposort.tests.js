/*jslint node: true, vars: true */

"use strict";

var test = require("tape");

var R = require("ramda");
var Rx = require("rx");

var sort = require("../lib/toposort");

test("toposort", function (t) {

    t.test("sorts modules topologically", function (t) {
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
            t.deepEqual(R.pluck("id", r), ["x.css", "0.css", "z.css", "main.css"]);
        }, t.error, t.end);
    });

    t.test("handles circular deps", function (t) {
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
            t.deepEqual(R.pluck("id", r), ["z.css", "main.css"]);
        }, t.error, t.end);
    });

});
