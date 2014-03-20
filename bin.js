#!/usr/bin/env node

var Q        = require('Q');
var fs       = require('fs');
var mkdirp   = require('mkdirp');
var cp       = require('child_process');
var rewire   = require('rewire');

var Git      = rewire('git-fs');
// hack to remove aggressive caching
Git.__set__('CACHE_LIFE', [100, 100]);

var marked   = require('marked');
var nunjucks = require('nunjucks');

nunjucks.configure('views', { autoescape: false });


var dir = process.cwd();

function markdownInDirectory (path) {
  var files = fs.readdirSync(path).map(prepend(path + '/'));
  return Q.all(files.filter(isMarkdown).map(notDotGitignored)).then(function (first) {
    return Q.all(files.filter(isVisibleDirectory).map(notDotGitignored)).then(function (nested) {
      return Q.all(nested.filter(identity).map(markdownInDirectory)).then(function (nested) {
        return first.concat(flatten(nested));
      });
    });
  });
}

function isVisibleDirectory (path) {
  return isDirectory(path) && notHidden(path);
}

function isDirectory (path) {
  return fs.lstatSync(path).isDirectory();
}

function notHidden (path) {
  return path[0] !== '.';
}

var MARKDOWN_REGEX = /(.+)\.md$/

function isMarkdown (path) {
  return MARKDOWN_REGEX.test(path);
}

function notDotGitignored (path) {
  // git check-ignore <file>
  // returns the path if the file is ignored
  // returns nothing if the file is not ignored
  var deferred = Q.defer();
  cp.exec('git check-ignore ' + path.substr(dir.length+1), {cwd: dir}, function (err, stdout) {
    deferred.resolve(err && !stdout && path);
  });
  return deferred.promise;
}

function flatten (array) {
  return array.reduce(concat, []);
}

function prepend (prepended) {
  return function (string) {
    return prepended + string;
  };
}

function concat (first, second) {
  return first.concat(second);
}

function truth () {
  return true;
}

function identity (x) {
  return x;
}

function extensionless (path) {
  return path.substr(0, path.length - 3);
}

function directory (path) {
  var d = path.split('/');
  d.splice(-1);
  return d.join('/');
}

Git(dir);

var TITLE = /#[ ]?(.+)/;

markdownInDirectory(dir).
  then(function (files) {
    files.forEach(function (file) {
      Git.log(file, function (err, shas) {
        shas.fs = { date: (shas[Object.keys(shas).pop()] || {}).date || new Date() };
        Object.keys(shas).forEach(function (sha) {
          Git.readFile(sha, file.substr(dir.length+1), 'utf8', function (err, data) {
            var outFile = './build/' + extensionless(file.substr(dir.length+1)) + '/' + (sha === 'fs' ? 'index' : sha) + '.html';
            mkdirp.sync(directory(outFile));
            data && fs.writeFileSync(outFile,
              nunjucks.render('index.html', {
                title: (data.match(TITLE) || [])[1] || '',
                content: marked(data.replace(TITLE, '')),
                date: shas[sha].date
              }));
          });
        });
      });
    });
  }).
  catch(function (err) {
    console.log(err, err.stack)
  })

