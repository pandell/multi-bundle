/*jslint node: true, vars: true */

"use strict";

var concat = require("concat-stream");
var gulp = require("gulp");
var jshint = require("gulp-jshint");
var jslint = require("gulp-jslint-simple");
var monitorCtrlC = require("monitorctrlc");
var R = require("ramda");
var spawn = require("child_process").spawn;
var taskFromStreams = require("gulp-taskfromstreams");

var srcFiles = "{.,./lib}/*.js*";
var testFiles = "tests/*.js";

gulp.task("lint", taskFromStreams(function () {
    return [
        gulp.src([srcFiles, testFiles]),
        jshint(),
        jslint.run(),
        jslint.report({ emitErrorAtEnd: true })
    ];
}));

gulp.task("test", ["lint"], taskFromStreams(function () {
    return [
        gulp.src(testFiles, { read: false }),
        concat(function (files) {
            console.log(files);
            spawn("node", ["tests/run.js"].concat(R.pluck("path", files)), { stdio: "inherit" });
        })
    ];
}));

gulp.task("watch", function () {
    monitorCtrlC();
    gulp.watch([srcFiles, testFiles], ["test"]);
    gulp.start("test");
});
