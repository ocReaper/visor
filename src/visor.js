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

      this.$get = function ($injector, $q, $rootScope, $location, visorPermissions) {
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
      };
    })
    .config(function (visorPermissionsProvider) {
      visorPermissionsProvider.doBeforeFirstCheck.push(['visor', function (visor) {
        return visor.authenticate();
      }]);
      visorPermissionsProvider.onNotAllowed = ['visor', 'restrictedUrl', function (visor, restrictedUrl) {
        visor.onNotAllowed(restrictedUrl);
      }];
    })
    .run(function (visor, delayLocationChange) {
      if (visor.config.authenticateOnStartup) {
        delayLocationChange(visor.authenticate());
      }
    });
})();
