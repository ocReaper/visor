(function () {
  'use strict';

  angular
    .module('visor.permissions', [])
    .provider('visorPermissions', function () {
      var config = this
        , finishedBeforeCheck;

      config.doBeforeFirstCheck = [];
      config.onNotAllowed = angular.noop;

      config.invokeParameters = [];
      config.getRoute = function () {
        throw new Error('method not implemented');
      };
      finishedBeforeCheck = false;

      this.$get = function ($q, $injector, $location) {
        var onCacheClearListeners = []
          , cachedRoutes = {}
          , VisorPermissions = {};

        VisorPermissions = {
          onRouteChange: onRouteChange,
          getPermissionsFromNext: getPermissionsFromNext,
          checkPermissionsForRoute: checkPermissionsForRoute,
          clearPermissionCache: clearPermissionCache,
          notifyOnCacheClear: notifyOnCacheClear,
          getRoute: config.getRoute,
          invokeParameters: config.invokeParameters,
          invokeNotAllowed: invokeNotAllowed
        };

        return VisorPermissions;

        function getPermissionsFromNext(next) {
          return next.restrict ? [next.restrict] : [];
        }

        function onRouteChange(next, delayChange) {
          var permissions = VisorPermissions.getPermissionsFromNext(next)
            , waitForMe;

          if (!permissions || permissions.length === 0) {
            // don't do beforeChecks without permissions
            return true;
          }
          if (!finishedBeforeCheck) {
            waitForMe = $q.defer();

            delayChange(waitForMe.promise);
            $q
              .all(config.doBeforeFirstCheck.forEach(function (cb) {
                return $injector.invoke(cb);
              }))
              .finally(function () {
                finishedBeforeCheck = true;
                if (handlePermission(next, permissions)) {
                  waitForMe.resolve(true);
                } else {
                  waitForMe.reject(false);
                }
              });
            return 'delayed';
          }

          return handlePermission(next, permissions);
        }

        function checkPermissionsForRoute(routeId) {
          var result = cachedRoutes[routeId]
            , route
            , permissions;

          if (result !== angular.isUndefined) {
            return result;
          }
          route = VisorPermissions.getRoute(routeId);
          if (!route) {
            return undefined;
          }
          permissions = VisorPermissions.getPermissionsFromNext(route);
          result = checkPermissions(permissions);
          cachedRoutes[routeId] = result;
          return result;
        }

        function clearPermissionCache() {
          cachedRoutes = {};
          onCacheClearListeners.forEach(function (handler) {
            handler();
          });
        }

        function notifyOnCacheClear(handler) {
          onCacheClearListeners.push(handler);
          return function () {
            var i = onCacheClearListeners.indexOf(handler);
            if (i !== -1) {
              onCacheClearListeners.splice(i, 1);
            }
          };
        }

        function invokeNotAllowed(notAllowedFn) {
          $injector.invoke(notAllowedFn, null, {restrictedUrl: $location.url()});
        }

        function checkPermissions(permissions) {
          var isAllowed;

          if (!permissions || permissions.length === 0) {
            return true;
          }
          if (!angular.isArray(permissions)) {
            permissions = [permissions];
          }
          isAllowed = true;
          permissions.forEach(function (permission) {
            isAllowed = isAllowed && permission.apply(null, VisorPermissions.invokeParameters);
          });
          return isAllowed;
        }

        function handlePermission(next, permissions) {
          var isAllowed = checkPermissions(permissions);

          if (isAllowed) {
            return true;
          }

          VisorPermissions.invokeNotAllowed(config.onNotAllowed);
          return false;
        }
      };
    });
})();
