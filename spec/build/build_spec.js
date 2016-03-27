var _ = require('lodash');
var rimraf = require('rimraf');

beforeAll(function(done) {
  rimraf("spec/support/book/tmp/*", function() {
    done();
  });
});

describe("All Formats", function() {

  describe("Frontmatter", function() {

    it("should retrieve frontmatter from file and pass to liquid", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        success: function() {
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("Frontmatter test is working");
          done();
        }
      });
    });

  });

  describe("Markdown", function() {

    it("should convert markdown files", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        success: function() {
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("First Heading</h1>");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Second Heading</h1>");
          done();
        }
      });
    });

  });

  describe("Layout", function() {

    it("should ignore layout", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        success: function() {
          expect(buildPath(uid, "html/first-chapter.html")).not.toHaveContent("Main layout");
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("First Heading</h1>");
          expect(buildPath(uid, "html/second-chapter.html")).not.toHaveContent("Main layout");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Second Heading</h1>");
          done();
        }
      });
    });

    it("should use main layout", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        layout: "spec/support/book/layouts/main.html",
        success: function() {
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("Main layout");
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("First Heading</h1>");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Main layout");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Second Heading</h1>");
          done();
        }
      });
    });

    it("should prioritize format layout", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        layout: "spec/support/book/layouts/main.html",
        formats: {
          html : {
            layout: "spec/support/book/layouts/format.html"
          }
        },
        success: function() {
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("Format layout");
          expect(buildPath(uid, "html/first-chapter.html")).toHaveContent("First Heading</h1>");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Format layout");
          expect(buildPath(uid, "html/second-chapter.html")).toHaveContent("Second Heading</h1>");
          done();
        }
      });
    });

  });

  describe("Destination", function() {

    it("should prioritize format destination", function(done) {
      var uid = triggerBuild({
        enabledFormats: ["html"],
        formats: {
          html : {
            destination: "spec/support/book/tmp/abcdef/myhtml",
          }
        },
        success: function() {
          expect(buildPath('abcdef', "myhtml/first-chapter.html")).toHaveContent("First Heading</h1>");
          done();
        }
      });
    });

  });

});
