(function () {
  'use strict';

  /**
   * @ngdoc overview
   * @name visor.ngRoute
   * @description
   *
   * # Visor.ngRoute
   *
   * `Visor.ngRoute` automatically add supports for permissions in ngRoute, if ngRoute exists.
   *
   */
  angular
    .module('visor.ngRoute', [
      'visor.permissions'
    ])
    .run(function ($rootScope, visorPermissions, $injector) {
      var ngRouteModuleExists
        , $route = null;

      try {
        $route = $injector.get('$route');
        ngRouteModuleExists = true;
      } catch (e) {
        ngRouteModuleExists = false
      }

      if (ngRouteModuleExists) {
        visorPermissions.getRoute = function (routeId) {
          var route;

          for (var path in $route.routes) {
            route = $route.routes[path];
            if (route.regexp.exec(routeId)) {
              return route;
            }
          }
          return null;
        };
        $rootScope.$on('$routeChangeStart', function (e, next) {
          next.resolve = next.resolve || {};
          visorPermissions.onRouteChange(next, function delayChange(promise) {
            next.resolve._visorDelay = function () {
              return promise;
            };
          });
        });
      }
    });
})();
