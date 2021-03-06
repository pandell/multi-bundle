/*jslint node: true, vars: true */
/*global describe: false, it: false */

"use strict";

var assert = require("assert");

var gcp = require("../lib/gce");

describe("gce", function () {

    it("returns greatest common element", function () {
        assert.deepEqual(gcp([ ["a", "b"], ["a"]]), "a");
        assert.deepEqual(gcp([ ["a", "b"], ["a", "b", "c"]]), "b");
    });

    it("returns null if no common element", function () {
        assert.deepEqual(gcp([ ["a", "b"], ["c"]]), null);
        assert.deepEqual(gcp([ [], ["a"]]), null);
        assert.deepEqual(gcp([ [], []]), null);
    });

});
