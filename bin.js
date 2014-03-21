#!/usr/bin/env node

var Q        = require('Q');
var fs       = require('fs');
var mkdirp   = require('mkdirp');
var cp       = require('child_process');
var path     = require('path');
var rewire   = require('rewire');

var Git      = rewire('git-fs');
// hack to remove aggressive caching
Git.__set__('CACHE_LIFE', [100, 100]);

var marked   = require('marked');
var nunjucks = require('nunjucks');

nunjucks.configure('views', { autoescape: false });

/*
 * read config options
 */
var argv            = require('minimist')(process.argv.slice(1));

// aboslute path to the input files
// all of these paths are absolute
var inputDirectory    = path.resolve(argv._[1]);
var outputDirectory   = path.resolve(argv.o || 'build');
var gitRootDirectory  = getGitRoot(inputDirectory);

// init the git-fs helper
Git(gitRootDirectory);

// given an absolute path, return an absolute path representing
// the immediate git repo of that path
function getGitRoot (somePath) {
  var segments = somePath.split(path.sep),
      maybeGitRootPath;

  while (!isGitRepo(maybeGitRootPath = '/' + path.join.apply(null, segments))) {
    if (segments.length > 0) {
      segments.pop();
    } else {
      throw new Error('looks like `' + somePath + '` is\'nt within a git repo');
    }
  }
  return maybeGitRootPath;
}

function isGitRepo (file) {
  return fs.existsSync(path.join(file, '.git'));
}



function markdownInDirectory (path) {
  var files = fs.readdirSync(path).map(prepend(path));
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

function notHidden (file) {
  return file[0] !== '.';
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
  cp.exec('git check-ignore ' + path.substr(gitRootDirectory.length+1), {cwd: gitRootDirectory}, function (err, stdout) {
    deferred.resolve(err && !stdout && path);
  });
  return deferred.promise;
}

function flatten (array) {
  return array.reduce(concat, []);
}

function prepend (prepended) {
  return function (string) {
    return path.join(prepended, string);
  };
}

function concat (first, second) {
  return first.concat(second);
}

function identity (x) {
  return x;
}

function extensionless (path) {
  return path.substr(0, path.length - 3);
}

function gitRootRelative (file) {
  return file.substr(gitRootDirectory.length+1);
}

function inputDirectiveRelative (file) {
  return file.substr(inputDirectory.length+1);
}

function outFilePath (file, sha) {
  var originalFileName = extensionless(inputDirectiveRelative(file));
  return path.join.apply(null, [
      outputDirectory,
      (originalFileName === 'index' && originalFileName) || '',
      (sha === 'fs' ? 'index' : sha) + '.html'
  ]);
}

var TITLE = /#[ ]?(.+)/;

function title (markdown) {
  return (markdown.match(TITLE) || [])[1] || '';
}

function seriouslyWriteThisFile (file, contents) {
  mkdirp.sync(path.dirname(file));
  fs.writeFileSync(file, contents);
}

markdownInDirectory(inputDirectory).
  then(function (files) {
    files.forEach(function (file) {
      Git.log(file, function (err, shas) {
        shas.fs = { date: (shas[Object.keys(shas).pop()] || {}).date || new Date() };
        Object.keys(shas).forEach(function (sha) {
          Git.readFile(sha, gitRootRelative(file), 'utf8', function (err, data) {
            var outFile = outFilePath(file, sha);
            seriouslyWriteThisFile(outFile,
              nunjucks.render('index.html', {
                title: title(data),
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

