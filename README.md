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
│   └── c.md
└── views
    └── index.html
```

[nunjucks](http://jlongster.github.io/nunjucks/) parses `views/index.html` interpolating
the stuff from your markdown files as appropriate.

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


## building

run `quinoa` in the root of a git repo

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

that's all


## fyi

* only works in `git` repos for now
* follows your gitignore rules


## license
MIT
