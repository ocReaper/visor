/**visor
* Angular authentication and authorization library
* @version v0.1.2
* @link  https://github.com/illniyar/visor.git
* @license MIT License, http://www.opensource.org/licenses/MIT
*/
if (typeof module !== 'undefined' && typeof exports !== 'undefined' && module.exports === exports){
 module.exports = 'visor';
}

(function (window, angular, undefined) {
(function () {
  'use strict';

  angular
    .module('delayLocationChange', [])
    .service('delayLocationChange', ["$rootScope", "$q", "$timeout", "$location", "$injector", function ($rootScope, $q, $timeout, $location, $injector) {
        var unfinishedPromises
          , waitingFunctions
          , changeStarted
          , _toUrl
          , _fromUrl
          , nextUrl
          , unlisten;

        function service(arg) {
          if (arg.then) {
            // handles a promise
            addPromise(arg);
          } else {
            // assume it's a function
            if (changeStarted) {
              addPromise($injector.invoke(fn));
            } else {
              // need to wait until angular started the locationChange, otherwise
              // something might start running before it's should
              waitingFunctions.push(arg);
            }
          }
        }

        //  we make sure that all promises finish by counting the number of promises
        // we recieved
        unfinishedPromises = 0;
        waitingFunctions = [];
        changeStarted = false;

        // checkPromises both determines if all promises were resolved and initiates
        // the delayed location change if no more promises remain
        function checkPromises() {
          unfinishedPromises--;
          if (changeStarted && unfinishedPromises <= 0) {
            reloadChange();
          }
        }

        function reloadChange() {
          if ($location.absUrl() === _toUrl) {
            // we are running on the assumption (that might prove false at some point)
            // that nothing happens between canceling $locationChangeStart and emitting
            // $locationChangeSuccess
            $rootScope.$broadcast('$locationChangeSuccess', _toUrl, _fromUrl);
          } else {
            $location.url(nextUrl);
          }
        }

        function addPromise(promise) {
          unfinishedPromises++;
          // to access using array notation because finally is a reserved word
          promise.finally(checkPromises);
        }

        unlisten = $rootScope.$on('$locationChangeStart', function (e, toUrl, fromUrl) {
          changeStarted = true;
          nextUrl = $location.url();
          unlisten();
          // We are relying on the fact that since the url never actually changed,
          // the fact that angular will return to the previous ulr when doing preventDefault, will not
          //  have any effect
          e.preventDefault();
          waitingFunctions.forEach(function (fn) {
            addPromise($injector.invoke(fn));
          });

          if (unfinishedPromises === 0 && !_toUrl) {
            // firstCall and no promises
            // we need to let at least one run through to verify
            // no promises will be added
            unfinishedPromises++;
            $timeout(checkPromises, 1);
          }
          _toUrl = toUrl;
          _fromUrl = fromUrl;
        });

        return service;
      }]
    );
})();

(function () {
  'use strict';

  angular
    .module('visor.allowed', [
      'visor.permissions'
    ])
    .directive('showIfAllowed', ["visorPermissions", "$animate", function (visorPermissions, $animate) {
      return {
        restrict: 'A',
        link: function (scope, element, attr) {
          var unListen = visorPermissions.notifyOnCacheClear(function () {
            syncElement(attr.showIfAllowed);
          });

          function syncElement(value) {
            // Copied from ngHideDirective (v1.3.13)
            var allowed = visorPermissions.checkPermissionsForRoute(value);
            $animate[allowed ? 'removeClass' : 'addClass'](element, 'ng-hide', {
              tempClasses: 'ng-hide-animate'
            });
          }

          attr.$observe('showIfAllowed', syncElement);
          scope.$on('$destroy', unListen);
        }
      };
    }])
    .directive('classIfRestricted', ["visorPermissions", "$animate", function (visorPermissions, $animate) {
      return {
        restrict: 'A',
        link: function (scope, element, attr) {
          var unListen = visorPermissions.notifyOnCacheClear(function () {
            syncElement(attr.classIfRestricted);
          });

          function syncElement(value) {
            var allowed = visorPermissions.checkPermissionsForRoute(value);
            $animate[!allowed ? 'addClass' : 'removeClass'](element, attr.restrictedClass || 'visor-restricted');
          }

          attr.$observe('classIfRestricted', syncElement);
          scope.$on('$destroy', unListen);
        }
      };
    }]);
})();

(function () {
  'use strict';

  angular
    .module('visor', [
      'visor.permissions',
      'visor.ui-router',
      'visor.ngRoute',
      'delayLocationChange',
      'visor.allowed'
    ])
    .constant('authenticatedOnly', function (authData) {
      return !!authData;
    })
    .constant('notForAuthenticated', function (authData) {
      return authData === angular.isUndefined;
    })
    .provider('visor', function () {
      var config = this;
      config.authenticateOnStartup = true;
      config.loginRoute = '/login';
      config.homeRoute = '/';
      config.notAuthorizedRoute = '/access_denied';
      config.shouldAddNext = true;
      config.authenticate = function () {
        throw new Error('visorProvider.authenticate must be defined to use visor');
      };
      config.doOnNotAuthenticated = ['$location', 'restrictedUrl', function ($location, restrictedUrl) {
        $location.path(config.loginRoute).search('next', restrictedUrl);
      }];
      config.doAfterManualAuthentication = ['$location', function ($location) {
        $location.url($location.search().next || config.homeRoute);
      }];
      config.doOnNotAuthorized = ['$location', function ($location) {
        $location.url(config.notAuthorizedRoute);
      }];

      this.$get = ["$injector", "$q", "$rootScope", "$location", "visorPermissions", function ($injector, $q, $rootScope, $location, visorPermissions) {
        var mainAuthenticationPromise = false
          , Visor = {};

        function onAuthenticationSuccess(authData) {
          Visor.authData = authData;
          visorPermissions.invokeParameters = [Visor.authData];
          visorPermissions.clearPermissionCache();
        }

        function onAuthenticationFailed() {
          Visor.authData = undefined;
          visorPermissions.invokeParameters = [];
          visorPermissions.clearPermissionCache();
        }

        Visor = {
          authenticate: function (retry) {
            var deferred = $q.defer();

            if (mainAuthenticationPromise && !retry) {
              return mainAuthenticationPromise;
            }

            mainAuthenticationPromise = deferred.promise;

            $injector
              .invoke(config.authenticate)
              .then(onAuthenticationSuccess, onAuthenticationFailed)
              .finally(function () {
                deferred.resolve(Visor.authData);
              });

            return deferred.promise;
          },
          setAuthenticated: function (authData) {
            onAuthenticationSuccess(authData);
            mainAuthenticationPromise = $q.when(authData);
            $injector.invoke(config.doAfterManualAuthentication, null, {authData: authData});
          },
          isAuthenticated: function () {
            return !!Visor.authData;
          },
          onNotAllowed: function (restrictedUrl) {
            if (Visor.isAuthenticated()) {
              $injector.invoke(config.doOnNotAuthorized, null, {restrictedUrl: restrictedUrl});
            } else {
              $injector.invoke(config.doOnNotAuthenticated, null, {restrictedUrl: restrictedUrl});
            }
          },
          setUnauthenticated: function () {
            onAuthenticationFailed();
          },
          config: config
        };
        return Visor;
      }];
    })
    .config(["visorPermissionsProvider", function (visorPermissionsProvider) {
      visorPermissionsProvider.doBeforeFirstCheck.push(['visor', function (visor) {
        return visor.authenticate();
      }]);
      visorPermissionsProvider.onNotAllowed = ['visor', 'restrictedUrl', function (visor, restrictedUrl) {
        visor.onNotAllowed(restrictedUrl);
      }];
    }])
    .run(["visor", "delayLocationChange", function (visor, delayLocationChange) {
      if (visor.config.authenticateOnStartup) {
        delayLocationChange(visor.authenticate());
      }
    }]);
})();

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
    .run(["$rootScope", "visorPermissions", "$injector", function ($rootScope, visorPermissions, $injector) {
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
    }]);
})();

