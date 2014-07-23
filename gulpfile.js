/*jslint node: true, unparam: true, vars: true */

"use strict";

var gulp = require("gulp");
var jshint = require("gulp-jshint");
var jslint = require("gulp-jslint-simple");
var mocha = require("gulp-mocha");
var monitorCtrlC = require("monitorctrlc");
var rimraf = require("gulp-rimraf");
var taskFromStreams = require("gulp-taskfromstreams");

var srcFiles = "{.,./lib}/*.js*";
var testFiles = "tests/*.js";
var exampleOut = "./build";

gulp.task("lint", taskFromStreams(function () {
    return [
        gulp.src([srcFiles, testFiles]),
        jshint(),
        jslint.run(),
        jslint.report({ emitErrorAtEnd: false })
    ];
}));

gulp.task("test", ["lint"], taskFromStreams(function () {
    return [
        gulp.src(testFiles, { read: false }),
        mocha({ reporter: "spec" })
    ];
}));

gulp.task("clean", taskFromStreams(function () {
    return [
        gulp.src(exampleOut, { read: false }),
        rimraf()
    ];
}));

gulp.task("example", ["lint", "clean"], taskFromStreams(function () {
    var browserify = require("browserify");
    var source = require("vinyl-source-stream");

    var multi = require("./index");

    var entryConfig = {
        common: {
            start: "./tests/fixtures/start.js",
            group: {
                stop: "./tests/fixtures/stop.js",
                pause: ["./tests/fixtures/pause.js", "./tests/fixtures/resume.js"]
            }
        },
        oneoff: "./tests/fixtures/oneoff.js"
    };

    var m = multi(entryConfig, { browserify: browserify });

    return [
        m.bundle({
            objectMode: true,
            debug: true,
            pipeTo: function (name) { return source(name + ".js"); }
        }),
        gulp.dest(exampleOut)
    ];
}));

gulp.task("watch", function () {
    monitorCtrlC();
    gulp.watch([srcFiles, testFiles], ["test"]);
    gulp.start("test");
});
