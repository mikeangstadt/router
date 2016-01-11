var _ = require('lodash');
var url = require('url');
var querystring = require('querystring');
var BasePlugin = require('mixdown-app').Plugin;

if (typeof (global) === 'undefined') {
  var global = typeof (window) === 'undefined' ? {} : window;
}

module.exports = BasePlugin.extend({
  _namespace_default: 'route_generator',

  init: function (options) {
    this._super(options);

    this._options.cache_buster = this._options.cache_buster || Math.ceil(Math.random() * 10000);
  },

  // this allow the manifest to be set if the plugin is used outside of mixdown router.
  // mixdown-router extends this class and overrides this method.
  manifest: function (route_table) {
    if (route_table) {
      this.__route_table__ = route_table;

      _.each(this.__route_table__, function (routeObject) {
        _.each(routeObject.params, function (param) {
          if (_.isEmpty(param.regex)) {
            param.regex = /(.*)/;
          } else if (!(param.regex instanceof RegExp)) {
            param.regex = new RegExp(param.regex);
          }
        });
      });
    }
    return this.__route_table__ || {};
  },

  /**
   * Gets a url object for the given route and parameters.  This is where you put your custom route generation.
   * http://nodejs.org/api/url.html#url_url
   **/
  url: function (route, params) {
    params = params || {};

    var uri = url.parse('');
    var routeObject = this.manifest()[route];

    if (!routeObject) {
      return 'Route Not Found - ' + route;
    }

    // if these are set on the route, then attach them.  This will allow injection of FQ urls.
    // this will allow polyfill of window object when in a browser.
    var location = global.location || {};
    uri.protocol = routeObject.protocol || location.protocol;
    uri.hostname = routeObject.hostname || location.hostname;
    uri.port = routeObject.hasOwnProperty('port') ? routeObject.port : location.port;
    uri.method = routeObject.method || null;
    uri.auth = routeObject.auth || null;

    // map the param fields to querystring as defined in route.
    var queryParams = {};
    var restParams = {};

    // split params into rest/query
    _.each(routeObject.params, function (param, key) {
      if (param.kind === 'rest') {
        restParams[key] = param;
      } else if (param.kind === 'query') {
        queryParams[key] = param;
      }
    });

    uri.query = uri.query || {};
    if (!_.isEmpty(queryParams)) {

      _.each(queryParams, function (param, key) {

        if (params.hasOwnProperty(key) || param['default']) {

          // replace capturing group with value
          var qval = (params.hasOwnProperty(key) && params[key] !== null) ? params[key] : param['default'];
          if (qval != "") {
            uri.query[key] = param.regex.source.replace(/\(.*\)/, qval);
          }
        }

      });
    }

    // build the pathname.
    uri.pathname = '';

    // get url segments
    // drop first element in array, since a leading slash creates an empty segment
    var urlSegments = routeObject.path.split('/');
    urlSegments = urlSegments.length > 0 ? urlSegments.slice(1) : urlSegments;

    // replace named params with corresponding values and generate uri
    _.each(urlSegments, function (segment, i) {

      // is this a REST segment?
      if (/^\??:/.test(segment)) {

        // replace with param value if available.
        var pName = segment.replace(/^\??:/, '');
        var pConfig = restParams[pName];

        if (pConfig && pConfig.kind === 'rest') {

          // this is a rest param. replace the capturing group with our value.
          var pval = params[pName] ? params[pName] : pConfig['default'];
          if (pval) {
            var rx = (pConfig.regex instanceof RegExp) ? pConfig.regex.source : pConfig.regex;
            uri.pathname += '/' + encodeURIComponent(rx.replace(/\(.*\)/, pval)).replace(/(%2f)/gi, '/');
          } else if (segment[0] === '?') {
            uri.pathname += '/';
          }
        }
      } else {

        // just append
        uri.pathname += '/' + segment;
      }
    });

    // do we need to add a cache buster to this?
    if (routeObject.cache_buster) {
      var cb_key = typeof (routeObject.cache_buster) == 'string' ? routeObject.cache_buster : 'v';
      uri.query[cb_key] = this._options.cache_buster;
    }

    uri.search = _.keys(uri.query).length ? '?' + querystring.stringify(uri.query) : null;
    uri.path = uri.pathname + (uri.search || '');
    uri.host = uri.hostname ? (uri.hostname + (uri.port && uri.port != 80 ? ':' + uri.port : '')) : null;

    return uri;
  },

  /**
   * Gets a url as a string for the given route and parameters.  This calls url() and stringifies the route.
   *
   **/
  format: function (route, params) {
    var u = this.url(route, params);
    var routeObject = this.manifest()[route];

    if (routeObject && (routeObject.browser === true || routeObject.browser === 'true')) {
      return u.path;
    }

    return url.format(u);
  }

});