(function () {
  'use strict';

  angular
    .module('visor.permissions', [])
    .provider('visorPermissions', function () {
      var config = this
        , finishedBeforeCheck;

      config.getPermissionsFromNext = function (next) {
        return next.restrict ? [next.restrict] : [];
      };

      config.doBeforeFirstCheck = [];
      config.onNotAllowed = angular.noop;

      config.invokeParameters = [];
      config.getRoute = function () {
        throw new Error('method not implemented');
      };
      finishedBeforeCheck = false;

      this.$get = ["$q", "$injector", "$location", function ($q, $injector, $location) {
        var onCacheClearListeners = []
          , cachedRoutes = {}
          , VisorPermissions = {};

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

        onCacheClearListeners = [];
        cachedRoutes = {};
        VisorPermissions = {

          onRouteChange: function (next, delayChange) {
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
          },
          getPermissionsFromNext: config.getPermissionsFromNext,
          checkPermissionsForRoute: function (routeId) {
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
          },
          clearPermissionCache: function () {
            cachedRoutes = {};
            onCacheClearListeners.forEach(function (handler) {
              handler();
            });
          },
          notifyOnCacheClear: function (handler) {
            onCacheClearListeners.push(handler);
            return function () {
              var i = onCacheClearListeners.indexOf(handler);
              if (i !== -1) {
                onCacheClearListeners.splice(i, 1);
              }
            };
          },
          getRoute: config.getRoute,
          invokeParameters: config.invokeParameters,
          invokeNotAllowed: function (notAllowedFn) {
            $injector.invoke(notAllowedFn, null, {restrictedUrl: $location.url()});
          }
        };
        return VisorPermissions;
      }];
    });
})();

(function () {
  'use strict';

  angular
    .module('visor.ui-router', [
      'visor.permissions'
    ])
    .run(["$rootScope", "visorPermissions", "$injector", "$timeout", function ($rootScope, visorPermissions, $injector, $timeout) {
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

      $injector.invoke(["$state", function ($state) {
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
      }]);
    }]);
})();
})(window, window.angular);