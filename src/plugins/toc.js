var fs = require('fs');
var through = require('through2');
var cheerio = require('cheerio');
var tinyliquid = require('tinyliquid');
var helpers = require('../helpers/helpers');
var htmlbookHelpers = require('../helpers/htmlbook');
var streamHelpers = require('../helpers/stream');
var _ = require('lodash');

var Plugin = function(registry) {
  registry.before('liquid', 'toc:placeholders', _.bind(this.insertPlaceholders, this));
  registry.after('ids', 'toc:generate', _.bind(this.generateTOC, this));
  registry.after('layouts', 'toc:insert', _.bind(this.insertTOC, this));
};

var levels = {
  "chapter" : 0,
  "appendix" : 0,
  "afterword" : 0,
  "bibliography" : 0,
  "glossary" : 0,
  "preface" : 0,
  "foreword" : 0,
  "introduction" : 0,
  "acknowledgments" : 0,
  "afterword" : 0,
  "conclusion" : 0,
  "part" : 0,
  "index" : 0,
  "sect1": 1,
  "sect2": 2,
  "sect3": 3,
  "sect4": 4,
  "sect5": 5
};

var placeHolder = "MBINSERT:TOC"
var maxLevel = 3;

// takes an element and finds all direct section in its children.
// recursively calls itself on all section children to get a tree
// of sections.
function getSections($, root, href) {

  var items = [];

  var sections = root.children("section[data-type], div[data-type='part']");

  sections.each(function(index, el) {

    var jel = $(el);
    var header = jel.find("> header");

    // create section item
    var item = {
      id: jel.attr("id"),
      type: jel.attr("data-type")
    };

    // find title of section
    var title = header.length ? header.find("> h1, > h2, > h3, > h4, > h5") : jel.find("> h1, > h2, > h3, > h4, > h5");
    if(title.length) {
      item.label = title.first().text();
    }

    // find level of section
    var level;
    if(item.type in levels) {
      level = levels[item.type];
    } else {
      return;
    }

    // find href of section
    item.href = href + "#" + item.id;

    if(level <= maxLevel) {
      item.children = getSections($, jel, href);
    }

    items.push(item);
  });

  return items;
}

Plugin.prototype = {

  // When the files are loaded, we add a liquid local that simply
  // replace {{ toc }}  with a string placeholder. This is needed because
  // liquid runs before markdown conversion, and the TOC is generated after
  // markdown conversion. So in a later hook, we generate the TOC and insert
  // the TOC instead of the placeholder.
  insertPlaceholders: function(config, stream, extras, callback) {

    stream = stream.pipe(through.obj(function(file, enc, cb) {
      _.set(file, "pageLocals.toc", placeHolder);
      _.set(file, "layoutLocals.toc", placeHolder);
      cb(null, file);
    }));

    callback(null, config, stream, extras);
  },

  // When the files have been converted, we run the TOC generation.
  // This is happening before the layouts, because it won't work if
  // the markup is wrapped in container div's. We should rewrite the
  // TOC generation to work with this.
  generateTOC: function(config, stream, extras, callback) {

    var tocFiles = this.tocFiles = [];

    // First run through every file and get a tree of the section
    // navigation within that file. Save to our nav object.
    stream = stream.pipe(through.obj(function(file, enc, cb) {

      // create cheerio element for file if not present
      file.$el = file.$el || cheerio.load(file.contents.toString());

      // make this work whether or not we have a
      // full HTML file.
      var root = file.$el.root();
      var body = file.$el('body');
      if(body.length) root = body;

      // add sections to plugin array for use later in the pipeline
      tocFiles.push({
        file: file,
        sections: getSections(file.$el, root, config.format == "pdf" ? '' : file.relative)
      });

      cb(null, file);
    }));

    callback(null, config, stream, extras);
  },

  insertTOC: function(config, stream, extras, callback) {

    var tocFiles = this.tocFiles;

    // wait for the stream to finish, knowing all files have been
    // parsed, and start a new stream that replaces all placeholders.
    streamHelpers.finishWithFiles(stream, function(files) {

      var curPart;
      var toc = {
        type: 'book',
        children: []
      };

      // searches for a part in the toc children.
      function findPart(part, parent) {
        for(var i = 0; i < parent.children.length; i++) {
          var child = parent.children[i];
          if(!_.isString(child)) {
            if(child.label === part.label) {
              return child;
            } else {
              var found = findPart(part, child);
              if(found) return found;
            }
          }
        }
        return false;
      }

      function findOrCreatePart(file) {

        // if this part already exists
        var found = findPart(file.part, toc);
        if(found) return found;

        // if this part does not exist
        // if parent, find parent that MUST exist because
        // things are in order
        found = { label: file.part.label, children: [] }
        if(file.parentPart) {
          findPart(file.parentPart, toc).children.push(found);
        } else {
          toc.children.push(found);
        }

        return found;
      }

      // loop through all sections and assemble parts.
      _.each(tocFiles, function(f) {

        // if no part, just add to toc children
        if(!f.file.part) {
          toc.children = toc.children.concat(f.sections);
        }

        // if part, find or create part
        else {
          var part = findOrCreatePart(f.file);
          part.children = part.children.concat(f.sections);
        }

      });

      // create new stream from the files
      stream = streamHelpers.streamFromArray(files)

      // loop through each file and replace placeholder
      // with toc include.
      // check if there is a placeholder, and then fail if there is
      // no include names toc.html
      .pipe(through.obj(function(file, enc, cb) {

        // only if this file has the placeholder
        if(file.contents.toString().match(placeHolder)) {

          var tmpl = tinyliquid.compile("{% include toc.html %}");
          var locals = { toc: toc };
          var includes = _.get(file, "pageLocals.page.includes") || config.liquid.includes;

          helpers.renderLiquidTemplate(tmpl, locals, includes, function(err, data) {

            // now replace the placeholder with the rendered liquid
            // in the file.
            var content = file.contents.toString();
            file.contents = new Buffer(content.replace(placeHolder, data.toString()));
            file.$el = undefined;

            cb(err, file);
          });

        } else {
          cb(null, file);
        }

      }));

      callback(null, config, stream, extras);
    });
  }
}

module.exports = Plugin;
