# ~multi-bundle~ DEPRECATED

NOTE: This project was a prototype that was never used in production. If you need this functionality, switch to webpack like we did.

> Produces multiple [browserify](http://browserify.org/) bundles and extracts common dependencies.

[Git repository](https://github.com/pandell/multi-bundle)

[Changelog](https://github.com/pandell/multi-bundle/releases)

multi-bundle is a frontend for browserify that automatically factors out common dependencies based on an arbitrarily nested entry point configuration that you provide.

## Install

```sh
$ npm install --save-dev multi-bundle
```

## Usage

```js
    var multi = require('multi-bundle');

    var entryConfig = {
        common: {
            start: './start.js',
            control: {
                stop: './stop.js',
                pause: ['./pause.js', './resume.js']
            }
        },
        oneoff: './oneoff.js'
    };

    multi(entryConfig).bundle();
```

The above will produce 6 bundle streams in total.

Entry points:

1. `start`
1. `stop`
1. `pause`
1. `oneoff`

Shared bundles:

1. `common`: contains all common dependencies between `start`, `control`, `stop`, and `pause`
1. `control`: contains common dependencies shared by `stop` and `pause` but not `start`

Note that in the above example, `oneoff` will contain all of its dependencies whether or not they are shared in the other modules.

The shared bundles use `browserify.require` for their included dependencies so that they are externally available to entry point bundles.
Common module scripts must be included from outermost to innermost prior to including the entry point script.

```html
<script src="out/common.js"></script>
<script src="out/control.js"></script>
<script src="out/stop.js"></script>
```

## API

Assuming:

```js
var multi = require('multi-bundle');
```

### multi(entryConfig, [opts])

Takes entry point configuration + options and builds as many `browserify` instances as needed to factor dependencies into their appropriate bundles.

#### entryConfig
_Type_: string, Array<string>, or object

Entry point configuration.
String and array values will produce single bundles with the given entry point.
Object values *may* produce multiple bundles, depending on the configuration provided.
Each item in an entryConfig object may also be a string, an array, or another object.

Nested object values will generate a shared bundle at each level.

```js
multi({
    'common': {
        'a': 'a.js',
        'b': 'b.js'
    }
})
```

The above will produce 3 bundles: `common`, `a`, and `b`.

#### opts
_Type_: object  
_Default_: `{ threshold: 1, browserify: require('browserify') }`

Options that customize the behaviour of both `multi-bundle` and browserify.
All options defined here, except `threshold` and `browserify`, will be passed to the [browserify constructor](https://github.com/substack/node-browserify#var-b--browserifyfiles-or-opts).

#### opts.threshold
_Type_: number  
_Default_: 1

Controls how dependencies are factored into bundles.

If a dependency is shared by more than `threshold` entry points, it will get extracted into a shared bundle (if those entry points belong to a shared configuration object).
This works at every configuration level.

#### opts.browserify
_Type_: `function(opts) -> browserify instance`  
_Default_: `require('browserify')`

This is a function that takes a single parameter `opts` and produces a browserify instance.

By default, this will just use the `browserify` constructor.
You may wish to override this if you want to perform some custom configuration to all browserify instances that can't be achieved through `opts` or if you want to provide an alternate browserify-compatible constructor (such as `watchify`).

The instance returned by `opts.browserify` must adhere to the following interface:

```js
b.add(file);
b.require(file);
b.external(file);
b.bundle(opts);
```

### Instance methods

An instance of `multi()` has 2 methods:

```js
var m = multi(entryConfig, opts);
m.bundle(bopts);
m.stream();
```

### bundle(bopts) -> stream<bundle>

`bundle` returns a stream of all the output bundles produced with the given configuration.

#### bopts
_Type_: object  
_Default_: No default

These are options that control the bundle output from the browserify instances.
Any options defined here are passed to [browserify `bundle` method](https://github.com/substack/node-browserify#bbundleopts-cb).

#### bopts.pipeTo
_Type_: function(name, browserify) -> stream, Array<function(name, browserify) -> stream>  
_Default_: No default

A function or an array of functions that return streams to which the output bundles will be piped.
The functions accept the following parameters:

- `name`: name of the output bundle
- `browserify`: the browserify instance used to create the bundle

The returned streams should be [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform_1) streams.
If there is only a single `pipeTo` value, it may return a [Writable](http://nodejs.org/api/stream.html#stream_class_stream_writable) stream.

The value returned from `m.bundle()` will be the end result of piping the original source bundles through all `pipeTo` values, if specified.

#### bopts.objectMode
_Type_: boolean  
_Default_: false

Requests that the output bundles are streamed in [object mode](http://nodejs.org/api/stream.html#stream_object_mode) rather than as strings/buffers.

**NOTE**: This should only be used if a transform stream in [`pipeTo`](#boptspipeTo) produces an object mode stream, as the streams generated by browserify are *not* in object mode.
Setting `objectMode=true` for a string/buffer stream will cause exceptions.

### stream() -> stream<{name, compiler}>

`stream` returns an object mode stream containing one value per output bundle.
Each item has two properties: `name` and `compiler`.

#### name
_Type_: string

The entry point configuration key for which this compiler was generated.

#### compiler
_Type_: browserify instance

The browserify compiler for this module, pre-populated with any dependency information.

## Example usage with gulp

```js
var gulp = require('gulp');
var multi = require('multi-bundle');
var source = require('vinyl-source-stream');

var entryConfig = {
    common: {
        start: './app/start.js',
        control: {
            stop: './app/stop.js',
            pause: ['./app/pause.js', './app/resume.js']
        }
    },
    oneoff: './app/oneoff.js'
};

gulp.task('bundle', function() {
    return multi(entryConfig).bundle({
        objectMode: true,
        debug: true,
        pipeTo: function (name) { return source(name + '.js'); }
    }).pipe(gulp.dest('./build'));
});
```

The above uses [`vinyl-source-stream`](https://www.npmjs.org/package/vinyl-source-stream) to transform the text-mode browserify bundle into a vinyl file object compatible with `gulp.dest`.

## Contributing

1. Clone git repository

2. `npm install` (will install dev dependencies needed by the next step)

3. `npm start` (will start a file system watcher that will re-lint JavaScript and JSON files + re-run all tests when change is detected)

4. Make changes, don't forget to add tests, submit a pull request.

## License

MIT © [Pandell Technology](http://pandell.com/)
