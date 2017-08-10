'use strict';

var _ = require('lodash');
var async = require('async');
var linkCheck = require('link-check');
var LinkCheckResult = require('link-check/lib/LinkCheckResult')
var markdownLinkExtractor = require('markdown-link-extractor');
var ProgressBar = require('progress');
var path = require('path');
var fs = require('fs');

const dirs = p => fs.readdirSync(p).filter(f => fs.statSync(`${p}/${f}`).isDirectory())

module.exports = function markdownLinkCheck(markdown, filename, opts, callback) {
    if (arguments.length === 2 && typeof opts === 'function') {
        // optional 'opts' not supplied.
        callback = opts;
        opts = {};
    }

    var bar;
    var linksCollection = _.uniq(markdownLinkExtractor(markdown));
    if (opts.showProgressBar) {
        bar = new ProgressBar('Checking... [:bar] :percent', {
            complete: '=',
            incomplete: ' ',
            width: 25,
            total: linksCollection.length
        });
    }

    async.mapLimit(linksCollection, 5, function (link, callback) {
        // match links like " ../#u-boot-fw-utils"
        if (/(\.\.\/)+#/.test(link)) {

          var searchDirectory = link.substr(0, link.lastIndexOf("../") + 3) + "../"
          var headerOfInterest = link.replace(/\.\.\//g, "")
          headerOfInterest = headerOfInterest.toLowerCase()
          headerOfInterest = headerOfInterest.replace("#", "")
          headerOfInterest = headerOfInterest.replace(/-/g, "\\W")

          var markdownFile = path.normalize(path.join(filename, searchDirectory, "docs.md"))

          fs.readFile(markdownFile, "UTF8", function(err, data) {
            if (err) {

            }

            var headerRegexp = new RegExp("#+\\W" + headerOfInterest + "\\W*", "i")
            callback(null, new LinkCheckResult(link, headerRegexp.test(data) ? 200 : 404, null));
          });

        }

        // we are not testing a URL
        else if (!(/https?:/.test(link))) {
          /*
            This is a little complicated, but the file structure for documentation
            is different than the URL format used on the website.

            For example, a folder: 05.Standalone-deployments will be referenced
            as standalone-deployments in the markdown.

            This code will determine what actual folder "standalone-deployments"
            refers to.
          */
          if (link.startsWith("../")) {
            var pathToCheck = "."
            var searchDirectory = link.substr(0, link.lastIndexOf("../") + 3) + "../"

            //fuzzyPath contains a path which is incorrect (missing leading digit)
            // and is lower case.
            var fuzzyPath = path.normalize(path.join(filename, searchDirectory, link.replace(/\.\.\//g, "")))

            for (let directory of fuzzyPath.split("/")) {

              // ignore anchors in paths. ex: standalone-deployments#How to deploy
              if (directory.indexOf("#") > 0) {
                directory = directory.substr(0, directory.indexOf("#"))
              }

              var originalPath = pathToCheck
              pathToCheck += '/' + directory

              // determine which directory matches the URL defined directory so
              // a local directory like 05.Standalone-deployments will match
              // standalone-deployments

              if (!(fs.existsSync(pathToCheck))) {
                for (let dir of dirs(originalPath)) {
                  var possibleMatchingDirectory = dir.toLowerCase().replace(/^\d+\.\s*/, '')
                  if (directory == possibleMatchingDirectory) {
                    pathToCheck = originalPath + '/' + dir
                  }
                }
              }
            };

            // make sure that the directory we found actually matches!
           callback(null, new LinkCheckResult(link, fs.existsSync(pathToCheck) ? 200 : 404, null));
          }
        } else {

        linkCheck(link, opts, function (err, result) {
            if (opts.showProgressBar) {
                bar.tick();
            }

            // make sure localhost urls are always 'alive'
            if (result.link.search(/localhost/) >= 0) {
              result.status = 'alive'
            }

            callback(err, result);
        });
        }

    }, callback);
};
