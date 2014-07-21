/*jslint node: true */
"use strict";

var faucet = require("faucet");
var glob = require("glob");
var path = require("path");
var test = require("tape");

test.createStream().pipe(faucet()).pipe(process.stdout);

var testPattern = process.argv[2];
var matches = glob.sync(testPattern.replace(/['"]/g, ""));

matches.forEach(function (p) {
    require(path.resolve(p));
});
