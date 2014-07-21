/*jslint node: true, vars: true */

"use strict";

var test = require("tape");

var gcp = require("../lib/gce");

test("gce", function (t) {

    t.test("returns greatest common element", function (t) {
        t.deepEqual(gcp([ ["a", "b"], ["a"]]), "a");
        t.deepEqual(gcp([ ["a", "b"], ["a", "b", "c"]]), "b");
        t.end();
    });

    t.test("returns null if no common element", function (t) {
        t.deepEqual(gcp([ ["a", "b"], ["c"]]), null);
        t.deepEqual(gcp([ [], ["a"]]), null);
        t.deepEqual(gcp([ [], []]), null);
        t.end();
    });

});
