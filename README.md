# quinoa

static site generator with versioning inspired by [wheat](https://github.com/creationix/wheat)


## install

```
npm install -g quinoa
```


## the setup

you need this directory layout:

```
├── a.md
├── b.md
├── sub
│   ├── c.md
│   └── view.html
├── sub-two
│   └── d.md
└── view.html
```

[nunjucks](http://jlongster.github.io/nunjucks/) parses the nearest `view.html` interpolating
the content your markdown files as appropriate.

In the above example, `a.md`, `b.md`, and `d.md` use `view.html` as a template.
`sub/c.md` uses `sub/view.html` as a template.

### templates

A template looks like this:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>blog – {{ title }}</title>
</head>
<body>
  <h1>{{ title }}</h1>
  <p>{{ date }}</p>
  <article>{{ content }}</article>
</body>
</html>
```

### hacks
`quinoa` lets you customize the behavior of your site with hacks.

A `hack.js` file looks like this:

```javascript
module.exports = function (env) {
  env.addFilter( ... );
  env.addExtension( ... );
  env.addPrerender( ... );
};
```

hacks can use any of methods in nunjuck's [enviornment API](http://jlongster.github.io/nunjucks/api.html#environment).
most commonly you'll want to use [`env.addFilter`](http://jlongster.github.io/nunjucks/api.html#addfilter) or [`env.addExtension`](http://jlongster.github.io/nunjucks/api.html#addfilter) to extend templates.

`quinoa` adds one method to the nunjuck enviornment – `env.addPrerender`.
this method takes a function which can modify template locals before `env.render` is called.

quinoa applies hacks from the base of the git repo downward to the level of each template.

```
├── a.md
├── hack.js
├── sub
│   ├── b.md
│   └── hack.js
└── view.html
```

in the above example, `a.md` will apply `hack.js`, and `b.md` will apply `hack.js` then `sub/hack.js`.


## building

run `quinoa` from within a git repo

you'll get something like this:

```
├── build
│   ├── a
│   │   ├── a3eb6baf58f779c0ac9780eb8949d11fba40e483.html
│   │   ├── d3952b79c7d3fe024ba2cf886dc9225d3107d342.html
│   │   └── index.html
│   ├── b
│   │   ├── f61709a29ec6f1353f2a3c1adb2631e71bb33cd3.html
│   │   └── index.html
│   └── sub
│       └── b
│           ├── af285dd370aa1b6779bf67ac3bdc19da512aaac5.html
│           ├── 29ec6f1353f2a3c1adb2631f61709ae71bb33cd3.html
│           └── index.html
├── a.md
├── b.md
├── sub
│   └── c.md
└── views
    └── index.html
```

the `index.html` files correspond to the state of the file on the disk.
the sha-lookin' `.html` files correspond to revisions of those files.

use something like [nginx](http://nginx.org/) to serve the files.

that's all


## fyi

`quinoa`:

* only works in `git` repos for now
* follows your gitignore rules


## license
MIT
