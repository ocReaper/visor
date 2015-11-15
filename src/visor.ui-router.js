(function () {
  'use strict';

  angular
    .module('visor.ui-router', [
      'visor.permissions'
    ])
    .run(function ($rootScope, visorPermissions, $injector, $timeout) {
      var uiModuleExists
        , toUrl
        , bypass;

      try {
        $injector.get('$state');
        uiModuleExists = true;
      } catch (e) {
        uiModuleExists = false;
      }

      if (!uiModuleExists) {
        return angular.noop;
      }

      $injector.invoke(function ($state) {
        //  we need to check parent states for permissions as well
        visorPermissions.getPermissionsFromNext = function (next) {
          var perms = []
            , chain
            , parent;

          while (next) {
            if (next.restrict) {
              perms.unshift(next.restrict);
            }

            if (next.parent) {
              next = $state.get(next.parent);
            } else if (next.name.indexOf('.') > 0) {
              chain = next.name.split('.');
              // remove the leftmost
              chain.pop();
              parent = chain.join('.');
              next = $state.get(parent);
            } else {
              next = null;
            }
          }
          return perms;
        };

        toUrl = null;
        bypass = false;

        $rootScope.$on('$stateChangeStart', function (e, toState, toParams) {
          var shouldContinue;

          if (bypass) {
            bypass = false;
            return;
          }
          toUrl = $state.href(toState, toParams).replace(/^#/, '');
          shouldContinue = visorPermissions.onRouteChange(toState, function delayChange(promise) {
            promise.then(function () {
              bypass = true;
              $state.go(toState, toParams);
            });
          });
          if (!shouldContinue || shouldContinue === 'delayed') {
            e.preventDefault();
          }
        });
        visorPermissions.invokeNotAllowed = function (notAllowed) {
          // timeout is required because when using preventDefault on $stateChangeStart, the url is
          // reverted to it's original location, and no change at this time will override this.
          $timeout(function () {
            $injector.invoke(notAllowed, null, {restrictedUrl: toUrl});
          }, 0);
        };

        visorPermissions.getRoute = function (routeId) {
          return $state.get(routeId);
        };
      });
    });
})();
