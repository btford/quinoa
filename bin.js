#!/usr/bin/env node

var Q        = require('q');
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


/*
 * read config options
 */
var argv            = require('minimist')(process.argv.slice(1));

// aboslute path to the input files
// all of these paths are absolute
var inputDirectory    = path.resolve(argv._[1] || '');
var outputDirectory   = path.resolve(argv.o || 'build');
var gitRootDirectory  = getGitRoot(inputDirectory);

function getNunjucksEnviornment () {
  var env = nunjucks.configure(inputDirectory);
  env.addFilter('markdown', function (str) {
    return marked(str);
  });
  env = hackNunjucksEnviornment(env);
  return env;
}

// modifies env with a "pre-render" step
function hackNunjucksEnviornment (env) {
  var originalRender = env.render;
  env._preRenderSteps = [];
  env.addPrerender = function (fn) {
    env._preRenderSteps.push(fn);
  };
  env.render = function hackedRender (view, data) {
    for (var i = 0, ii = env._preRenderSteps.length; i < ii; i += 1) {
      data = env._preRenderSteps[i](data) || data;
    }
    arguments[1] = data;
    return originalRender.apply(env, arguments);
  };
  return env;
}

// init the git-fs helper
Git(gitRootDirectory);

// given an absolute path, return an absolute path representing
// the immediate git repo of that path
function getGitRoot (somePath) {
  try {
    return ascend(somePath, isGitRepo);
  } catch (e) {
    throw new Error('looks like `' + somePath + '` is\'nt within a git repo');
  }
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
  cp.exec('git check-ignore ' + gitRootRelative(path), {cwd: gitRootDirectory}, function (err, stdout) {
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

function outputDirectoryRelative (file) {
  return file.substr(outputDirectory.length+1);
}

function isGitRootDirectory (thisPath) {
  return thisPath === gitRootDirectory;
}

function inputDirectoryRelative (file) {
  return file.substr(inputDirectory.length+1);
}

function outFilePath (file, sha) {
  var originalFileName = extensionless(inputDirectoryRelative(file));
  return path.join.apply(null, [
      outputDirectory,
      originalFileName === 'index' ? '' : originalFileName,
      sha + '.html'
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

function findView (somePath) {
  return path.join(ascendUntil(somePath, function (thisPath) {
    return fs.existsSync(path.join(thisPath, 'view.html'));
  }, isGitRootDirectory), 'view.html');
}

function findAllHacks (somePath) {
  return ascendFilterWithinGitRepo(somePath, function (someFile) {
    var hackPath = path.join(someFile, 'hack.js');
    if (fs.existsSync(hackPath)) {
      return require(hackPath);
    }
  })
}

// traverse up a directory until you find a directory that
// matches the criteria
function ascend (somePath, criteria) {
  var segments = somePath.split(path.sep),
      maybeMatchingPath;

  while (!criteria(maybeMatchingPath = '/' + path.join.apply(null, segments))) {
    if (segments.length > 0) {
      segments.pop();
    } else {
      throw new Error('can\'t find a matching directory');
    }
  }
  return maybeMatchingPath;
}

function ascendFilterWithinGitRepo (somePath, predicate) {
  return ascendFilterUntil(somePath, predicate, isGitRootDirectory);
}

function ascendFilterUntil (somePath, predicate, until) {
  var filter = [];
  ascend(somePath, function (thisPath) {
    var mapping = predicate(thisPath);
    if (mapping) {
      filter.push(mapping);
    }
    return until(thisPath);
  });
  return filter;
}

function ascendUntil (somePath, primary, until) {
  var maybeMatchingPath = ascend(somePath, function (thisPath) {
    return primary(thisPath) || until(thisPath);
  });

  return primary(maybeMatchingPath) && maybeMatchingPath;
}

function render (file, locals) {
  var view = findView(file);

  var env = getNunjucksEnviornment();

  var hacks = findAllHacks(file);

  for (var i = hacks.length - 1; i >= 0; i -= 1) {
    hacks[i](env);
  }

  locals.date = locals.date || locals.shas[locals.sha].date;
  locals.title = locals.title || title(locals.content);

  return env.render(inputDirectoryRelative(view), locals);
}

function fileToPages (file) {
  var deferred = Q.defer();
  var pages = [];
  Git.log(file, function (err, shas) {
    shas.index = { date: (shas[Object.keys(shas).pop()] || {}).date || new Date() };
    var numberOfShas = Object.keys(shas).length;
    Object.keys(shas).forEach(function (sha) {
      var outFile = outFilePath(file, sha);
      Git.readFile(sha === 'index' ? 'fs' : sha, gitRootRelative(file), 'utf8', function (err, content) {
        if (err) {
          return deferred.reject(err);
        }
        pages.push({
          outFile: outFile,
          outPath: outputDirectoryRelative(outFile),
          sha: sha,
          shas: shas,
          file: file,
          content: content
        });
        if (pages.length === numberOfShas) {
          deferred.resolve(pages);
        }
      });
    });
  });
  return deferred.promise;
}

markdownInDirectory(inputDirectory).
  then(function (files) {
    Q.all(files.map(fileToPages)).then(flatten).then(function (pages) {
      pages.forEach(function (page) {
        page.pages = pages;
        try {
          seriouslyWriteThisFile(page.outFile,
              render(page.file, page));
        } catch (e) {
          console.log('could not write ' + page.outFile);
        }
      });
    });
  }).
  catch(function (err) {
    console.log(err, err.stack)
  })
